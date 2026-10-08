import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const stage=process.argv.includes('--compare')?'after':'before';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3107';
const out=path.resolve('../toi-uu-hieu-suat-website/cdn-rollout');fs.mkdirSync(`${out}/screenshots/${stage}`,{recursive:true});
const previous=stage==='after'?JSON.parse(fs.readFileSync(`${out}/browser-before.json`)):null;
const buildId=fs.readFileSync('.next/BUILD_ID','utf8').trim();
const result=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(`${out}/browser-${stage}.json`)):{stage,records:[],visual:[],urls:[],routes:[],buildId};
if(process.argv.includes('--resume')){if(result.buildId)assert.equal(result.buildId,buildId,'Resume requires the same production build');result.buildId=buildId;const last=result.records.pop();if(last)result.visual=result.visual.filter(v=>v.name!==`${last.route==='/'?'home':result.routes.indexOf(last.route)}-${last.width}-0`);}
const save=()=>fs.writeFileSync(`${out}/browser-${stage}.json`,JSON.stringify(result,null,2));
const api=async url=>{const r=await fetch(`${base}/api/v1${url}`);assert.equal(r.status,200,url);return r.json();};
const catalog=await api('/cars?limit=12'),accessories=await api('/accessories?limit=6');
const car=await api(`/cars/${catalog.data[0].slug}`);
const routes=previous?.routes||['/','/san-pham',`/${car.slug}`,'/phu-kien-o-to',`/phu-kien-o-to/${accessories.data[0].id}`,'/ban-xe','/len-doi','/bai-viet','/ve-chung-toi','/dich-vu','/tuyen-dung','/tien-ich/mua-xe-theo-nhu-cau','/tien-ich/dinh-gia-xe','/tien-ich/xem-ngay-mua-xe','/tien-ich/xem-gia-xang-dau','/tien-ich/tra-cuu-phat-nguoi'];
result.routes=routes;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const route of routes){for(const width of route==='/'?[1920,1440,768,430,390,375]:[1440,390]){
  if(result.records.some(r=>r.route===route&&r.width===width))continue;
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width<=430?3:2,hasTouch:width<=430});const page=await context.newPage(),rows=new Map(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  cdp.on('Network.requestWillBeSent',e=>rows.set(e.requestId,{url:e.request.url,type:e.type,start:e.timestamp,priority:e.request.initialPriority}));
  cdp.on('Network.responseReceived',e=>Object.assign(rows.get(e.requestId)||{},{status:e.response.status,mime:e.response.mimeType}));
  cdp.on('Network.loadingFinished',e=>Object.assign(rows.get(e.requestId)||{},{bytes:e.encodedDataLength,end:e.timestamp}));
  cdp.on('Network.loadingFailed',e=>Object.assign(rows.get(e.requestId)||{},{error:e.errorText}));
  await page.addInitScript(()=>{window.__cdnCLS=0;new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__cdnCLS+=entry.value;}).observe({type:'layout-shift',buffered:true});});
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200,route);await page.waitForTimeout(route==='/'?12000:2500);
  await page.evaluate(()=>document.fonts.ready);
  const initial=[...rows.values()].map(r=>({...r}));
  const all=await page.locator('img').evaluateAll(els=>els.map(img=>{const r=img.getBoundingClientRect();return{src:img.getAttribute('data-image-original')||img.getAttribute('src'),currentSrc:img.currentSrc,alt:img.alt,loading:img.getAttribute('loading'),width:r.width,height:r.height,x:r.x,y:r.y,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,ready:img.complete&&img.naturalWidth>0,clone:!!img.closest('.slick-cloned')};}));
  result.urls.push(...all.map(img=>({url:img.src,width:img.naturalWidth,height:img.naturalHeight})));
  const selectors=route==='/'?['[data-header-logo]','.slider_slick .slick-current img','.wap_sanpham [data-current="true"] img','.tt-home-utility img','.tt-footer-social']:['[data-header-logo]'];
  for(let i=0;i<selectors.length;i++){
   const locator=page.locator(selectors[i]).filter({visible:true}).first();if(!await locator.count())continue;
   await locator.scrollIntoViewIfNeeded();await locator.evaluate(async el=>{if(el instanceof HTMLImageElement)await el.decode();});await page.waitForTimeout(1000);
   const name=`${route==='/'?'home':routes.indexOf(route)}-${width}-${i}`,file=`screenshots/${stage}/${name}.png`;
   await locator.screenshot({path:`${out}/${file}`,animations:'disabled',scale:'css'});
   const geometry=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,height:r.height,fit:s.objectFit,position:s.objectPosition};});
   const visual={name,file,geometry};if(previous){const old=previous.visual.find(v=>v.name===name);assert(old,name);assert.deepEqual(geometry,old.geometry,`layout ${name}`);
    const a=await sharp(`${out}/${old.file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(`${out}/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(a.info,b.info,name);let sum=0,squares=0,max=0;for(let j=0;j<a.data.length;j++){const d=Math.abs(a.data[j]-b.data[j]);sum+=d;squares+=d*d;max=Math.max(max,d);}visual.pixels={mean:sum/a.data.length,rmse:Math.sqrt(squares/a.data.length),max};
   }result.visual.push(visual);
  }
  await page.locator('#tt-footer').scrollIntoViewIfNeeded();await page.waitForTimeout(1000);
  const backgrounds=await page.locator('body *').evaluateAll(els=>els.flatMap(el=>{const s=getComputedStyle(el);return[s.backgroundImage,s.listStyleImage].flatMap(value=>[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]));}));
  result.urls.push(...backgrounds.filter(url=>!url.startsWith('data:')).map(url=>({url,width:0,height:0})));
  const record={route,width,initial,all,final:[...rows.values()],errors,cls:await page.evaluate(()=>window.__cdnCLS)};result.records.push(record);assert.deepEqual(errors,[],route);
  if(previous){const old=previous.records.find(r=>r.route===route&&r.width===width);assert(old);assert.equal(all.length,old.all.length,`image count ${route} ${width}`);record.subpixelDifferences=[];record.reservedLayouts=[];
   for(let i=0;i<all.length;i++){const a=all[i],b=old.all[i];assert.deepEqual({src:a.src,alt:a.alt,clone:a.clone},{src:b.src,alt:b.alt,clone:b.clone});
    // A lazy original with no decoded dimensions occupied zero space before.
    // The new metadata reserves its eventual box to prevent layout shifts.
    if(!b.ready && b.loading==='lazy' && (!b.width || !b.height)){record.reservedLayouts.push({src:a.src,before:{width:b.width,height:b.height},after:{width:a.width,height:a.height}});continue;}
    // Chromium uses 1/64px layout units; allow at most four units of rounding
    // in intrinsic image constraints. Main visual samples above remain exact.
    for(const axis of ['width','height']){const delta=Math.abs(a[axis]-b[axis]);assert(delta<=1/16,`Image geometry ${route} ${width} ${a.src}: ${axis} ${b[axis]} → ${a[axis]}`);if(delta)record.subpixelDifferences.push({src:a.src,axis,before:b[axis],after:a[axis],delta});}}
   assert(!record.final.some(r=>r.type==='Image'&&r.status>=400),`Broken images ${route} ${width}`);
   assert(!record.final.some(r=>r.type==='Image'&&r.url.includes('.r2.dev/')),`Old R2 request ${route} ${width}`);
  }
  save();console.log(`PASS ${stage} ${route} ${width}: ${initial.filter(r=>r.type==='Image').reduce((n,r)=>n+(r.bytes||0),0)} image wire bytes`);await context.close();
 }}
}finally{save();await browser.close();}
