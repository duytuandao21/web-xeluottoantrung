import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Only the dedicated PGlite fixture servers are allowed. Never use live admin.
const before = 'http://127.0.0.1:3106', after = 'http://127.0.0.1:3107', api = 'http://127.0.0.1:4107';
const out = path.resolve('../docs/artifacts/query-cache'); mkdirSync(out, { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:true });
const results = { testedAt:new Date().toISOString(), environment:'Chromium 390px viewport; local Next development + PGlite', routes:[], rapidSwitch:[], mutations:[] };
const request = async (resource, method='GET', payload) => {
  const response = await fetch(`${api}/api/v1${resource}`, { method,
    headers: method==='GET' ? {} : { authorization:'Bearer phase3-local', ...(payload ? { 'content-type':'application/json' } : {}) },
    ...(payload ? { body:JSON.stringify(payload) } : {}) });
  const body = await response.text(); assert(response.ok, `${resource}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
};
const snapshot = page => page.evaluate(() => ({ url:location.href,
  base:document.querySelector('.vehicle-filter-panel')?.dataset.filterBase,
  busy:document.querySelector('.vehicle-filter-panel')?.getAttribute('aria-busy'),
  model:document.querySelector('[data-vehicle-row="models"]')?.dataset.modelBrand,
  selected:document.querySelector('.vehicle-brands__option.is-selected')?.dataset.brandSlug,
  names:[...document.querySelectorAll('[data-vehicle-row="models"] .vehicle-filter-options a')].map(node=>node.textContent) }));
try {
  for (const [name, base] of [['before',before],['after',after]]) {
    const page = await browser.newPage({viewport:{width:390,height:950}}); page.setDefaultNavigationTimeout(120000);
    const errors=[], calls=[]; page.on('pageerror',error=>errors.push(error.message));
    page.on('request',r=>{ if(r.url().includes('/api/')) calls.push(r.url()); });
    await page.route('**/*',route => {
      const url=new URL(route.request().url());
      if (route.request().resourceType()==='image' || !['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
      return route.continue();
    });
    for (const route of ['/','/san-pham','/san-pham?hang-xe=toyota&dong-xe=vios','/toyota-vios-2025','/san-pham?page=2']) {
      const start=Date.now(), response=await page.goto(`${base}${route}`,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,route);
      await page.waitForTimeout(500); // hydration/animations, excluded from route timing.
      const rows=await page.locator('[data-car-id]').count();
      results.routes.push({name,route,status:response.status(),domReadyMs:Date.now()-start-500,title:await page.title(),cards:rows,apiBrowserCalls:calls.length});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    }
    // Force B to arrive after A: compare the same overlapping navigation on
    // both revisions. Record a mismatch without concealing other test results.
    await page.goto(`${base}/san-pham`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.vehicle-filter-panel')?.getAttribute('aria-busy')==='false');
    await page.route('**/san-pham?*',async route=>{
      if(route.request().headers().rsc!=='1') return route.continue();
      try {
        const response=await route.fetch();
        await new Promise(resolve=>setTimeout(resolve,new URL(route.request().url()).searchParams.get('hang-xe')==='honda'?1800:1200));
        await route.fulfill({response});
      } catch { await route.abort().catch(()=>{}); }
    });
    for (let trial=0;trial<3;trial++) {
      await page.goto(`${base}/san-pham`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('.vehicle-filter-panel')?.getAttribute('aria-busy')==='false');
      await page.evaluate(()=>{ for(const slug of ['toyota','honda','toyota']) document.querySelector(`[data-brand-slug="${slug}"]`).click(); });
      let passed=true;
      try { await page.waitForFunction(()=>{
        const panel=document.querySelector('.vehicle-filter-panel'), model=document.querySelector('[data-vehicle-row="models"]');
        return new URL(location.href).searchParams.get('hang-xe')==='toyota' && new URL(panel?.dataset.filterBase||'/',location.origin).searchParams.get('hang-xe')==='toyota' &&
          panel?.getAttribute('aria-busy')==='false' && model?.dataset.modelBrand==='toyota' &&
          document.querySelector('.vehicle-brands__option.is-selected')?.dataset.brandSlug==='toyota';
      },null,{timeout:15000}); } catch { passed=false; }
      const state=await snapshot(page);
      results.rapidSwitch.push({name,trial,passed,state});
    }
    assert.deepEqual(errors,[],`${name} browser runtime errors`);
    await page.close();
  }

  const cleanupModels=await request('/brands/toyota/models');
  for (const row of cleanupModels.filter(row=>row.slug.startsWith('verification-fresh-'))) await request(`/admin/car-models/${row.id}`,'DELETE');
  const pages=[];
  for (const [name,base] of [['before',before],['after',after]]) {
    const page=await browser.newPage({viewport:{width:390,height:950}}); page.setDefaultNavigationTimeout(120000);
    await page.route('**/*',r=>r.request().resourceType()==='image'?r.abort():r.continue());
    await page.goto(`${base}/san-pham?hang-xe=toyota`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-vehicle-row="models"] .vehicle-filter-options');
    // Warm Next logo cache before performing the controlled admin mutation.
    await fetch(`${base}/san-pham`).then(r=>r.text());
    pages.push({name,base,page});
  }
  const brands=await request('/brands'), toyota=brands.find(b=>b.slug==='toyota');
  const freshName=`Verification Fresh ${Date.now()}`;
  const model=await request('/admin/car-models','POST',{brandId:toyota.id,name:freshName,slug:`verification-fresh-${Date.now()}`});
  await request('/admin/site-settings/thiet-lap-logo/logo','PUT',{value:'/upload/photo/cache-updated-logo.png'});
  await request('/admin/seo','PUT',{routePath:'/san-pham',metaTitle:'Updated local inventory'});
  const cars=await request('/cars?brand=toyota');
  const car=cars.data.find(c=>c.slug==='toyota-vios-2025');
  const adminCarsResponse=await fetch(`${api}/api/v1/admin/cars?search=Toyota`,{headers:{authorization:'Bearer phase3-local'}});
  assert.equal(adminCarsResponse.status,200);
  const adminCars=await adminCarsResponse.json(), carId=adminCars.data.find(c=>c.slug===car.slug).id;
  await request(`/admin/cars/${carId}`,'PATCH',{price:390000000});
  for (const {name,base,page} of pages) {
    await page.locator('[data-brand-slug="honda"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vehicle-row="models"]')?.dataset.modelBrand==='honda');
    await page.locator('[data-brand-slug="toyota"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-vehicle-row="models"]')?.dataset.modelBrand==='toyota' && document.querySelector('[data-vehicle-row="models"]')?.getAttribute('aria-busy')==='false');
    const names=await page.locator('[data-vehicle-row="models"] .vehicle-filter-options a').allTextContents();
    const html=await fetch(`${base}/san-pham`).then(r=>r.text());
    await page.goto(`${base}/san-pham`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!document.querySelector('[data-car-id] .car-card-price'));
    const price=await page.locator(`[data-car-id="${car.slug}"] .car-card-price`).textContent();
    const observation={name,modelsFresh:names.includes(freshName),logoFresh:html.includes('/upload/photo/cache-updated-logo.png'),
      seoFresh:(await page.title())==='Updated local inventory',priceFresh:/390/.test(price),names};
    results.mutations.push(observation);
    assert.equal(observation.seoFresh,true); assert.equal(observation.priceFresh,true);
    if(name==='after') { assert.equal(observation.modelsFresh,true); assert.equal(observation.logoFresh,true); }
    await page.close();
  }
  await request(`/admin/car-models/${model.id}`,'DELETE');
  results.validationPassed=results.rapidSwitch.every(row=>row.passed);
  console.log(JSON.stringify(results,null,2));
  assert.equal(results.validationPassed,true,'Rapid switching must settle on the last selected brand');
} finally {
  writeFileSync(path.join(out,'browser-workload.json'),JSON.stringify(results,null,2)+'\n');
  await browser.close();
}
