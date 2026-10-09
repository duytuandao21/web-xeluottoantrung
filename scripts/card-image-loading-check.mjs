import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const stage = process.argv[2];
assert(['before', 'after'].includes(stage));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const out = '../toi-uu-hieu-suat-website/card-image-loading';
fs.mkdirSync(out, { recursive: true });
const prior = stage === 'after' ? JSON.parse(fs.readFileSync(`${out}/before.json`, 'utf8')) : null;
const records = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) for (const route of ['/', '/san-pham']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 390 ? 3 : 2, hasTouch: width === 390 });
    const page = await context.newPage(), requests = new Map(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 1250000 });
    cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { url: e.request.url, type: e.type }));
    cdp.on('Network.responseReceived', e => Object.assign(requests.get(e.requestId) || {}, { status: e.response.status }));
    cdp.on('Network.loadingFinished', e => Object.assign(requests.get(e.requestId) || {}, { bytes: e.encodedDataLength }));
    await page.addInitScript(() => {
      window.__cardCLS = 0;
      new PerformanceObserver(list => list.getEntries().forEach(entry => { if (!entry.hadRecentInput) window.__cardCLS += entry.value; })).observe({ type: 'layout-shift', buffered: true });
    });
    const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(12000);
    const initial = [...requests.values()].map(r => ({ ...r }));
    const cards = await page.locator('[data-car-id]').evaluateAll(elements => elements.map(card => {
      const image = card.querySelector('[data-current="true"] img'), r = image.getBoundingClientRect();
      return { slug: card.dataset.carId, original: image.dataset.imageOriginal, src: image.currentSrc, loading: image.loading,
        ready: image.complete && image.naturalWidth > 0, visibility: getComputedStyle(image).visibility, width: r.width, height: r.height };
    }));
    assert(cards.length >= 6);
    const coverRequests = initial.filter(r => r.type === 'Image' && r.url.includes('/cars/'));
    const card = page.locator('[data-car-id]').last(), image = card.locator('[data-current="true"] img');
    await card.evaluate(element => { window.scrollTo({ top: Math.max(1, element.getBoundingClientRect().top + scrollY - innerHeight - 500), behavior: 'instant' }); });
    await page.waitForTimeout(300);
    const ahead = await image.evaluate(img => ({ loading: img.loading, ready: img.complete && img.naturalWidth > 0, top: img.getBoundingClientRect().top, viewportHeight: innerHeight }));
    if (stage === 'after') assert.equal(ahead.loading, 'eager', 'Scroll observer must promote a near-viewport lazy cover');
    await page.waitForFunction(slug => { const img = document.querySelector(`[data-car-id="${slug}"] [data-current="true"] img`); return img?.complete && img.naturalWidth > 0; }, cards.at(-1).slug, { timeout: 60000 });
    await card.scrollIntoViewIfNeeded();
    const atScroll = await image.evaluate(img => ({ ready: img.complete && img.naturalWidth > 0, visibility: getComputedStyle(img).visibility }));
    assert(atScroll.ready && atScroll.visibility === 'visible');
    const record = { width, route, initialCoverRequests: coverRequests, initialImageBytes: initial.filter(r => r.type === 'Image').reduce((n, r) => n + (r.bytes || 0), 0),
      initialJSBytes: initial.filter(r => r.type === 'Script').reduce((n, r) => n + (r.bytes || 0), 0), cards, ahead, atScroll,
      cls: await page.evaluate(() => window.__cardCLS), errors };
    assert.deepEqual(errors, []);
    if (prior) {
      const old = prior.find(r => r.width === width && r.route === route);
      assert.deepEqual(cards.map(({ slug, original, src, width, height }) => ({ slug, original, src, width, height })), old.cards.map(({ slug, original, src, width, height }) => ({ slug, original, src, width, height })));
      assert.deepEqual(coverRequests.map(r => r.url).sort(), old.initialCoverRequests.map(r => r.url).sort(), 'Initial cover requests must not increase');
    }
    await context.close();
    // Keep JavaScript unavailable to verify that SSR covers need no hydration to paint.
    const noJS = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 390 ? 3 : 2 });
    const staticPage = await noJS.newPage();
    await staticPage.route('**/_next/**/*.js', request => request.abort());
    const staticResponse = await staticPage.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.equal(staticResponse.status(), 200);
    await staticPage.waitForFunction(() => { const img = document.querySelector('[data-car-id] [data-current="true"] img'); return img?.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
    record.withoutHydration = await staticPage.locator('[data-car-id] [data-current="true"] img').first().evaluate(img => ({ ready: img.complete && img.naturalWidth > 0, visibility: getComputedStyle(img).visibility, src: img.currentSrc }));
    if (stage === 'after') assert.equal(record.withoutHydration.visibility, 'visible');
    records.push(record);
    fs.writeFileSync(`${out}/${stage}.json`, JSON.stringify(records, null, 2));
    console.log(JSON.stringify({ width, route, coverRequests: coverRequests.length, imageBytes: record.initialImageBytes, jsBytes: record.initialJSBytes, withoutHydration: record.withoutHydration.visibility, atScroll, errors }));
    await noJS.close();
  }
} finally { await browser.close(); }
