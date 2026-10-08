import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const get = async query => {
  const params = new URLSearchParams(query);
  if (!params.has('sort')) params.set('sort', 'newest');
  params.set('limit', '6');
  return fetch(`${base}/api/v1/accessories?${params}`).then(response => response.json());
};
const initial = await get('');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ids = page => page.locator('.tt-accessories__grid > article').evaluateAll(cards => cards.map(card => card.dataset.accessoryId));
const waitCount = (page, count) => page.waitForFunction(count => document.querySelectorAll('.tt-accessories__grid > article').length === count, count);
try {
  for (const width of [320, 390, 430, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    page.on('pageerror', error => { throw error; });
    await page.goto(`${base}/phu-kien-o-to`);
    assert.deepEqual(await ids(page), initial.data.map(item => item.id));
    assert.equal(await page.locator('.car-pagination').count(), 0);
    const dimensions = await page.locator('.tt-accessories__grid > article').evaluateAll(cards => cards.slice(0, 4).map(card => {
      const rect = card.getBoundingClientRect();
      const price = card.querySelector('.tt-accessories__price');
      return { top: rect.top, right: rect.right, height: rect.height, priceFits: price.scrollWidth <= price.clientWidth };
    }));
    assert.equal(dimensions[0].top, dimensions[1].top);
    assert(dimensions.every(card => card.priceFits), 'Full accessory prices fit inside their cards.');
    if (width < 600) {
      assert(dimensions[2].top > dimensions[0].top);
      assert(dimensions.every(card => card.height < 335));
    } else assert.equal(dimensions[0].top, dimensions[3].top);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    if (width === 390 && initial.meta.totalPages > 1) {
      const url = page.url();
      await page.locator('.tt-accessories__grid > article').first().evaluate(card => { card.dataset.testPreserved = 'yes'; });
      const requests = [];
      let fail = true;
      await page.route(/\/api\/v1\/accessories\?/, async route => {
        requests.push(new URL(route.request().url()).searchParams);
        if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        else await route.continue();
      });
      await page.locator('.car-load-more__button').evaluate(button => { button.click(); button.click(); });
      await page.locator('.car-load-more__error').waitFor();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].get('page'), '2');
      assert.equal(requests[0].get('limit'), '6');
      assert.equal((await ids(page)).length, 6);
      fail = false;
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await waitCount(page, Math.min(12, initial.meta.total));
      assert.equal(requests[1].get('page'), '2');
      for (let next = 3; next <= initial.meta.totalPages; next++) {
        await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
        await waitCount(page, Math.min(next * 6, initial.meta.total));
      }
      assert.equal(page.url(), url);
      assert.equal(await page.locator('.tt-accessories__grid > article').first().getAttribute('data-test-preserved'), 'yes');
      assert.deepEqual((await ids(page)).slice(0, 6), initial.data.map(item => item.id));
      assert.equal(new Set(await ids(page)).size, initial.meta.total);
      assert.equal(await page.locator('.car-load-more__button').count(), 0);
      console.log('Passed six per click, double-click guard, error/retry, preserved cards, no navigation and load to end.');
    }
    await page.close();
    console.log(`Passed ${width}px accessory cards and prices.`);
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${base}/phu-kien-o-to?sort=price-asc`);
  const ascending = await get('sort=price-asc');
  assert.deepEqual(await ids(page), ascending.data.map(item => item.id));
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  await page.route(/\/api\/v1\/accessories\?/, async route => {
    const params = new URL(route.request().url()).searchParams;
    assert.equal(params.get('sort'), 'price-asc');
    assert.equal(params.get('limit'), '6');
    started();
    await held;
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ ...ascending.data[0], id: 'stale-fixture' }], meta: { page: 2, limit: 6, total: 7, totalPages: 2 } }) }); } catch { /* Filter navigation aborts the old request. */ }
  });
  await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
  await requested;
  await page.locator('.tt-accessory-filters__sort select').selectOption('price-desc');
  await page.waitForURL(url => url.searchParams.get('sort') === 'price-desc');
  const descending = await get('sort=price-desc');
  await waitCount(page, 6);
  release();
  await page.waitForTimeout(200);
  assert.deepEqual(await ids(page), descending.data.map(item => item.id));
  await page.unroute(/\/api\/v1\/accessories\?/);

  const all = await fetch(`${base}/api/v1/accessories?limit=100`).then(response => response.json());
  const brandCounts = new Map();
  for (const item of all.data) if (item.brandId) brandCounts.set(item.brandId, (brandCounts.get(item.brandId) || 0) + 1);
  const brand = [...brandCounts].find(([, count]) => count > 6)?.[0];
  if (brand) {
    await page.goto(`${base}/phu-kien-o-to?brand=${brand}`);
    let request;
    await page.route(/\/api\/v1\/accessories\?/, async route => { request = new URL(route.request().url()).searchParams; await route.continue(); });
    await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await waitCount(page, Math.min(12, brandCounts.get(brand)));
    assert.equal(request.get('brandId'), brand);
    await page.unroute(/\/api\/v1\/accessories\?/);
  }
  const item = all.data.find(item => item.categoryId && item.brandId);
  if (item) {
    const params = new URLSearchParams({ brand: item.brandId, category: item.categoryId, search: item.name, sort: 'price-desc' });
    await page.goto(`${base}/phu-kien-o-to?${params}`);
    const filtered = await get(new URLSearchParams({ brandId: item.brandId, categoryId: item.categoryId, search: item.name, sort: 'price-desc' }));
    assert.deepEqual(await ids(page), filtered.data.map(item => item.id));
  }
  await page.locator('.tt-accessory-filters__reset').click();
  await page.waitForURL(`${base}/phu-kien-o-to`);
  await waitCount(page, 6);
  assert.deepEqual(await ids(page), initial.data.map(item => item.id));
  await page.goto(`${base}/phu-kien-o-to?search=missing-accessory-fixture-82731`);
  await page.locator('.tt-accessories__empty').waitFor();
  assert.equal(await page.locator('.car-load-more__button').count(), 0);
  console.log('Passed sorting, stale request cancellation, brand/category/search filters, reset and empty results.');
  await page.goto(base);
  const homeCards = page.locator('#tt-accessories-root .tt-accessories__card');
  await homeCards.first().waitFor();
  const visible = await homeCards.evaluateAll(cards => {
    const viewport = cards[0].closest('.tt-accessories__viewport').getBoundingClientRect();
    return cards.filter(card => { const rect = card.getBoundingClientRect(); return rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1; }).length;
  });
  assert.equal(visible, 2);
  await page.goto(`${base}/phu-kien-o-to/${initial.data[0].id}`);
  const related = page.locator('.tt-accessory-related__track .tt-accessories__card');
  await related.first().waitFor();
  const relatedSizes = await related.evaluateAll(cards => cards.slice(0, 2).map(card => ({ width: card.getBoundingClientRect().width, parent: card.closest('.tt-accessory-related__viewport').clientWidth })));
  assert(Math.abs(relatedSizes[0].width * 2 + 8 - relatedSizes[0].parent) < 2);
  console.log('Passed two visible accessories in home and related carousels.');
} finally { await browser.close(); }
