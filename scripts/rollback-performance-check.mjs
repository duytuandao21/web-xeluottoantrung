import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const absent = async file => { try { await access(file); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; return true; } };
assert(await absent('middleware.ts'), 'Composition middleware must not execute even with an old flag/header');
assert(await absent('lib/public-content.ts'));
for (const file of ['app/layout.tsx', 'app/page.tsx', 'lib/public-pages.ts', 'lib/website-content.ts', 'lib/public-api.ts']) {
  const text = await readFile(file, 'utf8');
  assert(!/publicContent|retryComposedContent|x-tt-home-content|\/content\/home/.test(text), file);
}
const api = await readFile('lib/public-api.ts', 'utf8');
assert(/const maxConcurrentReads = 8;/.test(api));
assert(!api.includes('PUBLIC_READ_CONCURRENCY'), 'Old environment value 10 cannot override the constant');
assert(api.includes("cache: 'no-store'"));
assert(api.includes('response.body?.cancel()'), 'Keep the pre-existing response-body cleanup fix');
const page = await readFile('lib/public-pages.ts', 'utf8');
assert(page.includes('function renderServiceSteps('));
assert(page.includes("renderServiceSteps($, buyingPanel, 'buoc-mua-xe', buyingSteps)"));
assert(!page.includes('Drop the unused snapshot panel here'));
assert((await readFile('app/page.tsx', 'utf8')).includes("export const dynamic = 'force-dynamic'"));
const carousel = await readFile('components/common/Carousel.tsx', 'utf8');
assert(carousel.includes("isHero?' hero-ssr':' carousel-hydrating'"), 'Unrelated hero LCP fix remains in local source');
assert((await readFile('app/globals.css', 'utf8')).includes('.slider_slick.hero-ssr .slick-track { left:0 !important; }'));
const middleware = JSON.parse(await readFile('.next/server/middleware-manifest.json', 'utf8'));
assert.deepEqual(middleware.middleware, {});
assert.deepEqual(middleware.sortedMiddleware, []);
assert(await absent('.next/server/middleware.js'), 'No stale Node middleware may execute from the build');
console.log('PASS: DOM patch OFF, composition removed including middleware, fixed eight reads, no-store/dynamic/retry fixes and hero fix preserved.');
