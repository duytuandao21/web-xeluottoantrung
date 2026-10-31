// Requires production builds of Web/Admin and compiled API tests. Uses PGlite,
// fixture auth/storage and intercepted browser requests; no live DB/API/R2.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const webRoot = process.cwd(), apiRoot = resolve('../api-xeluottoantrung'), adminRoot = resolve('../admin-xeluottoantrung');
const out = resolve('artifacts/accessory-slugs');
await mkdir(out, { recursive: true });
const { createQueryCacheFixture } = await import(pathToFileURL(resolve(apiRoot, '.test-dist/test/fixtures/query-cache-fixture.js')).href);
const logs = [], children = [], results = [];
let fixture, api, browser;
const timeout = setTimeout(() => { void browser?.close(); }, 240000);
const start = async (cwd, port, apiUrl) => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    { cwd, env: { ...process.env, API_URL: apiUrl, HOME_CMS_COMPOSITION: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}${cwd === webRoot ? '/TV/QR-xeluottoantrung.svg' : '/images/logo-gold.png'}`); return; }
    catch { if (child.exitCode !== null) throw Error(logs.join('')); await new Promise(done => setTimeout(done, 100)); }
  }
  throw Error('Local Next server did not start');
};
try {
  process.chdir(apiRoot); fixture = await createQueryCacheFixture(); process.chdir(webRoot);
  api = await fixture.createApp(false);
  const request = async (path, method = 'GET', body) => {
    const response = await api.app.inject({ method, url: `/api/v1${path}`, headers: { authorization: 'Bearer phase3-local', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { payload: body } : {}) });
    assert(response.statusCode < 400, `${method} ${path}: ${response.statusCode} ${response.body}`);
    return response.statusCode === 204 ? null : response.json();
  };
  const brand = await request('/admin/collections/accessory-brands', 'POST', { name: '70mai' });
  const category = await request('/admin/collections/accessory-categories', 'POST', { name: 'Camera hành trình' });
  const items = [];
  for (let i = 0; i < 12; i++) items.push(await request('/admin/collections/accessories', 'POST', {
    name: i === 0 ? 'Camera 70mai A810' : `Camera 70mai ${i}`, brandId: brand.id, categoryId: category.id,
    price: 1500000 + i * 10000, sortOrder: i, imageUrl: 'https://fixture.invalid/cover.jpg',
    imageUrls: ['https://fixture.invalid/side.jpg'], description: '<p>Mô tả phụ kiện kiểm thử</p>', status: 'active',
  }));
  await request('/admin/seo', 'PUT', { routePath: `/phu-kien-o-to/${items[0].slug}`, metaTitle: 'Camera SEO fixture', robotsIndex: true, robotsFollow: true });
  await start(webRoot, 3125, api.url);
  await start(adminRoot, 3123, api.url);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
  const context = async (width, admin = false) => {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    await ctx.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname.startsWith('/api/v1/')) {
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' } });
        if (url.pathname === '/api/v1/admin/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          profile: { id: '49332fa0-8244-4b20-a8d0-9793b72ef689', fullName: 'Fixture Admin', status: 'active' },
          roles: ['ADMIN'], permissions: ['content.read', 'content.create', 'content.update', 'content.delete'],
        }), headers: { 'access-control-allow-origin': '*' } });
        const response = await api.app.inject({ method: req.method(), url: url.pathname + url.search,
          headers: { authorization: 'Bearer phase3-local', 'content-type': 'application/json' },
          ...(!['GET', 'HEAD'].includes(req.method()) ? { payload: req.postData() || '{}' } : {}) });
        return route.fulfill({ status: response.statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: response.body });
      }
      if (url.hostname === 'fixture.invalid') return req.method() === 'PUT' ? route.fulfill({ status: 200, body: '' }) : route.fulfill({ contentType: 'image/jpeg', body: photo });
      if (!['http://127.0.0.1:3125', 'http://127.0.0.1:3123'].includes(url.origin)) return route.abort();
      return route.continue();
    });
    if (admin) {
      const env = await readFile(resolve(adminRoot, '.env'), 'utf8');
      const authUrl = env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
      assert(authUrl, 'Admin public auth URL is required to seed an intercepted fixture session');
      const key = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const user = { id: '49332fa0-8244-4b20-a8d0-9793b72ef689', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
      const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp, role: 'authenticated' })}.fixture`, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
      await ctx.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); localStorage.setItem('admin-sidebar', 'false'); }, { key, session });
    }
    return ctx;
  };
  // Check the actual HTTP status/location and SSR metadata, not only client navigation.
  const old = await fetch(`http://127.0.0.1:3125/phu-kien-o-to/${items[0].id}`, { redirect: 'manual' });
  assert.equal(old.status, 308);
  assert.equal(old.headers.get('location'), `/phu-kien-o-to/${items[0].slug}`);
  await old.body?.cancel();
  const html = await fetch(`http://127.0.0.1:3125/phu-kien-o-to/${items[0].slug}`).then(response => response.text());
  assert(html.includes('Camera SEO fixture'));
  assert(html.includes(`rel="canonical" href="https://xeluottoantrung.com/phu-kien-o-to/${items[0].slug}"`));
  const sitemap = await fetch('http://127.0.0.1:3125/sitemap.xml?section=accessories&page=1').then(response => response.text());
  assert(sitemap.includes(`/phu-kien-o-to/${items[0].slug}`));
  assert(!sitemap.includes(items[0].id));
  results.push({ permanentUuidRedirect: 308, canonicalAndCustomSeo: true, sitemapSlugs: true });
  for (const width of [1440, 390]) {
    const ctx = await context(width), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(20000); page.on('pageerror', error => { const item = { url: page.url(), message: error.message, stack: error.stack }; errors.push(item); console.error(JSON.stringify(item)); });
    await page.goto('http://127.0.0.1:3125/phu-kien-o-to');
    await page.locator('.tt-accessories__grid > article').first().waitFor();
    assert.equal(await page.locator('.tt-accessories__grid > article').count(), 8);
    assert(await page.locator('.tt-accessories__grid a').evaluateAll(links => links.every(link => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(link.pathname))));
    await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tt-accessories__grid > article').length === 12);
    await page.goto(`http://127.0.0.1:3125/phu-kien-o-to?brand=${brand.id}&category=${category.id}&search=${encodeURIComponent(items[0].name)}&sort=price-desc`);
    await page.locator('.tt-accessories__grid > article').first().waitFor();
    assert.equal(await page.locator('.tt-accessories__grid > article').count(), 1);
    await page.locator('.tt-accessories__grid h3 a').click();
    await page.waitForURL(`**/phu-kien-o-to/${items[0].slug}`);
    assert.equal(await page.locator('.tt-accessory-detail h1').innerText(), items[0].name);
    assert(await page.locator('.tt-accessory-detail__gallery img').count() >= 2);
    assert(await page.locator('.tt-accessory-related__track a').evaluateAll(links => links.every(link => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(link.pathname))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${out}/web-${width}.png`, fullPage: true });
    await page.goto(`http://127.0.0.1:3125/phu-kien-o-to/${items[0].id}`);
    await page.waitForURL(`**/phu-kien-o-to/${items[0].slug}`);
    await page.goto('http://127.0.0.1:3125');
    await page.locator('#tt-accessories-root .tt-accessories__card').first().waitFor();
    assert(await page.locator('#tt-accessories-root h3 a').evaluateAll(links => links.every(link => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(link.pathname))));
    assert.deepEqual(errors, []);
    results.push({ web: width, listingAndLoadMore: true, filters: true, galleryAndRelated: true, homeLinks: true, uuidNavigation: true });
    console.log(JSON.stringify(results.at(-1)));
    await ctx.close();
  }
  for (const width of [1440, 390]) {
    const ctx = await context(width, true), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(20000); page.on('pageerror', error => { const item = { url: page.url(), message: error.message, stack: error.stack }; errors.push(item); console.error(JSON.stringify(item)); });
    await page.goto('http://127.0.0.1:3123/phu-kien-o-to');
    await page.getByRole('button', { name: 'Thêm mới', exact: true }).waitFor();
    if (width < 900 && await page.locator('main').evaluate(node => node.getBoundingClientRect().left > 100)) {
      await page.locator('header button').first().click();
      await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().left < 100);
    }
    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    await page.locator('input[name="name"]').fill(items[0].name);
    assert.equal(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).inputValue(), `/phu-kien-o-to/${items[0].slug}`);
    assert.equal(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).getAttribute('name'), null);
    assert(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).evaluate(node => node.readOnly));
    await page.locator('select[name="brandId"]').selectOption(brand.id);
    await page.locator('select[name="categoryId"]').selectOption(category.id);
    await page.locator('input[name="price"]').fill('1700000');
    await page.locator('input[type="file"][name="imageUrl"]').setInputFiles(resolve('../admin-xeluottoantrung/scripts/fixtures/image-metadata/still.png'));
    const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/admin/collections/accessories') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    const createdHttp = await createdResponse;
    assert.equal(createdHttp.status(), 201);
    assert(!('slug' in createdHttp.request().postDataJSON()));
    const created = await createdHttp.json();
    assert.equal(created.slug, `${items[0].slug}-2`);
    await page.locator('input[name="name"]').waitFor({ state: 'detached' });
    await page.locator('main input[placeholder="Tìm phụ kiện..."]').fill(created.name);
    const row = page.locator('tbody tr').filter({ hasText: '1.700.000' });
    await row.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    assert.equal(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).inputValue(), `/phu-kien-o-to/${created.slug}`);
    await page.locator('input[name="name"]').fill('Camera đã đổi tên');
    await page.locator('input[name="price"]').fill('1800000');
    assert.equal(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).inputValue(), `/phu-kien-o-to/${created.slug}`);
    await page.screenshot({ path: `${out}/admin-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await page.locator('input[name="name"]').waitFor({ state: 'detached' });
    const updated = await request(`/admin/collections/accessories/${created.id}`);
    assert.equal(updated.slug, created.slug); assert.equal(updated.name, 'Camera đã đổi tên'); assert.equal(Number(updated.price), 1800000);
    await request(`/admin/collections/accessories/${created.id}`, 'PATCH', { status: 'inactive' });
    for (const key of [created.id, created.slug]) assert.equal((await api.app.inject({ method: 'GET', url: `/api/v1/accessories/${key}` })).statusCode, 404);
    await request(`/admin/collections/accessories/${created.id}`, 'DELETE');
    await page.goto('http://127.0.0.1:3123/phu-kien-o-to/danh-muc');
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).first().click();
    assert.equal(await page.getByLabel('Đường dẫn phụ kiện', { exact: true }).count(), 0, 'Other CrudPage forms keep their fields');
    assert.deepEqual(errors, []);
    results.push({ admin: width, readonlyPreview: true, duplicateCreatesNumberedSlug: true, renameAndPriceKeepSlug: true, hidden404: true, categoryFormUnchanged: true });
    console.log(JSON.stringify(results.at(-1)));
    await ctx.close();
  }
  await writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  process.chdir(webRoot);
  await browser?.close();
  for (const child of children) {
    child.kill();
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(done => setTimeout(done, 3000))]);
  }
  await api?.app.close(); await fixture?.pg.close();
  await writeFile(`${out}/servers.log`, logs.join(''));
  process.exit(process.exitCode || 0);
}
