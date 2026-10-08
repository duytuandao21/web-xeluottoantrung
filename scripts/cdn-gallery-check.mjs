import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3107';
const out='../toi-uu-hieu-suat-website/cdn-rollout';
const car=JSON.parse(fs.readFileSync(`${out}/browser-before.json`)).routes[2];
const accessories=await fetch(`${base}/api/v1/accessories?limit=24`).then(r=>r.json());
const item=accessories.data.find(item=>item.imageUrls?.length>1);assert(item);
const browser=await chromium.launch({channel:'chrome',headless:true}),records=[];
const measure=locator=>locator.evaluate(img=>{const r=img.getBoundingClientRect(),s=getComputedStyle(img);return{src:img.getAttribute('src'),width:+r.width.toFixed(2),height:+r.height.toFixed(2),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:s.objectFit,position:s.objectPosition};});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [kind,route] of [['car',car],['accessory',`/phu-kien-o-to/${item.id}`]]){
  const response=await page.goto(`${base}${route}`,{waitUntil:'networkidle',timeout:120000});assert.equal(response.status(),200);
  for(const width of [1920,1440,768,430,390,375]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(800);
   const main=page.locator('.album_pro .slick-active:not(.slick-cloned) img').first();await main.scrollIntoViewIfNeeded();await main.evaluate(img=>img.decode());
   const thumbnail=page.locator('.album_pro2 .slick-active:not(.slick-cloned) img').first();
   const row={kind,route,width,main:await measure(main),thumbnail:await measure(thumbnail)};
   const waitOriginal=()=>page.waitForFunction(()=>{const img=document.querySelector('.vehicle-lightbox__image');const source=img?.getAttribute('data-image-original')?.replace('https://pub-edb90463be404b1d8b79b79517518131.r2.dev','https://cdn.toantrungxeluot.io.vn');return !!source&&img?.currentSrc===source&&img.complete&&img.naturalWidth>0;},{},{timeout:60000});
   const first=await main.getAttribute('src');
   await page.locator('.album_pro .slick-next').click();await page.waitForTimeout(750);assert.notEqual(await main.getAttribute('src'),first);
   await page.locator('.album_pro .slick-prev').click();await page.waitForTimeout(750);assert.equal(await main.getAttribute('src'),first);
   const buttons=page.locator('.album_pro2 .slick-slide:not(.slick-cloned) button');
   await buttons.nth(1).click();await page.waitForTimeout(750);assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true');
   await page.locator('.album_pro .slick-prev').click();await page.waitForTimeout(750);assert.equal(await main.getAttribute('src'),first);assert.equal(await buttons.nth(0).getAttribute('aria-pressed'),'true');
   await main.click();const photo=page.locator('.vehicle-lightbox__image');await waitOriginal();await photo.evaluate(img=>img.decode());
   const full=first.includes('/cdn-cgi/image/')?first.split('format=auto/')[1]:first;
   await page.waitForFunction(url=>{const img=document.querySelector('.vehicle-lightbox__image');return img?.currentSrc===url&&img.complete&&img.naturalWidth>0;},full,{timeout:60000});
   row.lightbox=await measure(photo);assert.equal(row.lightbox.src,full);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   await page.locator('.vehicle-lightbox__thumbnails button').last().click();await waitOriginal();await photo.evaluate(img=>img.decode());
   await page.getByRole('button',{name:'Ảnh tiếp theo',exact:true}).click();await waitOriginal();await photo.evaluate(img=>img.decode());await page.waitForFunction(url=>{const img=document.querySelector('.vehicle-lightbox__image');return img?.currentSrc===url&&img.complete&&img.naturalWidth>0;},full,{timeout:60000});assert.equal(await photo.getAttribute('src'),full);
   await page.keyboard.press('Escape');await page.locator('.vehicle-lightbox').waitFor({state:'detached'});
   row.arrows='PASS';row.thumbnailSync='PASS';row.originalLightbox='PASS';row.wrap='PASS';row.close='PASS';
   records.push(row);fs.writeFileSync(`${out}/gallery-breakpoints.json`,JSON.stringify({records,errors},null,2));
   console.log(`PASS ${kind} ${width}`);
  }
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
