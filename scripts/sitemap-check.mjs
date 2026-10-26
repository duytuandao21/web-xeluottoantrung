import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { load } from 'cheerio';

class PublicApiError extends Error {
  constructor(status, message, retryAfterMs) { super(message); this.status = status; this.retryAfterMs = retryAfterMs; }
}
const origin = 'https://toantrungxeluot.io.vn';
Object.assign(globalThis, { PublicApiError, SITE_ORIGIN: origin, publicApi: async () => { throw Error('Use isolated fixture'); } });
const source = (await readFile('lib/sitemap.ts', 'utf8')).replace(/^import .*?;\r?\n/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSitemapService, SitemapNotFound } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const locs = xml => { const $ = load(xml, { xmlMode: true }); return $('loc').map((_, el) => $(el).text()).get(); };
let clock = 1_000_000, fail = false, cars = [{ slug: 'car-good' }, { slug: 'car-noindex' }, { slug: 'car-external' }, { slug: 'car-alias' }, { slug: 'car-query' }, { slug: 'car-good' }, { slug: '../unsafe' }];
const reads = [], seo = {
  '/car-noindex': { robotsIndex: false }, '/car-external': { canonicalUrl: 'https://example.test/car-external' },
  '/car-alias': { canonicalUrl: '/san-pham' }, '/car-query': { canonicalUrl: '/car-query?x=1' },
};
let seoActive = 0, peak = 0;
const read = async (path, query) => {
  reads.push({ path, query });
  if (path === '/seo') {
    seoActive++; peak = Math.max(peak, seoActive); await new Promise(done => setTimeout(done, 1)); seoActive--;
    if (fail) throw new PublicApiError(503, 'Fixture outage', 20_000);
    if (seo[query.route]) return seo[query.route];
    throw new PublicApiError(404, 'No custom SEO');
  }
  if (path === '/brands') return [{ slug: 'toyota' }];
  if (path === '/content') return [{ key: 'chinh-sach-quyen-rieng-tu' }];
  if (path === '/accessories') return { data: [
    { id: '00000000-0000-4000-8000-000000000001', slug: 'camera-70mai' },
    { id: '00000000-0000-4000-8000-000000000002' }, // previous API during rollout
    { id: '00000000-0000-4000-8000-000000000003', slug: '../unsafe' },
  ], meta: { totalPages: 1 } };
  const rows = path === '/cars' ? query.page === 2 ? [{ slug: 'car-page-two' }] : cars : [];
  return { data: rows, meta: { totalPages: path === '/cars' ? 2 : 0 } };
};
const service = createSitemapService(read, () => clock);
const index = await service.get();
assert(load(index, { xmlMode: true })('sitemapindex').length);
assert(index.includes('&amp;page=2'));
assert(locs(index).includes(origin + '/sitemap.xml?section=cars&page=2'));
assert.equal(reads.length, 10, 'Index reads first page of ten public resources only');
const initial = reads.length;
await Promise.all([service.get(), service.get()]); assert.equal(reads.length, initial, 'Warm index makes no API reads');
const results = await Promise.all([service.get('cars'), service.get('cars')]);
assert.equal(results[0], results[1]);
assert.deepEqual(locs(results[0]), [origin + '/car-good']);
assert.equal(reads.filter(r => r.path === '/cars').length, 2, 'Identical cold child requests coalesce');
assert(peak <= 2, 'At most two SEO calls per generation');
assert.deepEqual(locs(await service.get('cars', 2)), [origin + '/car-page-two']);
const pages = locs(await service.get('pages'));
assert(pages.includes(origin + '/') && pages.includes(origin + '/san-pham'));
assert(pages.every(url => !new URL(url).search && !url.includes('tim-kiem')));
assert.deepEqual(locs(await service.get('policies')), [origin + '/chinh-sach-quyen-rieng-tu']);
assert.deepEqual(locs(await service.get('accessories')), [origin + '/phu-kien-o-to/00000000-0000-4000-8000-000000000002', origin + '/phu-kien-o-to/camera-70mai'], 'Slug URLs replace UUIDs; only unmigrated responses use legacy IDs');
for (const [name, page] of [['__proto__', 1], ['admin', 1], ['pages', 2], ['cars', 0], ['cars', 5001], ['cars', 3]])
  await assert.rejects(service.get(name, page), SitemapNotFound);
cars = [{ slug: 'car-updated' }]; clock += 300_001;
assert.deepEqual(locs(await service.get('cars')), [origin + '/car-updated'], 'Expired XML regenerates from current public inventory');

const failing = createSitemapService(read, () => clock);
fail = true;
await assert.rejects(failing.get('cars'), error => error.status === 503);
const failedReads = reads.length;
await assert.rejects(failing.get('cars'), error => error.status === 503);
assert.equal(reads.length, failedReads, 'Outage cooldown prevents hammering; no partial success');
fail = false; clock += 20_001;
assert.deepEqual(locs(await failing.get('cars')), [origin + '/car-updated'], 'Failed XML is not cached as success');

const tooLarge = createSitemapService(async () => ({ data: [], meta: { totalPages: 5001 } }), () => clock);
await assert.rejects(tooLarge.get(), /capacity/);
let release, activeGenerations = 0, generationPeak = 0;
const gate = new Promise(done => { release = done; });
const queuedService = createSitemapService(async () => {
  activeGenerations++; generationPeak = Math.max(generationPeak, activeGenerations);
  await gate; activeGenerations--; return { data: [], meta: { totalPages: 20 } };
}, () => clock);
const queued = Array.from({ length: 16 }, (_, i) => queuedService.get('cars', i + 1));
await assert.rejects(queuedService.get('cars', 17), error => error.status === 503);
release(); await Promise.all(queued);
assert.equal(generationPeak, 1, 'Cold sitemap files generate serially; queue overflow fails without API work');
const out = process.env.SITEMAP_TEST_ARTIFACT_DIR || '../docs/artifacts/sitemap-2026-10-16'; await mkdir(out, { recursive: true });
await writeFile(`${out}/unit-checks.json`, JSON.stringify({ passed: true, indexFirstPageReads: 10, maxSeoConcurrency: peak,
  checks: ['XML namespaces/escaping', 'public pagination', 'index warm cache', 'single-flight', 'noindex/canonical/unsafe URL exclusions', 'static/policy URLs', 'invalid sections/pages', 'XML expiry and new inventory', '503 cooldown and recovery', 'capacity fails explicitly', 'serial generation and bounded queue overflow'] }, null, 2));
for (const key of ['PublicApiError', 'SITE_ORIGIN', 'publicApi']) delete globalThis[key];
console.log('PASS sitemap: pagination, canonical/noindex, fixed source allowlist, bounded concurrency/cache, expiry, outage cooldown/recovery and XML.');
