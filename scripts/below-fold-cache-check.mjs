import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

// Read-only production audit. Use --baseline before the change and --compare after.
const stage = process.argv.includes('--compare') ? 'after' : 'before';
assert(process.argv.includes('--baseline') || process.argv.includes('--compare'));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const out = path.resolve('../toi-uu-hieu-suat-website/phase-2f');
const prior = stage === 'after' ? JSON.parse(fs.readFileSync(`${out}/browser-before.json`)) : null;
fs.mkdirSync(`${out}/screenshots/${stage}`, {recursive:true});
const cacheOnly = process.argv.includes('--cache-only');
const result = cacheOnly && fs.existsSync(`${out}/browser-${stage}.json`)
 ? JSON.parse(fs.readFileSync(`${out}/browser-${stage}.json`)) : {stage, records:[], visual:[], cache:[]};
result.cache = [];
const save = () => fs.writeFileSync(`${out}/browser-${stage}.json`, JSON.stringify(result,null,2));
const browser = await chromium.launch({channel:'chrome',headless:true});
async function network(context,page,slow=false,disable=true) {
 const cdp=await context.newCDPSession(page), rows=new Map();
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:disable});
 if(slow)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:1250000});
 cdp.on('Network.requestWillBeSent',e=>rows.set(e.requestId,{url:e.request.url,type:e.type,start:e.timestamp,priority:e.request.initialPriority}));
 cdp.on('Network.responseReceived',e=>Object.assign(rows.get(e.requestId)||{},{status:e.response.status,mime:e.response.mimeType,response:e.timestamp,cacheControl:e.response.headers['Cache-Control']||e.response.headers['cache-control'],fromDiskCache:!!e.response.fromDiskCache}));
 cdp.on('Network.responseReceivedExtraInfo',e=>Object.assign(rows.get(e.requestId)||{},{wireStatus:e.statusCode}));
 cdp.on('Network.requestServedFromCache',e=>Object.assign(rows.get(e.requestId)||{},{cached:true}));
 cdp.on('Network.loadingFinished',e=>Object.assign(rows.get(e.requestId)||{},{bytes:e.encodedDataLength,end:e.timestamp}));
 cdp.on('Network.loadingFailed',e=>Object.assign(rows.get(e.requestId)||{},{error:e.errorText}));
 return rows;
}
const snap=rows=>{const r=[...rows.values()];return{requests:r.length,totalBytes:r.reduce((n,e)=>n+(e.bytes||0),0),imageRequests:r.filter(e=>e.type==='Image').length,imageBytes:r.filter(e=>e.type==='Image').reduce((n,e)=>n+(e.bytes||0),0),unfinishedImages:r.filter(e=>e.type==='Image'&&!e.end).length,waterfall:r};};
const geometry=async locator=>JSON.parse(JSON.stringify(await locator.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{tag:el.tagName,src:el.getAttribute('src'),width:r.width,height:r.height,fit:s.objectFit,position:s.objectPosition,href:el.closest('a')?.getAttribute('href')};}))));
async function visual(page,locator,name){
 const file=`screenshots/${stage}/${name}.png`;await locator.screenshot({path:`${out}/${file}`,animations:'disabled',scale:'css'});
 const record={name,file,geometry:await geometry(locator)};
 if(prior){const old=prior.visual.find(r=>r.name===name);assert(old,name);assert.deepEqual(record.geometry,old.geometry,name);
  const a=await sharp(`${out}/${old.file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});const b=await sharp(`${out}/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(a.info,b.info,name);
  let max=0,sum=0,overTwo=0;for(let i=0;i<a.data.length;i++){const d=Math.abs(a.data[i]-b.data[i]);max=Math.max(max,d);sum+=d;if(d>2)overTwo++;}
  record.pixelDifference={max,mean:sum/a.data.length,overTwo,channels:a.data.length};assert(max<=2,`${name}: pixels differ ${max}`);record.passed=true;
 }result.visual.push(record);
}
try{
 for(const width of cacheOnly ? [] : [1920,1440,768,430,390,375]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width<=430?3:2,hasTouch:width<=430});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const rows=await network(context,page);await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForTimeout(12000);
  const initial=snap(rows);
  const loading=await page.locator('img').evaluateAll(els=>els.map(img=>({src:img.getAttribute('src'),loading:img.getAttribute('loading'),priority:img.getAttribute('fetchpriority'),footer:!!img.closest('footer'),header:!!img.closest('header,.wap_header,.wap_header_mobile'),y:img.getBoundingClientRect().y})));
  const utility=page.locator('.tt-home-utility img').first();assert(await utility.count(),'Expected utility icon');
  await utility.scrollIntoViewIfNeeded();await utility.evaluate(img=>img.decode());await page.waitForTimeout(1000);await page.evaluate(()=>document.fonts.ready);
  await visual(page,utility,`utility-${width}`);
  const reveal=await utility.evaluate(img=>{const el=img.closest('[data-reveal-state]');const s=el&&getComputedStyle(el);return{state:el?.dataset.revealState,opacity:s?.opacity,transition:s?.transitionDuration,delay:el?.style.getPropertyValue('--reveal-delay')};});
  assert.equal(reveal.state,'visible');assert.equal(reveal.opacity,'1');
  const social=page.locator('.tt-footer-social');await social.scrollIntoViewIfNeeded();await social.locator('img').evaluateAll(els=>Promise.all(els.map(i=>i.decode())));await page.waitForTimeout(1000);
  await visual(page,social,`footer-social-${width}`);
  const footerGeometry=await geometry(page.locator('.tt-footer-main,.tt-footer-brand,.tt-footer-social,.tt-footer-social a'));
  const record={width,initial,afterScroll:snap(rows),loading,reveal,footerGeometry,errors};assert.deepEqual(errors,[]);
  if(prior){const old=prior.records.find(r=>r.width===width);assert.deepEqual(loading,old.loading,`Image hints and initial positions ${width}`);assert.deepEqual(footerGeometry,old.footerGeometry,`Footer layout ${width}`);assert.deepEqual(reveal,old.reveal,`Reveal timing ${width}`);}
  result.records.push(record);save();console.log(`PASS ${stage} ${width}: ${initial.imageBytes} image bytes / ${initial.totalBytes} total bytes`);await context.close();
 }
 // Slow-network jump to footer: its eagerly loaded icons must remain ready immediately.
 for(const width of cacheOnly ? [] : [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?3:2});const page=await context.newPage();await network(context,page,true);
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForTimeout(12000);
  const icons=page.locator('.tt-footer-social img');assert(await icons.count());await page.locator('.tt-footer-social').scrollIntoViewIfNeeded();
  const ready=await icons.evaluateAll(els=>els.every(i=>i.complete&&i.naturalWidth>0));assert(ready,'Footer icon became blank after fast scroll');
  result.records.push({width,slow:true,footerReadyOnJump:ready});save();console.log(`PASS ${stage} slow ${width}: footer icons ready on jump`);await context.close();
 }
 const assets=JSON.parse(fs.readFileSync('../toi-uu-hieu-suat-website/phase-2c/static-assets.json')).assets.filter(a=>!a.existing).map(a=>a.variant.replace(/^public/,''));
 // Do not use Playwright routing here: route interception disables HTTP cache.
 // A real same-origin image document avoids unrelated application downloads.
 const context=await browser.newContext();
 for(const visit of ['cold','warm']){const page=await context.newPage();const rows=await network(context,page,false,false);await page.goto(`${base}/upload/photo/logo-tt-gold-6981.webp`);
  await page.evaluate(urls=>Promise.all(urls.map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error(src));img.src=src;document.body.append(img);}))),assets);await page.waitForTimeout(250);
  const images=[...rows.values()].filter(r=>assets.some(src=>r.url===base+src));assert.equal(images.length,6);assert(images.every(r=>r.status===200));
  result.cache.push({visit,imageBytes:images.reduce((n,r)=>n+(r.bytes||0),0),images});save();console.log(`PASS ${stage} cache ${visit}: ${result.cache.at(-1).imageBytes} wire bytes`);await page.close();
 }await context.close();
 if(prior){assert(result.cache[0].images.every(r=>r.cacheControl==='public, max-age=31536000, immutable'));assert.equal(result.cache[1].imageBytes,0);assert(result.cache[1].images.every(r=>r.cached||r.fromDiskCache));}
 console.log(cacheOnly ? `PASS ${stage}: real-request cold/warm HTTP cache.` : `PASS ${stage}: six responsive layouts, preserved reveal and loading hints, footer jump under 10 Mbps / 100 ms, cold/warm cache.`);
}finally{save();await browser.close();}
