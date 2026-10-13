// Production car cards against a disposable catalog; no real API/database writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const examples = [
  ['vios-discount',433000000,453000000,'-20 triệu'], ['vf3-discount',239000000,254000000,'-15 triệu'],
  ['stargazer-discount',458000000,470000000,'-12 triệu'], ['billion-price',1250000000,1500000000,'-250 triệu'],
  ['fraction-discount',433500000,434000000,'-0,5 triệu'], ['no-old-price',500000000,null,null],
  ['equal-price',500000000,500000000,null], ['lower-old-price',500000000,400000000,null],
  ['quote-price',0,500000000,null], ['zero-old-price',500000000,0,null], ['negative-old-price',500000000,-1,null],
];
const cars = examples.map(([slug,price,originalPrice],index) => ({ slug,name:`Toyota Vios ${index+1}`,year:2025,price,originalPrice,mileage:20000,status:'active',fuel:'Xăng',transmission:'Số tự động',bodyType:'Sedan',seatCount:5,
  brand:{name:'Toyota',slug:'toyota'},model:{name:'Vios',slug:'vios'},branch:'Toàn Trung 10',cover:'/discount-fixture.svg',createdAt:new Date().toISOString(),newArrival:index===0 }));
const result = (data,page=1,limit=100) => ({data:data.slice((page-1)*limit,page*limit),meta:{page,limit,total:data.length,totalPages:Math.ceil(data.length/limit)}});
const artwork='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#f2f4fa"/><rect x="180" y="220" width="440" height="220" rx="60" fill="#d8dde5"/><rect x="225" y="170" width="350" height="170" rx="50" fill="#c1c9d5"/><rect x="250" y="210" width="300" height="100" rx="25" fill="#14213a"/><circle cx="220" cy="410" r="50" fill="#14213a"/><circle cx="580" cy="410" r="50" fill="#14213a"/></svg>';
const api=createServer((request,response)=>{
  const url=new URL(request.url,'http://fixture.test'),path=url.pathname;let data=result([]),status=200;
  if(path==='/api/v1/cars')data=result(cars,Number(url.searchParams.get('page')||1),Number(url.searchParams.get('limit')||6));
  else if(path==='/api/v1/brands')data=[{id:'toyota',name:'Toyota',slug:'toyota'}];
  else if(path==='/api/v1/content'||path.startsWith('/api/v1/site-settings/'))data=[];
  else if(path==='/api/v1/promotions/popup')data=null;
  else if(path==='/api/v1/seo'||/^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)){status=404;data={};}
  response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(data));
});
const listen=server=>new Promise(done=>server.listen(0,'127.0.0.1',done));let child,browser;
try{
  await listen(api);const apiUrl=`http://127.0.0.1:${api.address().port}`,reservation=createServer();await listen(reservation);const port=reservation.address().port;await new Promise(done=>reservation.close(done));const base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--port',String(port)],{windowsHide:true,stdio:'ignore',env:{...process.env,API_URL:apiUrl}});
  for(let attempt=0;;attempt++){if(child.exitCode!==null)throw Error('Next exited');try{if((await fetch(`${base}/san-pham`,{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(attempt>45)throw Error('Next unavailable');await new Promise(done=>setTimeout(done,250));}
  await mkdir('artifacts/car-discount',{recursive:true});browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [1440,768,430,390,360,320]){
    const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<700,isMobile:width<700}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/discount-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:artwork});
      if(url.pathname.startsWith('/api/v1/')){const response=await fetch(`${apiUrl}${url.pathname}${url.search}`);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
      return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
    await page.goto(`${base}/san-pham`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Xem thêm 5 xe',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.vehicle-results>.item').length===11);
    for(const [slug,,,label] of examples){
      const card=page.locator(`.vehicle-results>[data-car-id="${slug}"]`),badge=card.locator('.car-card-discount');
      if(!label){assert.equal(await badge.count(),0,`No false discount: ${slug}`);continue;}
      assert.equal(await badge.textContent(),label);assert.equal(await badge.locator('svg').count(),0);
      const geometry=await card.evaluate(el=>{const bar=el.querySelector('.gia_sp'),price=el.querySelector('.car-card-price'),badge=el.querySelector('.car-card-discount');
        const bounds=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
        return {bar:bounds(bar),price:bounds(price),badge:bounds(badge),clipped:price.scrollWidth>price.clientWidth||badge.scrollWidth>badge.clientWidth||bar.scrollWidth>bar.clientWidth,color:getComputedStyle(badge).color,background:getComputedStyle(badge).backgroundColor};});
      const a=geometry.price,b=geometry.badge;assert(!(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y),`Overlap ${width}px: ${slug}`);
      assert(!geometry.clipped,`Clipped price/discount ${width}px: ${slug}`);assert(b.right<=geometry.bar.right,`Badge outside bar ${width}px: ${slug}`);
      assert.equal(geometry.color,'rgb(226, 0, 0)');assert.equal(geometry.background,'rgb(255, 229, 139)');
    }
    assert.equal(await page.locator('[data-car-id="vios-discount"] .car-card-new-arrival').count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    if([1440,390,320].includes(width))await page.locator('.vehicle-results').screenshot({path:`artifacts/car-discount/${width}.png`});
    console.log(`Discount ${width}px: exact savings, invalid/equal prices, appended cards, colors, geometry and new arrival passed.`);await page.close();
  }
}finally{await browser?.close();child?.kill();await new Promise(done=>api.close(done));}
