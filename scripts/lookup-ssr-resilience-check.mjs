// Production Next SSR with an isolated HTTP API; no real database or writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

let lookupFailure = 0, inventoryFailure = false;
const reads = [], logs = [];
const car = { id: 'fixture-car', slug: 'fixture-car', name: 'SSR fixture Toyota', price: 433000000, year: 2025,
  mileage: 20000, status: 'active', cover: '/fixture-car.svg', fuel: 'Xang', transmission: 'Automatic',
  brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' } };
const result = (data = []) => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.test'), path = url.pathname;
  reads.push({ path, query: Object.fromEntries(url.searchParams) });
  let status = 200, data = result(), retryAfter;
  if (path === '/api/v1/cars') {
    if (inventoryFailure) { status = 503; data = { message: 'Fixture unavailable' }; retryAfter = '60'; }
    else data = result([car]);
  } else if (path === '/api/v1/brands') data = [{ id: 'brand', name: 'Toyota', slug: 'toyota', stockCount: 1 }];
  else if (path === '/api/v1/brands/toyota/models') data = [{ id: '0c1495b7-5103-41df-a91f-d560663c0db7', name: 'Vios', slug: 'vios' }];
  else if (path.startsWith('/api/v1/lookups/')) {
    if (lookupFailure && /\/(branches|body-styles|car-versions)$/.test(path)) { status = lookupFailure; data = { message: 'Fixture unavailable' }; retryAfter = lookupFailure === 429 ? '60' : '0'; }
    else if (path.endsWith('/body-styles')) data = result([{ id: 'style', slug: 'sedan', name: 'Sedan' }]);
  } else if (path === '/api/v1/content' || path.startsWith('/api/v1/site-settings/')) data = [];
  else if (path === '/api/v1/promotions/popup') data = null;
  else if (path === '/api/v1/seo' || /^\/api\/v1\/(cars|pages|articles|services|faqs)\//.test(path)) { status = 404; data = {}; }
  response.writeHead(status, { 'Content-Type': 'application/json', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) });
  response.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));
let child, browser;
try {
  await listen(api); const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const reservation = createServer(); await listen(reservation); const port = reservation.address().port;
  await new Promise(done => reservation.close(done)); const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', String(port)], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, API_URL: apiUrl },
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (logs.length < 1000) logs.push(chunk.toString()); });
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null) throw Error('Next exited: ' + logs.join(''));
    try { if ((await fetch(base + '/tuyen-dung', { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
    if (attempt >= 60) throw Error('Next unavailable'); await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture-car.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#eee"/></svg>' });
    if (route.request().headers()['next-router-prefetch']) return route.abort();
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const status of [429, 503]) {
    lookupFailure = status;
    for (const path of ['/', '/san-pham?chi-nhanh=fixture-branch&kieu-dang=sedan&hang-xe=toyota&dong-xe=vios&phien-ban=fixture-version']) {
      const before = reads.length;
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert((await page.locator('body').innerText()).includes(car.name), 'Real inventory remains visible despite lookup failure');
      assert(!/Application error|Tạm thời chưa tải được dữ liệu/.test(await page.locator('body').innerText()));
      assert(await page.locator('.wap_header').count());
      if (path !== '/') {
        assert.equal(await page.locator('.vehicle-results > .item').count(), 1);
        assert(reads.slice(before).some(read => read.path === '/api/v1/cars' && read.query.branch === 'fixture-branch' && read.query.body_type === 'sedan'), 'Lookup outage must not erase selected inventory filters');
        assert(reads.slice(before).some(read => read.path === '/api/v1/cars' && read.query.version === 'fixture-version'), 'Unavailable versions must not broaden the inventory query');
      }
    }
    console.log(status, 'home/listing SSR survives lookup failure, preserves filters and real inventory');
  }
  assert.deepEqual(errors, [], 'No uncaught Server Component error for optional lookup outages');
  // If a lookup is essential to classify a route, use the bounded retry state
  // rather than guessing a model/body-style or returning an incorrect 404.
  await page.goto(base + '/sedan', { waitUntil: 'networkidle' });
  await page.locator('main[role="alert"]').waitFor();
  assert(!/Application error|404/.test(await page.locator('body').innerText()));
  lookupFailure = 0; inventoryFailure = true;
  await page.goto(base + '/san-pham', { waitUntil: 'networkidle' });
  const failure = page.locator('main[role="alert"]');
  await failure.waitFor();
  assert((await failure.innerText()).includes('Tạm thời chưa tải được dữ liệu'));
  assert(!/Có\s*0\s*xe/.test(await page.locator('body').innerText()), 'Inventory failure is not an empty successful listing');
  inventoryFailure = false;
  await failure.getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('.vehicle-results > .item').first().waitFor();
  assert.equal(await page.locator('.vehicle-results > .item').count(), 1);
  assert.equal(await failure.count(), 0);
  assert(logs.join('').includes('public_api_read_failure') && logs.join('').includes('/lookups/branches'), 'Structured endpoint failure logs exist');
  console.log('Required inventory failure is isolated from header/footer, never shown as zero cars, and recovers on a fresh render.');
} finally {
  await browser?.close(); child?.kill(); await new Promise(done => api.close(done));
}
