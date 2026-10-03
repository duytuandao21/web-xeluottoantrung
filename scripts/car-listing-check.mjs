import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const publicResult = await fetch(`${base}/api/v1/cars?page=1&limit=6`).then(response => response.json());
const ids = page => page.locator('.vehicle-results > .item').evaluateAll(items => items.map(item => item.dataset.carId));
const waitCount = (page, count) => page.waitForFunction(count => document.querySelectorAll('.vehicle-results > .item').length === count, count);
const makePage = async width => {
  const page = await browser.newPage({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
  await page.addInitScript(() => sessionStorage.setItem('tt-site-intro-seen', '1'));
  page.on('pageerror', error => { throw error; });
  return page;
};
try {
  // Six initial cards, append without navigation, request guard and retry at the same page.
  const page = await makePage(390);
  await page.goto(`${base}/san-pham`);
  assert.deepEqual(await ids(page), publicResult.data.map(car => car.slug));
  assert.equal(await page.locator('.car-pagination').count(), 0);
  const dimensions = await page.locator('.vehicle-results > .item').evaluateAll(items => items.slice(0, 2).map(item => {
    const rect = item.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  }));
  assert.equal(dimensions[0].top, dimensions[1].top);
  assert(dimensions[0].width < 200 && dimensions[0].height < 350);
  assert.equal(await page.locator('.vehicle-results').evaluate(element => element.scrollWidth > element.clientWidth), false);
  if (publicResult.meta.totalPages > 1) {
    const firstIds = await ids(page);
    const marker = await page.locator('.vehicle-results > .item').first().evaluate(item => { item.dataset.testMarker = 'preserved'; return item.dataset.testMarker; });
    const requests = [];
    let fail = true;
    await page.route(/\/api\/v1\/cars\?/, async route => {
      requests.push(new URL(route.request().url()).searchParams);
      if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      else await route.continue();
    });
    await page.locator('.car-load-more__button').evaluate(button => { button.click(); button.click(); });
    await page.locator('.car-load-more__error').waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].get('page'), '2');
    assert.equal(requests[0].get('limit'), '6');
    assert.deepEqual(await ids(page), firstIds);
    fail = false;
    const urlBefore = page.url();
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await waitCount(page, Math.min(12, publicResult.meta.total));
    assert.equal(requests[1].get('page'), '2');
    assert.equal(page.url(), urlBefore);
    assert.deepEqual((await ids(page)).slice(0, 6), firstIds);
    assert.equal(await page.locator('.vehicle-results > .item').first().getAttribute('data-test-marker'), marker);
    for (let currentPage = 3; currentPage <= publicResult.meta.totalPages; currentPage++) {
      await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
      await waitCount(page, Math.min(currentPage * 6, publicResult.meta.total));
      assert.equal(requests.at(-1).get('page'), String(currentPage));
    }
    const allIds = await ids(page);
    assert.equal(new Set(allIds).size, allIds.length);
    assert.equal(allIds.length, publicResult.meta.total);
    assert.equal(await page.locator('.car-load-more__button').count(), 0);
  }
  await page.close();
  console.log('Passed two-column mobile layout, six at a time, append to end, no navigation, repeated clicks, error/retry and preserved cards.');

  // Sort/filter queries survive every load; changing filters cancels the previous batch.
  const sorted = await makePage(1440);
  await sorted.goto(`${base}/san-pham?gia=gia%20asc`);
  const ascending = await sorted.request.get(`${base}/api/v1/cars?sort=price_asc&limit=6`).then(response => response.json());
  assert.deepEqual(await ids(sorted), ascending.data.map(car => car.slug));
  const firstCardWidth = await sorted.locator('.vehicle-results > .item').first().evaluate(item => item.getBoundingClientRect().width);
  assert(firstCardWidth > 300);
  if (ascending.meta.totalPages > 1) {
    let release;
    let requested;
    const held = new Promise(resolve => { release = resolve; });
    await sorted.route(/\/api\/v1\/cars\?/, async route => {
      requested = new URL(route.request().url()).searchParams;
      await held;
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ ...ascending.data[0], slug: 'stale-result' }], meta: { page: 2, limit: 6, total: 7, totalPages: 2 } }) }); } catch { /* Navigation aborted this request. */ }
    });
    await sorted.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await sorted.waitForFunction(() => document.querySelector('.vehicle-results').getAttribute('aria-busy') === 'true');
    assert.equal(requested.get('sort'), 'price_asc');
    assert.equal(requested.get('page'), '2');
    await sorted.locator('#vehicle-sort').selectOption('gia desc');
    await sorted.waitForURL(url => url.searchParams.get('gia') === 'gia desc');
    const descending = await sorted.request.get(`${base}/api/v1/cars?sort=price_desc&limit=6`).then(response => response.json());
    await waitCount(sorted, descending.data.length);
    release();
    await sorted.waitForTimeout(200);
    assert.deepEqual(await ids(sorted), descending.data.map(car => car.slug));
    await sorted.unroute(/\/api\/v1\/cars\?/);
  }
  await sorted.goto(`${base}/san-pham?hang-xe=${publicResult.data[0].brand.slug}`);
  const branded = await sorted.request.get(`${base}/api/v1/cars?brand=${publicResult.data[0].brand.slug}&limit=6`).then(response => response.json());
  assert.deepEqual(await ids(sorted), branded.data.map(car => car.slug));
  if (branded.meta.totalPages > 1) {
    let request;
    await sorted.route(/\/api\/v1\/cars\?/, async route => { request = new URL(route.request().url()).searchParams; await route.continue(); });
    await sorted.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await waitCount(sorted, Math.min(12, branded.meta.total));
    assert.equal(request.get('brand'), publicResult.data[0].brand.slug);
  }
  await sorted.close();
  console.log('Passed desktop card size, sorting, brand filters and stale-request cancellation.');

  // Compact cards at small phone widths, and the homepage uses the same two-column layout.
  const small = await makePage(320);
  await small.goto(`${base}/san-pham`);
  assert.equal(await small.locator('.vehicle-results').evaluate(element => element.scrollWidth > element.clientWidth), false);
  const titleSizes = await small.locator('.vehicle-results .name_sp a').evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  assert(titleSizes.every(height => height === 42));
  await small.goto(base);
  const firstRow = await small.locator('.loadthem_sp1 > .item').evaluateAll(items => items.slice(0, 2).map(item => item.getBoundingClientRect().top));
  assert.equal(firstRow[0], firstRow[1]);
  await small.close();

  // Protected plate search also appends six per click and clears on sign-out. All auth/API writes are mocked.
  const env = await readFile('.env.local', 'utf8');
  const authUrl = env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  assert(authUrl);
  const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
  const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: expires, role: 'authenticated' })}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } };
  const sale = await makePage(390);
  await sale.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
  const saleCars = Array.from({ length: 13 }, (_, index) => ({ ...publicResult.data[0], slug: `sale-fixture-${index + 1}`, name: `Xe thử ${index + 1}` }));
  const saleRequests = [];
  await sale.route('**/api/v1/sale/**', async route => {
    const request = route.request(), url = new URL(request.url());
    assert.match(request.headers().authorization, /^Bearer /);
    if (url.pathname.endsWith('/license-plates')) {
      const slugs = (url.searchParams.get('slugs') || '').split(',').filter(Boolean);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.fromEntries(slugs.map(slug => [slug, '51A12345']))) });
    } else {
      saleRequests.push(url.searchParams);
      const page = Number(url.searchParams.get('page'));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: saleCars.slice((page - 1) * 6, page * 6), meta: { page, limit: 6, total: 13, totalPages: 3 } }) });
    }
  });
  await sale.route('**/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }));
  await sale.goto(`${base}/san-pham?keyword=51A12345`);
  await waitCount(sale, 6);
  assert.equal(await sale.locator('.td_dem span').innerText(), '13');
  for (const count of [12, 13]) {
    await sale.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await waitCount(sale, count);
  }
  assert.deepEqual(await ids(sale), saleCars.map(car => car.slug));
  assert.equal(await sale.locator('.car-load-more__button').count(), 0);
  assert(saleRequests.every(params => params.get('limit') === '6' && params.get('search') === '51A12345'));
  await sale.locator('.wap_header .sale-header-button').evaluate(button => button.click());
  await sale.waitForFunction(() => !document.querySelector('[data-car-id^="sale-fixture-"]'));
  assert.equal(await sale.locator('.car-license-plate').count(), 0);
  await sale.close();
  console.log('Passed small phones, homepage layout, protected sale search, final partial batch and sign-out privacy.');
} finally { await browser.close(); }
