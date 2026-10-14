// Actual header navigation against isolated read-only content fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
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
  for(const width of [1440, 390]) {
    const mobile = width < 960, page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.pathname.startsWith('/api/v1/')) { const response = await fetch(`${apiUrl}${url.pathname}${url.search}`); return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }); }
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
    });
    await page.goto(`${base}/khuyen-mai`, { waitUntil: 'networkidle' });
    const scrollDown = async () => { await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); assert(await page.evaluate(() => scrollY > 200)); };
    const clickMenu = async href => {
      if(mobile) {
        await page.getByRole('button', { name: 'Mở menu', exact: true }).tap();
        if(href === '/len-doi') {
          const toggle = page.getByRole('button', { name: 'Danh sách bán xe', exact: true });
          if(await toggle.getAttribute('aria-expanded') !== 'true') await toggle.tap();
        }
        await page.locator(`.tt-mobile-menu a[href="${href}"]`).first().tap();
      } else {
        if(href === '/len-doi') await page.locator('.hidden_m .menu > ul > li').filter({ has: page.locator('a[href="/ban-xe"]') }).first().hover();
        await page.locator(`.hidden_m .menu a[href="${href}"]`).first().click();
      }
    };
    for(const href of ['/ban-xe', '/len-doi', '/ban-xe']) {
      await scrollDown(); await clickMenu(href); await page.waitForURL(`${base}${href}`);
      await page.locator('.vehicle-service-landing').waitFor();
      await page.waitForFunction(() => scrollY < 2, {}, { timeout: 2500 });
      await page.waitForTimeout(300); assert(await page.evaluate(() => scrollY < 2), 'Remain at the top after rendering');
      await scrollDown(); await clickMenu(href); await page.waitForFunction(() => scrollY < 2, {}, { timeout: 2500 });
    }
    assert.deepEqual(errors, []); console.log(`Header ${width}px: sell/trade-in cross-page and same-page clicks open at the top.`); await page.close();
  }
} finally { await browser?.close(); child?.kill(); await new Promise(done => api.close(done)); }
