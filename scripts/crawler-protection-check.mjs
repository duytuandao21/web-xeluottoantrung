// Production HTTP/browser test with an isolated, read-only API fixture.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import { chromium } from 'playwright';

const robots = await readFile('public/robots.txt', 'utf8');
const directives = robots.split(/\r?\n/).filter(Boolean).map(line => line.split(/:\s*/, 2));
assert.deepEqual(directives.filter(([key]) => key === 'User-agent'), [['User-agent', '*']], 'One shared group; no UA-specific exemptions/blocks');
const rules = directives.filter(([key]) => ['Allow', 'Disallow'].includes(key));
function allowed(target) {
  const matched = rules.filter(([, prefix]) => target.startsWith(prefix)).sort((a, b) => b[1].length - a[1].length);
  return !matched.length || matched[0][0] === 'Allow';
}
const allowedPaths = ['/', '/san-pham', '/san-pham/', '/toyota-vios-2025', '/toyota-vios-2025?ref=menu', '/toyota', '/sedan', '/ban-xe', '/len-doi', '/bai-viet', '/dich-vu', '/phu-kien-o-to', '/assets/slick/slick.css', '/_next/static/app.js', '/san-pham/chi-tiet?x=1'];
const blockedPaths = ['/san-pham?hang-xe=toyota', '/san-pham?gia=gia%20asc&so-km=0-100000', '/san-pham?xe-moi-ve=true', '/san-pham?dang-giam-gia=true', '/san-pham?x=1&hang-xe=toyota', '/san-pham/?hang-xe=toyota', '/san-pham?page=2', '/san-pham?_rsc=abc'];
for (const target of allowedPaths) assert(allowed(target), target);
for (const target of blockedPaths) assert(!allowed(target), target);
assert(robots.includes('Sitemap: https://xeluottoantrung.com/sitemap.xml'));
console.log(`PASS robots policy: ${allowedPaths.length} allowed / ${blockedPaths.length} disallowed targets`);
if (process.argv.includes('--static-only')) process.exit(0);

let seoOverride = false, sitemapSeoFailure = false, child, browser;
const reads = [];
const car = { id: 'crawler-car', slug: 'crawler-toyota', name: 'Crawler fixture Toyota', price: 433000000, originalPrice: 450000000, year: 2025, mileage: 20000, status: 'active', cover: '/images/logo.png', fuel: 'Xang', transmission: 'Automatic', brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' } };
const page = (data = []) => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.test'), p = url.pathname;
  assert.equal(req.method, 'GET', 'Read-only fixture');
  reads.push({ path: p, query: Object.fromEntries(url.searchParams) });
  let status = 200, data = page();
  if (p === '/api/v1/cars') data = page(url.searchParams.get('model') === 'sitemap.xml' ? [] : [car]);
  else if (p === '/api/v1/brands') data = [{ id: 'brand', name: 'Toyota', slug: 'toyota', stockCount: 1 }];
  else if (p === '/api/v1/brands/toyota/models') data = [];
  else if (p === '/api/v1/content' || p.startsWith('/api/v1/site-settings/')) data = [];
  else if (p === '/api/v1/seo' && sitemapSeoFailure) { status = 503; data = {}; }
  else if (p === '/api/v1/seo' && seoOverride) data = { canonicalUrl: 'https://example.test/admin-canonical', robotsIndex: true, robotsFollow: true };
  else if (p === '/api/v1/seo' || /^\/api\/v1\/(cars|pages|articles|services|faqs)\//.test(p)) { status = 404; data = {}; }
  else if (p === '/api/v1/promotions/popup') data = null;
  res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 503 ? { 'Retry-After': '60' } : {}) }); res.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));
