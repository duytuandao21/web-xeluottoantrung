// Production header + isolated public API. No writes to the real database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const names = ['Toyota Vios E AT 2025', 'Vinfast VF3 2025 (mua pin)', 'Hyundai Stargazer X Cao Cấp 2024', 'Mazda 3 Luxury', 'Honda City', 'Toyota Corolla Cross', 'Ford Everest', 'KIA Seltos'];
const cars = names.map((name, index) => ({ slug: `menu-car-${index}`, name, price: [433,239,458,669,500,820,890,620][index]*1e6,
  originalPrice: [453,254,470,680,520,850,930,660][index]*1e6, cover: '/menu-fixture.svg',
  year: 2025, mileage: 20000, transmission: 'Số tự động', fuel: 'Xăng', status: 'active',
  brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' },
  newArrival: true, createdAt: new Date(Date.now()-1000).toISOString() }));
const result = (rows=[],page=1,limit=100) => ({ data: rows.slice((page-1)*limit,page*limit), meta: { page,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit) } });
const menuReads = [], listingReads = [];
let failDiscount = false;
const api = createServer((request,response) => {
  const url = new URL(request.url,'http://fixture.test'), path = url.pathname;
  let data = result(), status = 200;
  if(path === '/api/v1/cars/menu') {
    const section = url.searchParams.get('section'); menuReads.push(section);
    if(failDiscount && section === 'discounts') { status=503; data={message:'Unavailable'}; }
    else data={ data: cars.slice(0,3).map(({slug,name,cover,price,originalPrice,createdAt})=>({slug,name,cover,price,originalPrice,createdAt})) };
  } else if(path === '/api/v1/cars') {
    listingReads.push(Object.fromEntries(url.searchParams));
    data=result(cars,Number(url.searchParams.get('page')||1),Number(url.searchParams.get('limit')||6));
  } else if(path === '/api/v1/brands') data=[{ id:'toyota',slug:'toyota',name:'Toyota',stockCount:8 }];
  else if(path === '/api/v1/content' || path.startsWith('/api/v1/site-settings/')) data=[];
  else if(path === '/api/v1/promotions/popup') data=null;
  else if(path === '/api/v1/seo' || /^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)) { status=404; data={}; }
  response.writeHead(status,{ 'Content-Type':'application/json' });response.end(JSON.stringify(data));
});
const artwork='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#f2f4fa"/><rect x="180" y="220" width="440" height="220" rx="60" fill="#d8dde5"/><rect x="225" y="170" width="350" height="170" rx="50" fill="#c1c9d5"/><rect x="250" y="210" width="300" height="100" rx="25" fill="#14213a"/><circle cx="220" cy="410" r="50" fill="#14213a"/><circle cx="580" cy="410" r="50" fill="#14213a"/></svg>';
const listen = server => new Promise(done=>server.listen(0,'127.0.0.1',done));
let child,browser;
try {
  await listen(api);const apiUrl=`http://127.0.0.1:${api.address().port}`;
  const reservation=createServer();await listen(reservation);const port=reservation.address().port;await new Promise(done=>reservation.close(done));const base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--port',String(port)],{windowsHide:true,stdio:'ignore',env:{...process.env,API_URL:apiUrl}});
  for(let attempt=0;;attempt++){if(child.exitCode!==null)throw Error('Next exited');try{if((await fetch(`${base}/khuyen-mai`,{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}if(attempt>60)throw Error('Next unavailable');await new Promise(done=>setTimeout(done,250));}
  await mkdir('artifacts/buy-menu',{recursive:true});browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [1440,1024,390,320]) {
    const mobile=width<=960,page=await browser.newPage({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
    const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/menu-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:artwork});
      if(url.pathname.startsWith('/api/v1/')){const response=await fetch(`${apiUrl}${url.pathname}${url.search}`);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
      return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();
    });
    await page.goto(`${base}/khuyen-mai`,{waitUntil:'networkidle'});
    const baseline=menuReads.length;
    assert(!requests.some(url=>url.includes('/api/car-menu')||url.includes('xe-moi-ve-menu-v1.webp')),'Menu data/banner not loaded on page load');
    const root=page.locator(mobile?'.tt-mobile-menu .tt-buy-menu':'.hidden_m .tt-buy-menu');
    if(mobile) { await page.getByRole('button',{name:'Mở menu',exact:true}).tap();await root.getByRole('button',{name:'Danh sách mua xe',exact:true}).tap(); }
    else await root.locator(':scope > a').click();
    const panel=root.locator('.tt-buy-panel');await panel.waitFor({state:'visible'});
    assert.equal(await panel.locator('.tt-buy-brands a').count(),16);
    assert.equal(menuReads.length,baseline,'Brands do not fetch cars');
    assert.equal(await panel.locator('.tt-buy-banner').count(),mobile?0:1);
    if(mobile)assert(!requests.some(url=>url.includes('xe-moi-ve-menu-v1.webp')),'Mobile never requests banner');
    await panel.screenshot({path:`artifacts/buy-menu/all-${width}.png`});
    const tab=label=>panel.getByRole('tab',{name:label,exact:true});
    await tab('Xe mới về').click();await panel.locator('.tt-buy-car').first().waitFor();
    assert.equal(await panel.locator('.tt-buy-car').count(),3);
    assert(!/20\.000|Số tự động|Xăng/.test(await panel.locator('.tt-buy-cars').innerText()),'No car specifications');
    assert.equal(menuReads.length,baseline+1);
    await panel.screenshot({path:`artifacts/buy-menu/new-${width}.png`});
    await tab('Xe mới về').click();assert.equal(await panel.locator('.tt-buy-car').count(),3,'Repeated active tab stays visible');
    await tab('Đang giảm giá').click();await panel.locator('.tt-buy-car del').first().waitFor();
    assert.deepEqual(await panel.locator('.tt-buy-car-image > span').allTextContents(),['-20 triệu','-15 triệu','-12 triệu']);
    assert.equal(menuReads.length,baseline+2);
    await panel.screenshot({path:`artifacts/buy-menu/discount-${width}.png`});
    await tab('Xe mới về').click();await panel.locator('.tt-buy-car').first().waitFor();
    await tab('Đang giảm giá').click();await panel.locator('.tt-buy-car del').first().waitFor();
    assert.equal(menuReads.length,baseline+2,'Switching back reuses reads');
    await page.waitForTimeout(400);
    assert(!requests.some(url=>url.includes('_rsc=') && /menu-car-|xe-moi-ve=|dang-giam-gia=/.test(url)),'No speculative car/filter page prefetch from menu links');
    const geometry=await panel.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,rect:el.getBoundingClientRect().toJSON(),columns:getComputedStyle(el.querySelector('.tt-buy-tabs')).gridTemplateColumns.split(' ').length}));
    assert(geometry.scrollWidth<=geometry.width+1,'No inner horizontal overflow');
    assert.equal(geometry.columns,mobile?2:4);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await panel.locator('.tt-buy-survey').getAttribute('href'),'/tien-ich/mua-xe-theo-nhu-cau');
    await panel.locator('.tt-buy-heading a').click();await page.waitForURL(`${base}/san-pham?dang-giam-gia=true`);
    await page.locator('.vehicle-results > .item').first().waitFor();
    assert(listingReads.some(query=>query.discounted==='true'&&query.limit==='6'),'Listing uses API filter with bounded page');
    await page.getByRole('button',{name:'Xem thêm 2 xe',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.vehicle-results > .item').length===8);
    assert(listingReads.some(query=>query.discounted==='true'&&query.page==='2'),'Load more retains discount filter');
    assert.deepEqual(errors,[]);console.log(`Buy menu ${width}px: lazy queries, three compact cars, savings, repeated tabs, no prefetch/banner on mobile, filtered pagination passed.`);
    await page.close();
  }
  // Failure retry and keyboard/outside dismissal are independent of catalog reads.
  const page=await browser.newPage({viewport:{width:1440,height:600}});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`${base}/khuyen-mai`,{waitUntil:'networkidle'});
  const root=page.locator('.hidden_m .tt-buy-menu'),trigger=root.locator(':scope > a'),panel=root.locator('.tt-buy-panel');
  await trigger.click();await panel.waitFor();failDiscount=true;
  await panel.getByRole('tab',{name:'Đang giảm giá',exact:true}).click();await panel.getByRole('button',{name:'Thử lại',exact:true}).waitFor();
  failDiscount=false;await panel.getByRole('button',{name:'Thử lại',exact:true}).click();await panel.locator('.tt-buy-car').first().waitFor();
  const rect=await panel.boundingBox();assert(rect.y+rect.height<=601,'Short desktop viewport scrolls within menu');
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  await trigger.press('ArrowDown');await panel.waitFor();
  const first=panel.getByRole('tab',{name:'Tất cả sản phẩm',exact:true});await first.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await panel.getByRole('tab',{name:'Xe mới về',exact:true}).getAttribute('aria-selected'),'true');
  await page.mouse.click(10,590);assert.equal(await panel.count(),0);
  console.log('Buy menu: error retry, Escape, keyboard tabs, outside dismissal and short viewport passed.');await page.close();
} finally { await browser?.close();child?.kill();await new Promise(done=>api.close(done)); }
