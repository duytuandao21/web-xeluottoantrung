import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const cars = await fetch(`${base}/api/v1/cars?limit=100`).then(response => response.json());
const accessories = await fetch(`${base}/api/v1/accessories?limit=100`).then(response => response.json());
const [carA, carB] = [...new Set(cars.data.map(car => car.brand.slug))];
const [accessoryA, accessoryB] = [...new Set(accessories.data.map(item => item.brandId).filter(Boolean))];
assert(carA && carB && accessoryA && accessoryB);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => { throw error; });
    await page.goto(`${base}/san-pham?hang-xe=${carA},${carB}&gia=gia%20asc&so-km=0-100000`);
    await page.locator('#ngansach-range .ui-slider-handle').first().waitFor({ state: 'attached' });
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 1);
    const normalized = await page.locator('.vehicle-filter-panel').getAttribute('data-filter-base');
    assert.equal(new URL(normalized, base).searchParams.get('hang-xe'), carA);
    const expected = await fetch(`${base}/api/v1/cars?brand=${carA}&sort=price_asc&mileage_min=0&mileage_max=100000&limit=6`).then(response => response.json());
    assert.deepEqual(await page.locator('.vehicle-results > .item').evaluateAll(items => items.map(item => item.dataset.carId)), expected.data.map(car => car.slug));
    const carLink = page.locator(`.vehicle-brands__option[href*="hang-xe=${carB}"]`);
    await carLink.click();
    await page.waitForURL(url => url.searchParams.get('hang-xe') === carB);
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 1);
    assert.equal(new URL(page.url()).searchParams.get('gia'), 'gia asc');
    assert.equal(new URL(page.url()).searchParams.get('so-km'), '0-100000');
    await page.locator('.vehicle-brands__option.is-selected').click();
    await page.waitForURL(url => !url.searchParams.has('hang-xe'));
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 0);

    await page.locator('.vehicle-filter-panel__open').click();
    await page.locator(`.goiy_hangxe p[data-id="${carA}"]`).click();
    await page.locator(`.goiy_hangxe p[data-id="${carB}"]`).click();
    assert.equal(await page.locator('.goiy_hangxe .active_tk').count(), 1);
    assert.equal(await page.locator('.goiy_hangxe .active_tk').getAttribute('data-id'), carB);
    await page.locator('.apdung').click();
    await page.waitForURL(url => url.searchParams.get('hang-xe') === carB);
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 1);

    const category = accessories.data.find(item => item.brandId === accessoryA)?.categoryId;
    const accessoryQuery = new URLSearchParams({ brand: `${accessoryA},${accessoryB}`, sort: 'price-desc', search: 'a' });
    if (category) accessoryQuery.set('category', category);
    await page.goto(`${base}/phu-kien-o-to?${accessoryQuery}`);
    assert.equal(await page.locator('.tt-accessory-filters__brand.is-selected').count(), 1);
    assert.equal(new URL(await page.locator('.tt-accessory-filters__brand.is-selected').getAttribute('href'), base).searchParams.has('brand'), false);
    await page.locator(`.tt-accessory-filters__brand[href*="brand=${accessoryB}"]`).click();
    await page.waitForURL(url => url.searchParams.get('brand') === accessoryB);
    assert.equal(await page.locator('.tt-accessory-filters__brand.is-selected').count(), 1);
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'price-desc');
    assert.equal(new URL(page.url()).searchParams.get('search'), 'a');
    if (category) assert.equal(new URL(page.url()).searchParams.get('category'), category);
    await page.locator('.tt-accessory-filters__brand.is-selected').click();
    await page.waitForURL(url => !url.searchParams.has('brand'));
    assert.equal(await page.locator('.tt-accessory-filters__brand.is-selected').count(), 0);
    console.log(`Passed ${width}px: one car/accessory brand, replacement, deselection, modal apply, old multi-brand URLs and preserved filters.`);
    await page.close();
  }
} finally { await browser.close(); }