const evidence = { robotsCases: { allowed: allowedPaths.length, disallowed: blockedPaths.length }, http: [], browser: [], noProductionRequests: true };
try {
  await listen(api); const reservation = createServer(); await listen(reservation); const port = reservation.address().port;
  await new Promise(done => reservation.close(done)); const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`, HOME_CMS_COMPOSITION: 'false', PERF_DIAGNOSTICS: 'false' } });
  for (let i = 0; ; i++) {
    try { const response = await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(2000) }); if (response.ok) { assert.equal(await response.text(), robots); break; } } catch {}
    if (i > 100 || child.exitCode !== null) throw Error('Next startup failed');
    await new Promise(done => setTimeout(done, 200));
  }
  for (const ua of ['Googlebot', 'GPTBot', 'OAI-SearchBot', 'bingbot', 'Mozilla/5.0']) {
    const response = await fetch(base + '/robots.txt', { headers: { 'User-Agent': ua } });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(await response.text(), robots);
  }
  assert.equal(reads.length, 0, 'Static robots must not call API or render root layout');
  for (const target of ['/san-pham', ...blockedPaths.filter(p => !p.includes('/?') && !p.includes('_rsc'))]) {
    const response = await fetch(base + target); const html = await response.text(); const $ = load(html);
    assert.equal(response.status, 200, target); assert(html.includes(car.name)); assert(!html.includes('Application error'));
    assert.equal(new URL($('link[rel="canonical"]').last().attr('href')).pathname, '/san-pham');
    assert.equal(new URL($('link[rel="canonical"]').last().attr('href')).search, '');
    assert.equal(new URL($('link[rel="canonical"]').last().attr('href')).origin, 'https://xeluottoantrung.com');
    evidence.http.push({ target, status: response.status, canonical: $('link[rel="canonical"]').last().attr('href') });
  }
  seoOverride = true;
  const override = load(await (await fetch(base + '/san-pham?hang-xe=toyota')).text());
  assert.equal(override('link[rel="canonical"]').last().attr('href'), 'https://example.test/admin-canonical');
  seoOverride = false;
  const sitemap = await fetch(base + '/sitemap.xml'); const sitemapXml = await sitemap.text();
  assert.equal(sitemap.status, 200, 'Sitemap index is available without rendering the root layout');
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  const sitemapDoc = load(sitemapXml, { xmlMode: true });
  assert.equal(sitemapDoc('sitemapindex').length, 1);
  const sitemapUrls = sitemapDoc('loc').map((_, el) => sitemapDoc(el).text()).get();
  assert(sitemapUrls.includes('https://xeluottoantrung.com/sitemap.xml?section=cars&page=1'));
  for (const url of sitemapUrls) assert.equal(new URL(url).origin, 'https://xeluottoantrung.com');
  let beforeSitemap = reads.length;
  await (await fetch(base + '/sitemap.xml')).text();
  assert.equal(reads.length, beforeSitemap, 'Warm sitemap index does not read API');
  const carsXml = load(await (await fetch(base + '/sitemap.xml?section=cars&page=1')).text(), { xmlMode: true });
  assert.deepEqual(carsXml('loc').map((_, el) => carsXml(el).text()).get(), ['https://xeluottoantrung.com/crawler-toyota']);
  beforeSitemap = reads.length;
  await (await fetch(base + '/sitemap.xml?section=cars&page=1')).text();
  assert.equal(reads.length, beforeSitemap, 'Warm sitemap child does not read API');
  for (const query of ['section=admin', 'section=__proto__', 'section=cars&page=0', 'section=cars&page=9999', 'section=cars&page=1&page=2', 'url=https://example.test', 'page=2']) {
    assert.equal((await fetch(base + '/sitemap.xml?' + query)).status, 404);
  }
  assert.equal(reads.length, beforeSitemap, 'Invalid sitemap parameters make no API calls');
  evidence.sitemapStatus = sitemap.status;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }); const p = await context.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', route => {
      const url = new URL(route.request().url());
      if (route.request().resourceType() === 'image' || !['localhost', '127.0.0.1'].includes(url.hostname) || route.request().headers()['next-router-prefetch']) return route.abort();
      return route.continue();
    });
    assert.equal((await p.goto(base + '/san-pham', { waitUntil: 'networkidle' })).status(), 200);
    const option = p.locator('a.vehicle-brands__option[data-brand-slug="toyota"]').first();
    assert(await option.count()); await option.click();
    await p.waitForURL(url => url.searchParams.get('hang-xe') === 'toyota');
    await p.waitForFunction(() => document.querySelector('.vehicle-filter-panel')?.getAttribute('aria-busy') === 'false');
    assert(reads.some(r => r.path === '/api/v1/cars' && r.query.brand === 'toyota'));
    assert((await p.locator('body').innerText()).includes(car.name)); assert.deepEqual(errors, []);
    evidence.browser.push({ width, filterNavigation: true, inventoryPreserved: true, pageErrors: errors.length });
    await context.close();
  }
  sitemapSeoFailure = true;
  const unavailable = await fetch(base + '/sitemap.xml?section=brands&page=1');
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  beforeSitemap = reads.length;
  assert.equal((await fetch(base + '/sitemap.xml?section=brands&page=1')).status, 503);
  assert.equal(reads.length, beforeSitemap, 'Failure cooldown prevents duplicate API reads');
  evidence.passed = true; evidence.adminCanonicalPreserved = true; evidence.robotsApiReads = 0;
  evidence.sitemap = { index: true, children: true, warmCacheNoApiReads: true, badParamsNoApiReads: true, seoOutage503NoPartialXml: true };
  const out = resolve('../docs/artifacts/crawler-protection-2026-10-16'); await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'checks.json'), JSON.stringify(evidence, null, 2));
  const sitemapOut = resolve('../docs/artifacts/sitemap-2026-10-16'); await mkdir(sitemapOut, { recursive: true });
  await writeFile(resolve(sitemapOut, 'http-checks.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS production HTTP: same robots for all UAs, zero robots API reads, filtered pages accessible, canonical/Admin override preserved, sitemap index available; desktop/mobile filters work.');
} finally {
  await browser?.close();
  if (child && child.exitCode === null) { const exited = new Promise(done => child.once('exit', done)); child.kill(); await exited; }
  await new Promise(done => api.close(done));
}
