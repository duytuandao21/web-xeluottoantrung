import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

// Read-only production browser audit, never imported by the application.
const stage = process.argv.includes('--compare') ? 'after' : 'before';
assert(process.argv.includes('--baseline') || process.argv.includes('--compare'));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only')+1] : null;
const onlyWidth = process.argv.includes('--width') ? Number(process.argv[process.argv.indexOf('--width')+1]) : null;
const resume = process.argv.includes('--resume');
const out = path.resolve('../toi-uu-hieu-suat-website/phase-2e');
fs.mkdirSync(`${out}/screenshots/${stage}`, { recursive: true });
const save = (file, value) => fs.writeFileSync(`${out}/${file}`, JSON.stringify(value, null, 2));
const prior = stage === 'after' ? JSON.parse(fs.readFileSync(`${out}/browser-before.json`, 'utf8')) : null;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const partial = (only || resume) && fs.existsSync(`${out}/browser-${stage}.json`) ? JSON.parse(fs.readFileSync(`${out}/browser-${stage}.json`,'utf8')) : null;
const records = partial?.records.filter(r=> r.afterScroll || r.afterOpen).filter(r=>!only || r.kind!==only || (onlyWidth && r.width!==onlyWidth)) || [];
const visual = partial?.visual.filter(r=>!only || !r.name.endsWith(`${only}-${onlyWidth}`)).filter(r=>!resume || stage==='before' || r.passed) || [];
const failures = [];
const api = async endpoint => {
  const response = await fetch(`${base}/api/v1${endpoint}`);
  assert.equal(response.status, 200);
  return response.json();
};
const catalog = await api('/cars?limit=6');
const details = await Promise.all(catalog.data.map(car => api(`/cars/${car.slug}`)));
const candidate = details.find(car => car.media.length > 1);
assert(candidate, 'A real car with multiple images is required.');
const accessories = await api('/accessories?limit=6');
assert(accessories.data.length);
const routes = prior?.routes || { home: '/', cars: '/san-pham', accessories: '/phu-kien-o-to', car: `/${candidate.slug}`, accessory: `/phu-kien-o-to/${accessories.data[0].id}` };
const snapshot = rows => {
  const values = [...rows.values()];
  return { requests: values.length, bytes: values.reduce((n,r)=>n+(r.bytes||0),0), imageRequests: values.filter(r=>r.type==='Image').length,
    imageBytes: values.filter(r=>r.type==='Image').reduce((n,r)=>n+(r.bytes||0),0), unfinishedImages: values.filter(r=>r.type==='Image'&&!r.end).length,
    images: values.filter(r=>r.type==='Image').map(r=>({url:r.url,bytes:r.bytes||0,status:r.status,priority:r.priority,end:r.end})) };
};
async function setup(width, slow = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width <= 430 ? 3 : 2, hasTouch: width <= 430 });
  const page = await context.newPage(), errors = [], rows = new Map();
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (slow) await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:100, downloadThroughput:1250000, uploadThroughput:1250000 });
  cdp.on('Network.requestWillBeSent', e => rows.set(e.requestId, { url:e.request.url, type:e.type, start:e.timestamp, priority:e.request.initialPriority, initiator:e.initiator.type }));
  cdp.on('Network.responseReceived', e => Object.assign(rows.get(e.requestId)||{}, { status:e.response.status, mime:e.response.mimeType, response:e.timestamp }));
  cdp.on('Network.loadingFinished', e => Object.assign(rows.get(e.requestId)||{}, { bytes:e.encodedDataLength, end:e.timestamp }));
  cdp.on('Network.loadingFailed', e => Object.assign(rows.get(e.requestId)||{}, { error:e.errorText }));
  return { context, page, cdp, errors, rows };
}
const images = (page, selector) => (typeof selector === 'string' ? page.locator(selector) : selector).evaluateAll(elements => elements.map(img => {
  const r=img.getBoundingClientRect(), s=getComputedStyle(img);
  return {src:img.getAttribute('src'),alt:img.alt,href:img.closest('a')?.getAttribute('href'),width:+r.width.toFixed(2),height:+r.height.toFixed(2),
    y:+(r.y+scrollY).toFixed(2),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:s.objectFit,position:s.objectPosition,
    loading:img.getAttribute('loading'),ready:img.complete&&img.naturalWidth>0,clone:!!img.closest('.slick-cloned')};
}));
async function ready(locator) {
  await locator.evaluate(async img => { await img.decode(); });
  await locator.waitFor({ state:'visible', timeout:60000 });
}
async function screenshot(page, locator, name) {
  await page.evaluate(()=>document.fonts.ready);
  const filename=`screenshots/${stage}/${name}.png`;
  await locator.screenshot({path:`${out}/${filename}`,animations:'disabled',scale:'css'});
  const dom = await images(page, locator);
  const record={name,images:dom,file:filename}; visual.push(record);
  if (prior) {
    const old=prior.visual.find(r=>r.name===name); assert(old, name);
    const comparable=arr=>JSON.parse(JSON.stringify(arr.map(({loading,ready,y,...r})=>r)));
    assert.deepEqual(comparable(dom),comparable(old.images),`URL, pixels, crop and dimensions: ${name}`);
    const first=await sharp(`${out}/${old.file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const next=await sharp(`${out}/${filename}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual(next.info,first.info,name);
    let maximum=0,total=0,overTwo=0; for(let i=0;i<first.data.length;i++){const d=Math.abs(first.data[i]-next.data[i]);maximum=Math.max(maximum,d);total+=d;if(d>2)overTwo++;}
    record.pixelDifference={maximum,mean:total/first.data.length,overTwo,channels:first.data.length};
    // Gallery img bounds can include adjacent rounded/clipped UI. Preserve exact
    // geometry/source checks above and allow only rare edge raster differences.
    const galleryEdge=name.startsWith('gallery-')||name.startsWith('lightbox-');
    assert(maximum<=2 || (galleryEdge && maximum<=8 && record.pixelDifference.mean<=.15 && overTwo/first.data.length<=.0001),`Screenshot ${name}: maximum pixel difference ${maximum}`);
    record.passed=true;
  }
}
async function gallery(page, width, kind) {
  const active=page.locator('.album_pro .slick-active:not(.slick-cloned) a[data-gallery]').first();
  await active.scrollIntoViewIfNeeded(); await ready(active.locator('img'));
  await page.waitForTimeout(1000);
  await screenshot(page,active.locator('img'),`gallery-${kind}-${width}`);
  const originals=await page.locator('.album_pro .slick-slide:not(.slick-cloned) a[data-gallery]').evaluateAll(els=>els.map(e=>({src:e.querySelector('img').getAttribute('src'),href:e.getAttribute('href'),index:Number(e.dataset.index)})));
  const before=await page.evaluate(()=>({url:location.href,overflow:document.body.style.overflow,scroll:scrollY}));
  await active.click();
  const photo=page.locator('.vehicle-lightbox__image'); await ready(photo);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  assert.equal(page.url(),before.url);
  await screenshot(page,photo,`lightbox-${kind}-${width}`);
  const count=page.locator('.vehicle-lightbox__count');
  assert.equal(await count.textContent(),`1 / ${originals.length}`);
  if(originals.length>1){
    await page.keyboard.press('ArrowRight'); await ready(photo);
    assert.equal(await photo.getAttribute('src'),originals[1].href||originals[1].src);
    await page.keyboard.press('ArrowLeft'); await ready(photo);
    assert.equal(await photo.getAttribute('src'),originals[0].href||originals[0].src);
    await page.locator('.vehicle-lightbox__thumbnails button').last().click(); await ready(photo);
    assert.equal(await photo.getAttribute('src'),originals.at(-1).href||originals.at(-1).src);
    await page.getByRole('button',{name:'Ảnh tiếp theo',exact:true}).click(); await ready(photo);
    assert.equal(await photo.getAttribute('src'),originals[0].href||originals[0].src);
  }
  await page.getByRole('button',{name:'Phóng to ảnh',exact:true}).click();
  assert((await photo.getAttribute('style')).includes('scale(1.5)'));
  await page.getByRole('button',{name:'Thu nhỏ ảnh',exact:true}).click();
  if(width===1440){
    await page.getByRole('button',{name:'Xem toàn màn hình',exact:true}).click();
    await page.waitForFunction(()=>!!document.fullscreenElement);
    assert.equal(await photo.getAttribute('src'),originals[0].href||originals[0].src);
    await page.getByRole('button',{name:'Thoát toàn màn hình',exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
  }
  await page.keyboard.press('Escape'); await page.locator('.vehicle-lightbox').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),before.overflow);
  assert.equal(page.url(),before.url);
  // The gallery and lightbox reuse original URLs; do not infer transfers from clone count.
  return {originals,closed:true,scrollLock:true,keyboard:true,zoom:true,fullscreen:width===1440?'PASS':'NOT TESTED'};
}
try {
  for (const [kind, route] of Object.entries(routes)) {
    if (only && kind !== only) continue;
    for (const width of onlyWidth ? [onlyWidth] : [1440,390]) {
      if(resume && records.some(r=>r.kind===kind && r.width===width))continue;
      const {context,page,errors,rows}=await setup(width);
      const response=await page.goto(`${base}${route}`,{waitUntil:'domcontentloaded',timeout:120000}); assert.equal(response.status(),200);
      await page.waitForTimeout(12000);
      const selector=kind==='home'||kind==='cars'?'.item[data-car-id] .slick-slide[data-current="true"] img':kind==='accessories'?'.tt-accessories__card .tt-accessories__image img':'.car-gallery img';
      const row={kind,width,route,status:response.status(),firstFold:snapshot(rows),initial:await images(page,selector),errors};
      records.push(row); save(`browser-${stage}.json`,{stage,routes,records,visual,failures});
      if(kind==='home'||kind==='cars'||kind==='accessories'){
        const locator=page.locator(selector);
        for(let i=0;i<await locator.count();i++){await locator.nth(i).scrollIntoViewIfNeeded();await ready(locator.nth(i));}
        await page.waitForTimeout(1500); row.afterScroll=snapshot(rows); row.scrolled=await images(page,selector);
      }else{
        row.interactions=await gallery(page,width,kind); await page.waitForTimeout(1000); row.afterOpen=snapshot(rows);
      }
      const values=[...rows.values()]; save(`waterfall-${stage}-${kind}-${width}.json`,values);
      const old=prior?.records.find(r=>r.kind===kind&&r.width===width);
      if(old){const comparable=arr=>JSON.parse(JSON.stringify(arr.map(({loading,ready,naturalWidth,naturalHeight,...r})=>r)));assert.deepEqual(comparable(row.initial),comparable(old.initial),`${kind} ${width} geometry/order/originals`);}
      assert.deepEqual(errors,[]);
      save(`browser-${stage}.json`,{stage,routes,records,visual,failures});
      console.log(JSON.stringify({stage,kind,width,firstImages:row.firstFold.imageRequests,firstBytes:row.firstFold.imageBytes,scrollBytes:row.afterScroll?.imageBytes,openBytes:row.afterOpen?.imageBytes}));
      await context.close();
    }
  }
  // Six audited breakpoints, including mobile DPR 3, real cover bytes.
  for(const width of only ? [] : [1920,1440,768,430,390,375]){
    if(resume && [`card-${width}`,`accessory-${width}`].every(name=>visual.some(r=>r.name===name&&r.passed)))continue;
    const {context,page}=await setup(width);
    await page.goto(`${base}/san-pham`,{waitUntil:'domcontentloaded',timeout:120000});
    const img=page.locator('.vehicle-results .slick-slide[data-current="true"] img').first();
    await img.scrollIntoViewIfNeeded();await ready(img);await page.waitForTimeout(1000);
    await screenshot(page,img,`card-${width}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.goto(`${base}/phu-kien-o-to`,{waitUntil:'domcontentloaded',timeout:120000});
    const accessory=page.locator('.tt-accessories__image img').first();
    await accessory.scrollIntoViewIfNeeded();await ready(accessory);await page.waitForTimeout(1000);
    await screenshot(page,accessory,`accessory-${width}`);
    await context.close();console.log(`Visual ${stage} ${width}: PASS`);
  }
  save(`browser-${stage}.json`,{stage,routes,records,visual,failures});
} catch(error){failures.push(error.stack);save(`browser-${stage}.json`,{stage,routes,records,visual,failures});throw error;}
finally{await browser.close();}
