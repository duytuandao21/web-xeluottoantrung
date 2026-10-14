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
  } else if(path === '/api/v1/car-recommendations/config') data={ enabled:false, questions:[], minBudget:0, maxBudget:500000000, budgetPresets:[], technicalOptions:{brand:[],bodyStyle:[],transmission:[],fuel:[]}, updatedAt:new Date().toISOString() };
  else if(path === '/api/v1/brands') data=[{ id:'toyota',slug:'toyota',name:'Toyota',stockCount:8 }];
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
  
  const broken=process.argv.includes('--expect-broken');
  const dismissalOnly=process.argv.includes('--dismiss-only');
  for(const width of broken||dismissalOnly?[1440,390]:[1440,1024,390,320]) {
    const mobile=width<=960,page=await browser.newPage({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/menu-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:artwork});if(url.pathname.startsWith('/api/v1/')){const response=await fetch(apiUrl+url.pathname+url.search);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
    const root=page.locator(mobile?'.tt-mobile-menu .tt-buy-menu':'.hidden_m .tt-buy-menu'),panel=root.locator('.tt-buy-panel');
    const cases=dismissalOnly?[]:broken?[{name:'all',tab:0,selector:'.tt-buy-heading a',href:'/san-pham'}]:[
      {name:'all',tab:0,selector:'.tt-buy-heading a',href:'/san-pham'},
      {name:'new',tab:1,selector:'.tt-buy-heading a',href:'/san-pham?xe-moi-ve=true'},
      {name:'discounts',tab:2,selector:'.tt-buy-heading a',href:'/san-pham?dang-giam-gia=true'},
      {name:'survey-text',tab:0,selector:'.tt-buy-survey span',href:'/tien-ich/mua-xe-theo-nhu-cau'},
      {name:'survey-icon',tab:0,selector:'.tt-buy-survey svg',href:'/tien-ich/mua-xe-theo-nhu-cau'},
      {name:'brand',tab:0,selector:'.tt-buy-brands a[href="/toyota"]',href:'/toyota'},
      ...(!mobile?[{name:'banner',tab:0,selector:'.tt-buy-banner img',href:'/san-pham?xe-moi-ve=true'}]:[]),
    ];
    for(const item of cases) {
      await page.goto(base+'/khuyen-mai',{waitUntil:'networkidle'});
      if(mobile){await page.locator('.icon_menu_mobi').tap();await root.locator('.mobile-submenu-toggle').tap();}
      else await root.locator(':scope > a').click();
      await panel.waitFor();if(item.tab)await panel.locator('[role="tab"]').nth(item.tab).click();
      const target=panel.locator(item.selector);await target.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
      const box=await target.boundingBox();assert(box);const x=box.x+box.width/2,y=box.y+box.height/2;
      if(broken){
        await page.mouse.move(x,y);await page.mouse.down();await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(30);await page.mouse.up();await page.waitForTimeout(250);
        assert.equal(new URL(page.url()).pathname,'/khuyen-mai');assert.equal(await panel.count(),0);
        console.log(width,'reproduced: focus loss during pointer press removes link before click');
      }else{
        // Real touch/mouse activation once; no Locator.click retry after a lost link.
        if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
        await page.waitForURL(base+item.href,{timeout:10000});assert.equal(await panel.count(),0);
        // Repeat with the null-relatedTarget focus transition seen on touch UIs.
        await page.goto(base+'/khuyen-mai',{waitUntil:'networkidle'});
        if(mobile){await page.locator('.icon_menu_mobi').tap();await root.locator('.mobile-submenu-toggle').tap();}else await root.locator(':scope > a').click();
        if(item.tab)await panel.locator('[role="tab"]').nth(item.tab).click();
        await target.scrollIntoViewIfNeeded();await page.waitForTimeout(250);const r=await target.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(30);
        assert.equal(await panel.count(),1,'Menu stays mounted until activation completes');await page.mouse.up();await page.waitForURL(base+item.href,{timeout:10000});
        console.log(width,item.name,'one activation and pointer-focus regression passed');
      }
    }
    if(!broken){
      const openMenu=async()=>{
        await page.goto(base+'/khuyen-mai',{waitUntil:'networkidle'});
        if(mobile){await page.locator('.icon_menu_mobi').tap();await root.locator('.mobile-submenu-toggle').tap();}else await root.locator(':scope > a').click();
        await panel.waitFor();
      };
      await openMenu();await panel.locator('.tt-buy-heading a').focus();await page.keyboard.press('Enter');await page.waitForURL(base+'/san-pham');
      await openMenu();await panel.locator('[role="tab"]').first().focus();
      await page.locator(mobile?'.tt-mobile-menu .close_menu':'.hidden_m .sale-header-button').focus();await panel.waitFor({state:'detached'});
      await root.locator(':scope > a').press('ArrowDown');await panel.waitFor();await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
      console.log(width,'keyboard navigation, focus-out dismissal and Escape passed');
    }
    assert.deepEqual(errors,[]);await page.close();
  }
}finally{await browser?.close();child?.kill();await new Promise(done=>api.close(done));}
