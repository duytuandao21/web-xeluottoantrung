import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { load } from 'cheerio';

const stage=process.argv.includes('--compare')?'after':'before';
assert(process.argv.includes('--compare')||process.argv.includes('--baseline'));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3107';
const out=path.resolve('../toi-uu-hieu-suat-website/cdn-rollout');
const previous=null;
const catalog=await fetch(`${base}/api/v1/cars?limit=6`).then(r=>r.json());
const details=await Promise.all(catalog.data.map(car=>fetch(`${base}/api/v1/cars/${car.slug}`).then(r=>r.json())));
const candidate=details.slice(3).find(car=>car.media.length>1);assert(candidate);
const browser=await chromium.launch({channel:'chrome',headless:true}),records=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?3:2,hasTouch:width===390});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:1250000});
  const response=await page.goto(`${base}/san-pham`,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200);
  const $=load(await response.text()),covers=$('.vehicle-results .slick-slide[data-current="true"] img').map((_,el)=>$(el).attr('src')).get();
  const preloads=$('link[rel=preload][as=image]').map((_,el)=>$(el).attr('href')).get();
  const card=page.locator(`.vehicle-results [data-car-id="${candidate.slug}"]`),current=card.locator('.slick-slide[data-current="true"] img');
  await page.locator('.vehicle-results .slick-slide[data-current="true"] img').first().waitFor({state:'visible',timeout:90000});
  await card.scrollIntoViewIfNeeded();
  const atScroll=await current.evaluate(img=>({ready:img.complete&&img.naturalWidth>0,visible:getComputedStyle(img).visibility,src:img.getAttribute('src')}));
  await current.waitFor({state:'visible',timeout:60000});
  const original=await current.getAttribute('src'),viewport=card.locator('.car-card-gallery__viewport');
  async function swipe(direction,vertical=false){
    const r=await viewport.boundingBox(),x=r.x+r.width*(direction===1?.85:.15),y=r.y+r.height*.5;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(vertical?3:-direction*r.width*.7)*i/6,y:y+(vertical?-65:0)*i/6}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  if(width===1440){
    await page.mouse.move(0,0);assert.equal(await card.locator('.slick-arrow:visible').count(),0);
    await card.hover();await card.locator('.slick-next').waitFor({state:'visible'});assert.equal(await card.locator('.slick-arrow:visible').count(),2);
    await card.locator('.slick-next').click();
  }else{assert.equal(await card.locator('.slick-arrow:visible').count(),0);await swipe(1);}
  await page.waitForFunction(({slug,original})=>{const c=document.querySelector(`[data-car-id="${slug}"]`),img=c.querySelector('[data-current="true"] img');return img.src!==original&&!c.querySelector('.is-moving')&&getComputedStyle(img).visibility==='visible';},{slug:candidate.slug,original},{timeout:60000});
  assert.equal(page.url(),`${base}/san-pham`);
  if(width===1440)await card.locator('.slick-prev').click();else await swipe(-1);
  await page.waitForFunction(({slug,original})=>{const c=document.querySelector(`[data-car-id="${slug}"]`);return c.querySelector('[data-current="true"] img').src===original&&!c.querySelector('.is-moving');},{slug:candidate.slug,original},{timeout:60000});
  if(width===390){await swipe(1,true);assert.equal(await current.getAttribute('src'),original);}
  const url=`${base}/${candidate.slug}`;
  await page.waitForTimeout(750);await current.click();await page.waitForURL(url,{timeout:90000});
  const main=page.locator('.album_pro .slick-active:not(.slick-cloned) a img').first();
  const galleryCover=await main.getAttribute('src');
  await page.locator('.album_pro .slick-next').click();
  await page.waitForFunction(src=>document.querySelector('.album_pro .slick-active:not(.slick-cloned) img')?.getAttribute('src')!==src,galleryCover);
  await page.waitForTimeout(750);await page.locator('.album_pro .slick-prev').click();
  await page.waitForFunction(src=>document.querySelector('.album_pro .slick-active:not(.slick-cloned) img')?.getAttribute('src')===src,galleryCover);
  await page.waitForTimeout(750);
  const thumbs=page.locator('.album_pro2 .slick-slide:not(.slick-cloned) button');
  await thumbs.nth(1).click();await page.waitForTimeout(750);assert.equal(await thumbs.nth(1).getAttribute('aria-pressed'),'true');
  // After focusOnSelect, the first thumbnail may be outside Slick's clip.
  // Return with the visible main arrow, as a user would.
  await page.locator('.album_pro .slick-prev').click();await page.waitForTimeout(750);assert.equal(await main.getAttribute('src'),galleryCover);
  assert.equal(await thumbs.nth(0).getAttribute('aria-pressed'),'true');
  await page.locator('.album_pro .slick-active:not(.slick-cloned) a').first().click();
  const photo=page.locator('.vehicle-lightbox__image');await photo.waitFor({state:'visible'});await photo.evaluate(img=>img.decode());
  await page.waitForFunction(()=>{const img=document.querySelector('.vehicle-lightbox__image');return img?.complete&&img.naturalWidth>0&&img.currentSrc.startsWith('https://cdn.toantrungxeluot.io.vn/')&&!img.currentSrc.includes('/cdn-cgi/image/');},{},{timeout:60000});
  assert.equal(await photo.evaluate(img=>img.naturalWidth),(await import('../config/cdn-image-dimensions.json',{with:{type:'json'}})).default[await photo.getAttribute('data-image-original')]?.width);
  const originalResolution=await photo.evaluate(img=>({url:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight}));
  let touchZoom='NOT TESTED';
  if(width===390){
    const r=await photo.boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.5;
    for(let tap=0;tap<2;tap++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);}
    await page.waitForFunction(()=>document.querySelector('.vehicle-lightbox__image').style.transform.includes('scale(2.5)'));
    touchZoom='PASS';
  }
  await page.getByRole('button',{name:'Đóng thư viện ảnh',exact:true}).click();await page.locator('.vehicle-lightbox').waitFor({state:'detached'});
  const row={width,network:'cold cache, 10 Mbps, RTT 100 ms',covers,coverPreloads:preloads.filter(url=>covers.includes(url)),atScroll,hoverOrSwipe:'PASS',previous:'PASS',verticalScroll:width===390?'PASS':'NOT TESTED',cardClick:'PASS',galleryArrows:'PASS',galleryThumbnailSync:'PASS',touchZoom,originalResolution,errors};
  records.push(row);fs.writeFileSync(`${out}/interactions-${stage}.json`,JSON.stringify(records,null,2));
  if(previous){const old=previous.find(r=>r.width===width);assert.deepEqual(covers,old.covers);assert(!old.atScroll.ready||atScroll.ready,'A previously ready visible cover must remain ready when scrolling.');assert(!old.atScroll.ready||atScroll.visible==='visible');}
  assert.deepEqual(errors,[]);console.log(JSON.stringify(row));await context.close();
 }
}finally{await browser.close();}
