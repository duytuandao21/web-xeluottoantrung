// Actual header navigation against isolated read-only content fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const result = { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } };
const api = createServer((request, response) => {
  const path = new URL(request.url, 'http://fixture.test').pathname;
  let data = result, status = 200;
  if(path === '/api/v1/content' || path === '/api/v1/brands' || path.startsWith('/api/v1/site-settings/')) data = [];
  else if(path === '/api/v1/promotions/popup') data = null;
  else if(path === '/api/v1/seo' || /^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)) { status = 404; data = {}; }
  response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));
let child, browser;
try {
  await listen(api); const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const reservation = createServer(); await listen(reservation); const port = reservation.address().port;
  await new Promise(done => reservation.close(done)); const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', String(port)], { windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: apiUrl } });
  for(let attempt = 0; ; attempt++) {
    if(child.exitCode !== null) throw Error('Next exited');
    try { if((await fetch(`${base}/khuyen-mai`, { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
    if(attempt > 45) throw Error('Next unavailable'); await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  
  await mkdir('artifacts/sell-menu',{recursive:true});
  for(const width of [1440,1024,390,320]) {
    const mobile=width<=960,page=await browser.newPage({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/api/v1/')){const response=await fetch(apiUrl+url.pathname+url.search);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
    const root=page.locator(mobile?'.tt-mobile-menu .menu-selling':'.hidden_m .menu-selling'),panel=root.locator('.menu-selling-panel');
    const open=async()=>{if(mobile){if(!await page.locator('.tt-mobile-menu').evaluate(el=>el.classList.contains('menu_mobi_active')))await page.locator('.icon_menu_mobi').tap();const toggle=root.locator('.mobile-submenu-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.tap();}else await root.locator(':scope > a').hover();await panel.waitFor({state:'visible'});await page.waitForTimeout(250);};
    await page.goto(base+'/khuyen-mai',{waitUntil:'networkidle'});await open();
    const links=panel.locator(':scope > li > a');assert.equal(await links.count(),2);assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('href'))),['/ban-xe','/len-doi']);
    assert.equal(await panel.locator('img, svg').count(),0);assert.equal(await panel.locator('.menu-simple-arrow').count(),2);
    const first=await links.nth(0).boundingBox(),second=await links.nth(1).boundingBox(),bounds=await panel.boundingBox();
    assert(first.height>=44&&second.height>=44);assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    assert(Math.abs(first.x-second.x)<1);assert(second.y>=first.y+first.height-1);if(!mobile)assert(Math.abs(bounds.width-240)<1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await links.nth(0).evaluate(el=>getComputedStyle(el).borderBottomWidth),'1px');
    assert.equal(await links.nth(1).evaluate(el=>getComputedStyle(el).borderBottomWidth),'0px');
    if(!mobile){await links.nth(1).hover();await page.waitForTimeout(250);assert.equal(await links.nth(1).evaluate(el=>getComputedStyle(el).color),'rgb(224, 0, 0)');assert.equal(await links.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 240, 240)');assert.equal(await links.nth(1).evaluate(el=>getComputedStyle(el,'::before').opacity),'1');}
    await panel.screenshot({path:'artifacts/sell-menu/'+width+'.png'});
    for(const href of ['/ban-xe','/len-doi']){
      await open();const target=panel.locator('a[href="'+href+'"]');const box=await target.boundingBox();
      if(mobile)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      await page.waitForURL(base+href);await page.locator('.vehicle-service-landing').waitFor();await page.waitForFunction(()=>scrollY<2);
      // Reopen on the destination: only its row is highlighted.
      await open();assert.equal(await panel.locator('a.active').count(),1);assert.equal(await panel.locator('a.active').getAttribute('href'),href);
      assert.equal(await panel.locator('a.active').evaluate(el=>getComputedStyle(el).color),'rgb(224, 0, 0)');
      assert.equal(await panel.locator('a.active').evaluate(el=>getComputedStyle(el,'::before').opacity),'1');
    }
    assert.deepEqual(errors,[]);console.log(width,'simple vertical rows, separators/hover/current page, single activation and top-of-page navigation passed');await page.close();
  }
}finally{await browser?.close();child?.kill();await new Promise(done=>api.close(done));}
