import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const out = process.env.TEST_OUTPUT_DIR || '../toi-uu-hieu-suat-website/vehicle-model-loading';
const repeats = Number(process.env.MODEL_TEST_REPEATS || 1);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5, 'MODEL_TEST_REPEATS must be 1..5');
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
  for (const width of Array.from({ length: repeats }, () => [390, 1440]).flat()) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    page.setDefaultNavigationTimeout(120000);
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
    // Hold the RSC response: the small catalog request must finish before cars.
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
    const catalogMs = Date.now() - start;
    assert(catalogMs < 1000, `Catalog response too slow: ${catalogMs}ms`);
    assert.equal(await page.locator('.vehicle-filter-panel').getAttribute('aria-busy'), 'true');
    assert.equal(catalogCalls.length, requestsBefore + 1, 'Revisit reaches API rather than a stale browser snapshot');
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
    records.push({ width, brands: rowChecks, catalogMs, catalogRequests: catalogCalls.length, rapidSwitchPassed: true, noInitialCatalogRequests: true, errors });
    await page.close();
    console.log(`Passed ${width}px: ${brands.length} brands, complete models, catalog ${catalogMs}ms, rapid switching, deselection, preserved filters.`);
  }
  // A catalog failure is actionable and retry restores the selected brand.
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  page.setDefaultNavigationTimeout(120000);
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
} catch (error) {
  const states = [];
  for (const context of browser.contexts()) for (const page of context.pages()) {
    states.push(await page.evaluate(() => ({ url: location.href,
      base: document.querySelector('.vehicle-filter-panel')?.dataset.filterBase,
      busy: document.querySelector('.vehicle-filter-panel')?.getAttribute('aria-busy'),
      model: document.querySelector('[data-vehicle-row="models"]')?.dataset.modelBrand,
      selected: document.querySelector('.vehicle-brands__option.is-selected')?.dataset.brandSlug,
    })).catch(() => ({ unavailable: true })));
  }
  writeFileSync(`${out}/browser-failure.json`, JSON.stringify({ testedAt: new Date().toISOString(), base, records,
    error: error instanceof Error ? error.message : String(error), states }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
