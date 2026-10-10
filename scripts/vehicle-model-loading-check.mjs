import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const out = '../toi-uu-hieu-suat-website/vehicle-model-loading';
mkdirSync(out, { recursive: true });
async function get(path) {
  const response = await fetch(`${base}/api/v1${path}`);
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
const brands = await get('/brands'), expected = new Map();
for (const brand of brands) expected.set(brand.slug, await get(`/brands/${brand.slug}/models`));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [];
const ready = async page => page.waitForFunction(() => {
  const panel = document.querySelector('.vehicle-filter-panel');
  return panel?.getAttribute('aria-busy') === 'false' &&
    new URL(panel.dataset.filterBase, location.origin).searchParams.get('hang-xe') === new URL(location.href).searchParams.get('hang-xe');
});
const modelNames = page => page.locator('[data-vehicle-row="models"] .vehicle-filter-options a').allTextContents();
async function assertModels(page, slug) {
  await page.waitForFunction(slug => {
    const row = document.querySelector('[data-vehicle-row="models"]');
    return row?.dataset.modelBrand === slug && row.getAttribute('aria-busy') === 'false' && !!row.querySelector('.vehicle-filter-options');
  }, slug);
  assert.deepEqual(await modelNames(page), ['Tất cả', ...expected.get(slug).map(model => model.name)]);
}
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [], catalogCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/catalog/models')) catalogCalls.push(request.url()); });
    await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
    await page.goto(`${base}/san-pham?gia=gia%20asc&so-km=0-999999`);
    await ready(page);
    assert.equal(catalogCalls.length, 0, 'No model request before choosing a brand');
    const rowChecks = [];
    for (const brand of brands) {
      const start = Date.now();
      await page.locator(`[data-brand-slug="${brand.slug}"]`).click();
      await assertModels(page, brand.slug);
      const msToModels = Date.now() - start;
      await ready(page);
      assert.equal(new URL(page.url()).searchParams.get('gia'), 'gia asc');
      assert.equal(new URL(page.url()).searchParams.get('so-km'), '0-999999');
      assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 1);
      rowChecks.push({ brand: brand.slug, modelCount: expected.get(brand.slug).length, msToModels });
    }
    // Hold the RSC response: cached models must appear before the cars finish.
    let delay = 1500;
    await page.route('**/san-pham?*', async route => {
      if (route.request().headers().rsc !== '1' || !delay) return route.continue();
      try {
        const response = await route.fetch();
        await new Promise(resolve => setTimeout(resolve, delay));
        await route.fulfill({ response });
      } catch { await route.abort().catch(() => {}); }
    });
    if (new URL(page.url()).searchParams.get('hang-xe') === 'chevrolet') {
      delay = 0;
      await page.locator('[data-brand-slug="honda"]').click(); await ready(page);
      delay = 1500;
    }
    const requestsBefore = catalogCalls.length, start = Date.now();
    await page.locator('[data-brand-slug="chevrolet"]').click();
    await assertModels(page, 'chevrolet');
    const cachedMs = Date.now() - start;
    assert(cachedMs < 1000, `Cache response too slow: ${cachedMs}ms`);
    assert.equal(await page.locator('.vehicle-filter-panel').getAttribute('aria-busy'), 'true');
    assert.equal(catalogCalls.length, requestsBefore, 'Revisit uses cache without another catalog request');
    await ready(page);
    // Rapid A -> B -> A while the navigation is pending must retain the last choice.
    await page.evaluate(() => {
      for (const slug of ['toyota', 'honda', 'toyota']) document.querySelector(`[data-brand-slug="${slug}"]`).click();
    });
    await assertModels(page, 'toyota'); await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('hang-xe'), 'toyota');
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').getAttribute('data-brand-slug'), 'toyota');
    // Selecting the active brand deselects it, even during a pending navigation.
    await page.locator('[data-brand-slug="toyota"]').click(); await ready(page);
    assert.equal(await page.locator('[data-vehicle-row="models"]').count(), 0);
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    records.push({ width, brands: rowChecks, cachedMs, catalogRequests: catalogCalls.length, rapidSwitchPassed: true, noInitialCatalogRequests: true, errors });
    await page.close();
    console.log(`Passed ${width}px: ${brands.length} brands, complete models, cache ${cachedMs}ms, rapid switching, deselection, preserved filters.`);
  }
  // A catalog failure is actionable and retry restores the selected brand.
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await page.goto(`${base}/san-pham`); await ready(page);
  await page.route('**/san-pham?*', async route => {
    if (route.request().headers().rsc !== '1') return route.continue();
    try { const response = await route.fetch(); await new Promise(resolve => setTimeout(resolve, 2500)); await route.fulfill({ response }); }
    catch { await route.abort().catch(() => {}); }
  });
  let failed = false;
  await page.route('**/api/catalog/models?brand=chevrolet', route => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary failure"}' });
  });
  await page.locator('[data-brand-slug="chevrolet"]').click();
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await assertModels(page, 'chevrolet'); await ready(page);
  assert.equal(new URL(page.url()).searchParams.get('hang-xe'), 'chevrolet');
  records.push({ failureAndRetryPassed: true });
  await page.close();
  writeFileSync(`${out}/browser-results.json`, JSON.stringify({ testedAt: new Date().toISOString(), base, records }, null, 2) + '\n');
  console.log('Passed mobile error and retry recovery.');
} finally { await browser.close(); }
