import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const result = data => ({data,meta:{page:1,limit:100,total:data.length,totalPages:data.length?1:0}});
const steps = key => ['Liên hệ và thỏa thuận','Kiểm tra và báo giá','Hoàn tất thủ tục','Nhận thanh toán'].map((title,index)=>({title:key==='len-doi'&&index===3?'Nhận xe mới':title,imageUrl:'/service-fixture.svg',body:`<p>Nội dung bước ${index+1} cho ${key}.</p>`}));
const icon='<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90"><path d="m25 46 14 14 28-29" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const api=createServer((request,response)=>{
  const url=new URL(request.url,'http://fixture.test'),path=url.pathname;let data=result([]),status=200;
  if(path==='/api/v1/content'){const group=url.searchParams.get('group')||'';data=group.startsWith('thiet-lap-cac-buoc-')?steps(group.replace('thiet-lap-cac-buoc-','')):[];}
  else if(path==='/api/v1/brands'||path.startsWith('/api/v1/site-settings/'))data=[];
  else if(path==='/api/v1/promotions/popup')data=null;
  else if(path==='/api/v1/seo'||/^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)){status=404;data={};}
  response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(data));
});
const listen=server=>new Promise(done=>server.listen(0,'127.0.0.1',done));let child,browser;
try{
  await listen(api);const apiUrl=`http://127.0.0.1:${api.address().port}`,reservation=createServer();await listen(reservation);const port=reservation.address().port;await new Promise(done=>reservation.close(done));const base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--port',String(port)],{windowsHide:true,stdio:'ignore',env:{...process.env,API_URL:apiUrl}});
  for(let i=0;;i++){if(child.exitCode!==null)throw Error('Next exited');try{if((await fetch(`${base}/ban-xe`,{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(i>45)throw Error('Next unavailable');await new Promise(done=>setTimeout(done,250));}
  browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('artifacts/service-process',{recursive:true});
  const routePage=page=>page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/service-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:icon});if(url.pathname.startsWith('/api/v1/')){const response=await fetch(`${apiUrl}${url.pathname}${url.search}`);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
  const sectionStyle = section => section.evaluate(el => { const style = getComputedStyle(el); return { background: style.backgroundImage, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom }; });
  for(const width of [1440,768,390,320]){
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await routePage(page);
    await page.goto(base,{waitUntil:'networkidle'});const homeSection=await sectionStyle(page.locator('.tt-home-services'));const home=await page.locator('.tt-home-services .tt-home-service-step').first().evaluate(el=>{const icon=el.querySelector('.tt-home-service-step__icon'),title=el.querySelector('h3');return {icon:getComputedStyle(icon).width,title:getComputedStyle(title).font};});
    for(const key of ['ban-xe','len-doi']){
      await page.goto(`${base}/${key}`,{waitUntil:'networkidle'});const section=page.locator('.tt-service-process'),list=section.locator('.tt-home-service-steps');await section.scrollIntoViewIfNeeded();
      assert.deepEqual(await sectionStyle(section),homeSection,'Section background and spacing match the homepage');
      assert.equal(await list.locator('.tt-home-service-step').count(),4);assert.equal(await section.locator('.item_buoc,.slick-slider').count(),0);
      assert.deepEqual(await list.locator('.tt-home-service-step__number').allTextContents(),['01','02','03','04']);
      assert.deepEqual(await list.locator('.tt-home-service-step__title').allTextContents(),steps(key).map(step=>step.title));
      assert.equal(await list.locator('img[src="/service-fixture.svg"]').count(),4);
      const landing=await list.locator('.tt-home-service-step').first().evaluate(el=>({icon:getComputedStyle(el.querySelector('.tt-home-service-step__icon')).width,title:getComputedStyle(el.querySelector('h3')).font}));assert.deepEqual(landing,home);
      if(width<641){assert(await list.evaluate(el=>el.scrollWidth>el.clientWidth));await list.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));assert(await list.evaluate(el=>el.scrollLeft>0));}
      else assert.equal(await list.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width>1024?4:2);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await section.screenshot({path:`artifacts/service-process/${key}-${width}.png`});
    }
    assert.deepEqual(errors,[]);await page.close();console.log(`Service process ${width}px: shared homepage styling, correct steps/icons and responsive layout passed.`);
  }
  const page=await browser.newPage({viewport:{width:390,height:900}});await routePage(page);await page.goto(`${base}/ban-xe`,{waitUntil:'networkidle'});const section=page.locator('.tt-service-process'),list=section.locator('.tt-home-service-steps');await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Number(document.querySelector('.tt-service-process')?.dataset.activeStep)>=1,{},{timeout:5000});
  await list.dispatchEvent('touchstart');await list.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));await list.dispatchEvent('touchend');await page.waitForTimeout(600);const position=await list.evaluate(el=>el.scrollLeft);await page.waitForTimeout(2500);assert.equal(await list.evaluate(el=>el.scrollLeft),position,'Manual swipe holds the step for five seconds');await page.close();
  console.log('Mobile auto advance and pause after manual interaction passed.');
}finally{await browser?.close();child?.kill();await new Promise(done=>api.close(done));}
