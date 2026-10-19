// Local production-build experiment. Public GET fixtures only; never posts or authenticates.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setDefaultResultOrder } from 'node:dns';
import { load } from 'cheerio';
import { chromium } from 'playwright';
import sharp from 'sharp';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
setDefaultResultOrder('ipv4first');
const stage = process.argv[2];
assert(['prepare', 'before', 'after', 'compare'].includes(stage));
const out = resolve('artifacts/image-loading-phase3');
await mkdir(resolve(out, 'fixtures'), { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const save = (file, data) => writeFile(resolve(out, file), JSON.stringify(data, null, 2));
const delay = ms => new Promise(done => setTimeout(done, ms));
const manifest = JSON.parse(await readFile(resolve(out, 'fixture-index.json'), 'utf8').catch(() => '{}'));
const upstream = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL).replace(/\/$/, '');
const writable = stage === 'prepare';
const pending = new Map();
async function fixture(key, fetcher, allowMissing = writable) {
  if (!manifest[key]) {
    assert(allowMissing, `Missing frozen public fixture: ${key}`);
    if (!pending.has(key)) pending.set(key, (async () => {
      const response = await fetcher();
      const body = Buffer.from(await response.arrayBuffer());
      assert(body.length < 30_000_000, 'Bounded public asset fixture');
      const file = `${hash(key)}.bin`;
      manifest[key] = { file, status: response.status, type: response.headers.get('content-type') || 'application/octet-stream', bytes: body.length, sha256: hash(body) };
      await writeFile(resolve(out, 'fixtures', file), body);
      await save('fixture-index.json', manifest);
    })());
    await pending.get(key);
  }
  const meta = manifest[key];
  const body = await readFile(resolve(out, 'fixtures', meta.file));
  assert.equal(hash(body), meta.sha256);
  return { ...meta, body };
}
const allowedApi = /^\/api\/v1\/(?:site-settings|lookups|services|content|cars|slides|brands|testimonials|articles|accessories|seo|promotions)(?:\/|\?|$)/;
let apiReads = 0;
const fixtureServer = createServer(async (req, res) => {
  try {
    assert.equal(req.method, 'GET');
    let data;
    if (req.url.startsWith('/asset/')) {
      const key = Object.keys(manifest).find(key => key.startsWith('https:') && hash(key) === req.url.slice(7));
      assert(key, 'Known image replay');
      data = await fixture(key);
    } else {
      assert(allowedApi.test(req.url), 'Public read-only API allowlist');
      apiReads++;
      const key = `api:${req.url}`;
      data = await fixture(key, () => fetch(upstream + req.url, { signal: AbortSignal.timeout(20000) }));
    }
    res.writeHead(data.status, { 'Content-Type': data.type, 'Content-Length': data.body.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(data.body);
  } catch (e) { res.writeHead(502); res.end('Fixture unavailable'); console.error(e.message); }
});
await new Promise(done => fixtureServer.listen(0, '127.0.0.1', done));
const fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;
const imageReplay = createHttpsServer({
  key: await readFile(resolve(out, 'replay-key.pem')),
  cert: await readFile(resolve(out, 'replay-cert.pem')),
}, fixtureServer.listeners('request')[0]);
await new Promise(done => imageReplay.listen(0, '127.0.0.1', done));
const imageOrigin = `https://127.0.0.1:${imageReplay.address().port}`;
let next, browser;
const selectedCases = process.env.IMAGE_CASES?.split(',');
const timingRuns = process.env.IMAGE_TIMING_RUNS?.split(',').map(Number) || [1, 2, 3];
assert(timingRuns.every(run => Number.isInteger(run) && run >= 1 && run <= 12));
const priorRun = selectedCases && ['before', 'after'].includes(stage)
  ? JSON.parse(await readFile(resolve(out, `${stage}.json`), 'utf8').catch(() => 'null')) : null;
const result = { stage, time: new Date().toISOString(),
  cases: priorRun?.cases.filter(row => !selectedCases.includes(row.name)) || [],
  failures: priorRun?.failures.filter(row => !selectedCases.includes(row.case)) || [] };
try {
  if (stage === 'compare') {
    const a = JSON.parse(await readFile(resolve(out, 'before.json'), 'utf8'));
    const b = JSON.parse(await readFile(resolve(out, 'after.json'), 'utf8'));
    assert.deepEqual(a.golden, b.golden, 'SSR business DOM/metadata/image delivery (only loading hints excluded)');
    const imageAttributes = run => run.inventory.images.map(({ loading, ...attrs }) => attrs);
    assert.deepEqual(imageAttributes(a), imageAttributes(b), 'All home image attributes except intentional loading changes, including decoding/fetchpriority');
    assert.deepEqual(a.hero, b.hero, 'Hero HTML/delivery and all five preload hints unchanged');
    assert.deepEqual(a.apiKeys, b.apiKeys, 'Same public data fixture requests');
    const visuals = [];
    for (const old of a.cases.filter(c => c.screenshots)) {
      const row = b.cases.find(c => c.name === old.name);
      assert(row, old.name);
      assert.deepEqual(row.geometry, old.geometry, `Exact geometry ${old.name}`);
      for (const key of Object.keys(old.screenshots)) {
        const decode = async file => sharp(resolve(out, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const x = await decode(old.screenshots[key]), y = await decode(row.screenshots[key]);
        assert.deepEqual(x.info, y.info, `Screenshot dimensions ${old.name}/${key}`);
        let pixels = 0;
        for (let i = 0; i < x.data.length; i += 4) if (x.data.subarray(i, i + 4).compare(y.data.subarray(i, i + 4))) pixels++;
        visuals.push({ case: old.name, region: key, changedPixels: pixels, ratio: pixels / (x.info.width * x.info.height) });
      }
    }
    await save('comparison.json', { ssrGolden: true, heroUnchanged: true, apiUnchanged: true, visuals, beforePreloads: a.inventory.preloads.length, afterPreloads: b.inventory.preloads.length });
    assert(visuals.every(v => v.ratio <= 0.0025), 'Visual pixel gate: maximum 0.25% for raster/animation-edge variation, exact geometry/DOM required');
    console.log(JSON.stringify({ ssrGolden: true, heroUnchanged: true, visuals }));
    process.exitCode = a.failures.length || b.failures.length ? 1 : 0;
  } else {
    const reservation = createServer();
    await new Promise(done => reservation.listen(0, '127.0.0.1', done));
    const port = reservation.address().port;
    await new Promise(done => reservation.close(done));
    const base = `http://127.0.0.1:${port}`;
    next = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, API_URL: fixtureOrigin, PERF_DIAGNOSTICS: 'false', HOME_CMS_COMPOSITION: 'false' },
    });
    await save('owned-process.json', { runnerPid: process.pid, nextPid: next.pid, port });
    next.stderr.on('data', data => { if (String(data).includes('Error')) console.error('Next error (details withheld; inspect case status)'); });
    for (let i = 0; ; i++) {
      try { if ((await fetch(base + '/robots.txt')).ok) break; } catch {}
      assert(i < 120 && next.exitCode === null, 'Next production startup');
      await delay(250);
    }
    result.buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
    const html = await (await fetch(base)).text(), $ = load(html);
    assert.equal($('.slider_slick').length, 1);
    const preloads = $('link[rel="preload"][as="image"]').toArray().map(el => el.attribs);
    const ancestor = el => $(el).parents().map((_, p) => p.attribs?.class || p.tagName).get().slice(0, 7).join(' / ');
    result.inventory = { preloads, images: $('img').toArray().map(el => ({ ...el.attribs, ancestors: ancestor(el) })) };
    result.hero = { images: $('.slider_slick img').toArray().map(el => el.attribs), preload: preloads.filter(p => $('.slider_slick img').toArray().some(el => p.imagesrcset ? p.imagesrcset === el.attribs.srcset : p.href === el.attribs.src)) };
    if (writable) {
      for (const image of [result.hero.images[0], result.inventory.images.find(i => i.ancestors.includes('car-card-gallery')), result.inventory.images.find(i => i.alt === 'Auto Toàn Trung')].filter(Boolean)) {
        const tail = image.src.split('/cdn-cgi/image/')[1]?.replace(/^[^/]+\//, '');
        const original = tail ? new URL(tail, new URL(image.src).origin).href : image.src;
        await fixture(original, () => fetch(original, { signal: AbortSignal.timeout(30000) }));
      }
      const missingRun = JSON.parse(await readFile(resolve(out, 'before-attempt2.json'), 'utf8').catch(() => 'null'));
      const missing = new Set(missingRun?.cases.flatMap(c => c.errors || []).filter(e => e.includes('Missing frozen public fixture: ')).map(e => e.split('Missing frozen public fixture: ')[1]) || []);
      for (const url of missing) await fixture(url, () => fetch(url, { headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(30000) }));
    }
    assert.equal(result.hero.images[0].loading, 'eager');
    assert.equal(result.hero.images[0].fetchpriority, 'high');
    assert.equal(result.hero.preload.length, result.hero.images.length);
    result.golden = {};
    for (const route of ['/', '/san-pham', '/ban-xe']) {
      const response = await fetch(base + route), text = await response.text(), dom = load(text);
      assert.equal(response.status, 200, route);
      const imageAttrs = dom('img').toArray().map(el => {
        const { loading, fetchpriority, decoding, ...attrs } = el.attribs;
        return attrs;
      });
      // Remove Next transport only. Application JSON-LD, CSS links, styles,
      // image source/srcset/sizes, metadata and every business node remain.
      dom('script').each((_, el) => { if (dom(el).attr('type') !== 'application/ld+json') dom(el).remove(); });
      dom('link[as="script"]').remove();
      dom('link[rel="preload"][as="image"]').remove();
      dom('img').removeAttr('loading fetchpriority decoding');
      dom('template[id^="B:"]').remove();
      dom('[hidden][id^="S:"]').each((_, el) => { if (!dom(el).children().length && !dom(el).text()) dom(el).remove(); });
      const normalized = dom.html().replace(/<!--(?:\$\??|\/\$|\$!| )-->/g, '');
      result.golden[route] = { hash: hash(normalized), images: imageAttrs, title: dom('title').text(), canonical: dom('link[rel="canonical"]').attr('href') };
    }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const configs = stage === 'prepare' ? [...[360, 390, 430, 768, 1024, 1440].map(width => ({ name: `prepare-${width}`, width })), { name: 'prepare-no-js', width: 390, noJS: true }] : [
      ...timingRuns.flatMap(run => [390, 1440].map(width => ({ name: `timing-${width}-${run}`, width, slow: true, timing: true }))),
      ...[360, 390, 430, 768, 1024, 1440].map(width => ({ name: `visual-${width}`, width, visual: true })),
      { name: 'no-js-mobile', width: 390, noJS: true },
      { name: 'delayed-js-mobile', width: 390, delayedJS: true },
      { name: 'swipe-mobile', width: 390 },
      { name: 'fallback-mobile', width: 390, failure: true },
      { name: 'fallback-card', width: 390, failure: 'card' },
      { name: 'fallback-footer', width: 390, failure: 'footer' },
      { name: 'failed-card', width: 390, failure: 'card-final' },
    ];
    for (const config of configs) {
      if (process.env.IMAGE_CASES && !process.env.IMAGE_CASES.split(',').includes(config.name)) continue;
      const row = { name: config.name, width: config.width, errors: [], hydrationErrors: [], requests: [] };
      const context = await browser.newContext({ viewport: { width: config.width, height: config.width < 500 ? 844 : 1000 }, deviceScaleFactor: config.width < 500 ? 3 : 1, isMobile: config.width < 500, hasTouch: config.width < 500, javaScriptEnabled: !config.noJS, serviceWorkers: 'block', ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const dismissPromotion = async () => {
        const close = page.locator('dialog.tt-promo-ad[open] [data-promo-close]');
        if (await close.isVisible()) { await close.click(); row.dismissedPromotion = true; }
      };
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (config.slow) {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: config.width < 500 ? 200000 : 1250000, uploadThroughput: 100000 });
        if (config.width < 500) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const requests = new Map();
      cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { type: e.type, url: e.request.url, priority: e.request.initialPriority, start: e.timestamp, initiator: e.initiator.type }));
      cdp.on('Network.responseReceived', e => Object.assign(requests.get(e.requestId) || {}, { status: e.response.status }));
      cdp.on('Network.loadingFinished', e => Object.assign(requests.get(e.requestId) || {}, { bytes: e.encodedDataLength, end: e.timestamp }));
      page.on('pageerror', error => row.errors.push(error.message.slice(0, 300)));
      page.on('console', m => { if (/hydration|Minified React error #(418|419|421|422|423|425)/i.test(m.text())) row.hydrationErrors.push(m.text().slice(0, 300)); });
      let releaseJS;
      const jsGate = new Promise(done => { releaseJS = done; });
      const failureImage = config.failure === 'footer' ? result.inventory.images.find(i => i.alt === 'Auto Toàn Trung')
        : typeof config.failure === 'string' && config.failure.startsWith('card') ? result.inventory.images.find(i => i.ancestors.includes('car-card-gallery')) : result.hero.images[0];
      const failureTail = failureImage.src.split('/cdn-cgi/image/')[1]?.replace(/^[^/]+\//, '');
      const firstPath = new URL(failureTail || failureImage.src, base).pathname;
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== 'GET' || request.headers()['next-router-prefetch']) return route.abort();
        if (url.origin === base) {
          if (url.pathname.startsWith('/api/v1/')) {
            if (!allowedApi.test(url.pathname + url.search)) return route.abort();
            return route.continue({ url: fixtureOrigin + url.pathname + url.search });
          }
          if (config.delayedJS && request.resourceType() === 'script') await jsGate;
          return route.continue();
        }
        if (url.origin === fixtureOrigin || url.origin === imageOrigin) return route.continue();
        if (request.resourceType() === 'image' && url.protocol === 'https:' && /(?:toantrung|r2\.dev)/.test(url.hostname)) {
          if (config.failure && url.href.includes(firstPath) && (url.pathname.includes('/cdn-cgi/image/') || config.failure === 'card-final')) return route.fulfill({ status: 404, body: '' });
          try {
            const key = url.href;
            // Functional baseline may complete its image corpus; timed runs
            // and every after case must replay frozen bytes without origin I/O.
            await fixture(key, () => fetch(key, { headers: { Accept: request.headers().accept || 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(30000) }), writable || (stage === 'before' && !config.timing));
            return route.continue({ url: imageOrigin + '/asset/' + hash(key) });
          } catch (error) { row.errors.push(`Image ${hash(url.href).slice(0, 12)}: ${error.cause?.code || error.message}`); return route.abort(); }
        }
        return route.abort();
      });
      const probe = () => {
        const data = window.__imagePhase3 = { lcp: [], shifts: [], hero: [] };
        try { new PerformanceObserver(list => list.getEntries().forEach(e => data.lcp.push({ time: e.startTime, tag: e.element?.tagName, hero: !!e.element?.closest('.slider_slick') }))).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
        try { new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) data.shifts.push({ time: e.startTime, value: e.value }); })).observe({ type: 'layout-shift', buffered: true }); } catch {}
        let last = '';
        const sample = () => {
          const hero = document.querySelector('.slider_slick'), image = hero?.querySelector('img');
          if (hero && image) {
            const state = { loaded: image.complete && image.naturalWidth > 0, visible: getComputedStyle(hero).visibility === 'visible', active: hero.querySelector('.slick-current')?.getAttribute('data-index') };
            const key = JSON.stringify(state);
            if (key !== last) { data.hero.push({ time: performance.now(), ...state }); last = key; }
          }
          if (performance.now() < 30000) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      };
      if (!config.noJS) await page.addInitScript(probe);
      try {
        const response = await page.goto(base, { waitUntil: 'commit', timeout: 60000 });
        assert.equal(response.status(), 200);
        if (config.noJS) { await page.waitForSelector('.slider_slick'); await page.evaluate(probe); }
        if (config.delayedJS) {
          await page.waitForTimeout(3500);
          row.beforeJS = await page.locator('.slider_slick').evaluate(el => ({ visible: getComputedStyle(el).visibility === 'visible', firstReady: el.querySelector('img').complete && el.querySelector('img').naturalWidth > 0 }));
          releaseJS();
          assert(row.beforeJS.visible && row.beforeJS.firstReady);
        }
        await page.waitForFunction(() => { const img = document.querySelector('.slider_slick img'); return img?.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
        if (config.timing) {
          await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 60000 });
          // Fixed 12-second observation window, never wait for lazy images to define initial load.
          const now = await page.evaluate(() => performance.now());
          await page.waitForTimeout(Math.max(0, 12000 - now));
          row.metrics = await page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, lcp: window.__imagePhase3.lcp.at(-1), ttfb: performance.getEntriesByType('navigation')[0].responseStart, cls: window.__imagePhase3.shifts.reduce((n, s) => n + s.value, 0), hero: window.__imagePhase3.hero,
            stylesAndFonts: performance.getEntriesByType('resource').filter(r => /\.(css|woff2?|otf|ttf)(?:\?|$)/.test(r.name)).map(r => ({ path: new URL(r.name).pathname, start: r.startTime, end: r.responseEnd, bytes: r.encodedBodySize })),
          }));
          row.requests = [...requests.values()].filter(r => r.type === 'Image');
          row.imageBytes = row.requests.reduce((n, r) => n + (r.bytes || 0), 0);
          row.completedImages = row.requests.filter(r => r.end).length;
        } else {
          if (!config.noJS) await page.waitForFunction(() => !document.querySelector('.slider_slick').classList.contains('hero-ssr'));
          await page.evaluate(() => document.fonts.ready);
          if (config.visual || writable) {
            // Traverse every section. Native lazy must resolve when approaching it.
            for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += 650) {
              await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y);
              await page.waitForTimeout(writable ? 100 : 50);
            }
            await page.waitForTimeout(writable ? 3000 : 800);
            if (writable) {
              await page.locator('img').evaluateAll(images => Promise.race([
                Promise.all(images.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); })),
                new Promise(done => setTimeout(done, 30000)),
              ]));
            }
          }
          if (config.visual) {
            row.geometry = []; row.screenshots = {}; row.nativeVisibleChecks = [];
            await mkdir(resolve(out, stage), { recursive: true });
            for (const [key, selector] of Object.entries({ hero: '.slider', buy: '.wap_muaxe', cars: '.tt-home-cars', accessories: '.tt-accessories', services: '.tt-home-services', bottom: '.tt-home-bottom', footer: '#tt-footer' })) {
              if (process.env.IMAGE_REGIONS && !process.env.IMAGE_REGIONS.split(',').includes(key)) continue;
              const element = page.locator(selector).first();
              if (!await element.count()) continue;
              await dismissPromotion();
              await element.scrollIntoViewIfNeeded();
              await page.waitForTimeout(850);
              // A tall element screenshot can include descendants that never
              // entered the viewport. Reveal them by normal scrolling first.
              for (const target of await element.locator('[data-reveal-state="pending"]').elementHandles()) {
                const bounds = await target.boundingBox();
                if (!bounds?.width || !bounds.height) continue;
                await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
                await page.waitForTimeout(150);
                await page.waitForFunction(el => el.dataset.revealState === 'visible' || !el.isConnected || !el.getBoundingClientRect().width || !el.getBoundingClientRect().height, target, { timeout: 3000 });
              }
              await element.scrollIntoViewIfNeeded();
              if (key === 'services') {
                const tabs = page.locator('.tt-home-services .cap1 [role="tab"]');
                await tabs.nth(1).evaluate(el => el.click());
                await tabs.first().evaluate(el => el.click());
                await page.locator('.tt-home-services .dichvu:not([hidden]) .xemtatca a').evaluate(el => el.focus({ preventScroll: true }));
                await page.locator('.tt-home-services .dichvu:not([hidden]) .tt-home-service-steps').evaluate(el => el.scrollTo({ left: 0, behavior: 'instant' }));
                await page.waitForTimeout(700);
              }
              if (key === 'accessories') {
                const viewport = page.locator('.tt-accessories__viewport');
                if (config.width < 768) {
                  await viewport.evaluate(el => { el.focus({ preventScroll: true }); el.scrollTo({ left: 0, behavior: 'instant' }); });
                } else {
                  await page.locator('.tt-accessories__heading').hover();
                  const prev = page.locator('.tt-accessories__arrow--prev');
                  if (await prev.count()) {
                    await prev.evaluate(el => el.focus({ preventScroll: true }));
                    for (let n = 0; n < 12; n++) {
                      const x = await page.locator('.tt-accessories__track').evaluate(el => new DOMMatrix(el.style.transform || 'none').m41);
                      if (x === 0) break;
                      await prev.click(); await page.waitForTimeout(50);
                    }
                  }
                }
                await page.waitForTimeout(750);
              }
              row.nativeVisibleChecks.push(await element.locator('img').evaluateAll((images, key) => ({ key,
                notReady: images.filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0 && i.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && (!i.complete || !i.naturalWidth); }).map(i => i.dataset.imageOriginal),
              }), key));
              // Golden capture is the fully loaded state, after native scroll checks.
              // Hidden Slick clones need not naturally load; bound every wait.
              await element.locator('img').evaluateAll(images => Promise.race([
                Promise.all(images.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); })),
                new Promise(done => setTimeout(done, 5000)),
              ]));
              if (key === 'hero') {
                await page.locator('.slider_slick .hero-dots button').first().evaluate(el => el.click()); await page.waitForTimeout(750);
              }
              await dismissPromotion();
              // Capture matching service/accessory states through their existing UI.
              // Playwright finishes CSS animations only for this screenshot.
              row.geometry.push(await element.evaluate((el, key) => { const r = el.getBoundingClientRect(); return { key, width: r.width, height: r.height }; }, key));
              const file = `${stage}/${config.width}-${key}.png`;
              await element.screenshot({ path: resolve(out, file), animations: 'disabled', scale: 'css', timeout: 30000 });
              row.screenshots[key] = file;
            }
            row.images = await page.locator('img').evaluateAll(images => images.filter(i => i.getBoundingClientRect().width > 0).map(i => ({ original: i.dataset.imageOriginal, src: i.currentSrc, loaded: i.complete && i.naturalWidth > 0 })));
            row.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          }
          if (!config.noJS && !writable) {
            await dismissPromotion();
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            const active = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
            await page.waitForFunction(i => document.querySelector('.slider_slick .slick-current').getAttribute('data-index') !== i, active, { timeout: 5500 });
            row.autoplay = true;
            await page.waitForTimeout(700);
            if (config.width < 500 && !config.visual) {
              await dismissPromotion();
              await page.waitForTimeout(250);
              const box = await page.locator('.slider_slick').boundingBox();
              row.touchProbe = await page.evaluate(({ x, y }) => ({ target: document.elementFromPoint(x, y)?.className, tag: document.elementFromPoint(x, y)?.tagName, scrollY, dialogs: document.querySelectorAll('dialog[open]').length, width: innerWidth }), { x: config.width * .85, y: box.y + box.height / 2 });
              const burstStart = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
              row.swipeSamples = [];
              for (let n = 0; n < 3; n++) {
                const previous = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: config.width * .85, y: box.y + box.height / 2 }] });
                await page.waitForTimeout(50);
                for (let step = 1; step <= 6; step++) {
                  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: config.width * (.85 - .65 * step / 6), y: box.y + box.height / 2 }] });
                  await page.waitForTimeout(25);
                }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await page.waitForTimeout(180);
                row.swipeSamples.push({ before: previous, ...await page.locator('.slider_slick .slick-current').evaluate(el => ({ after: el.getAttribute('data-index'), ready: el.querySelector('img').complete && el.querySelector('img').naturalWidth > 0 })) });
              }
              // Slick ignores gestures during its existing fade animation.
              // Test a burst for progress and ready images, not one step per gesture.
              assert(row.swipeSamples.some(s => s.after !== burstStart), 'Touch burst advances the hero');
              assert(row.swipeSamples.every(s => s.ready), 'No missing image in accepted swipe states');
              row.rapidSwipe = true;
            }
          }
          if (config.failure) {
            await dismissPromotion();
            const selector = config.failure === 'footer' ? '#tt-footer .tt-footer-brand > a img'
              : typeof config.failure === 'string' && config.failure.startsWith('card') ? '[data-car-id] [data-current="true"] img' : '.slider_slick img';
            const target = page.locator(selector).first();
            await target.scrollIntoViewIfNeeded();
            if (config.failure === 'card-final') {
              await page.locator('[data-car-id]').first().locator('[data-current="true"] [role="status"]').waitFor({ state: 'visible', timeout: 15000 });
              row.finalImageError = true;
            } else {
              await target.evaluate(i => i.loading = 'eager');
              await page.waitForFunction(selector => { const i = document.querySelector(selector); return i?.complete && i.naturalWidth > 0 && !i.srcset; }, selector, { timeout: 15000 });
              row.fallback = await target.evaluate(i => ({ src: i.currentSrc, ready: i.complete && i.naturalWidth > 0, noSrcset: !i.srcset }));
              assert(row.fallback.ready && row.fallback.noSrcset);
            }
          }
          row.hero = await page.evaluate(() => window.__imagePhase3?.hero);
        }
        assert.deepEqual(row.errors, [], 'Page/fixture errors');
        assert.deepEqual(row.hydrationErrors, [], 'Hydration errors');
        if (config.noJS) {
          row.staticHero = await page.locator('.slider_slick').evaluate(el => ({ visible: getComputedStyle(el).visibility === 'visible', loaded: el.querySelector('img').complete && el.querySelector('img').naturalWidth > 0, height: el.getBoundingClientRect().height }));
          assert(row.staticHero.visible && row.staticHero.loaded);
        }
        console.log(JSON.stringify({ case: config.name, fcp: row.metrics?.fcp, lcp: row.metrics?.lcp?.time, images: row.requests.length, bytes: row.imageBytes, screenshots: Object.keys(row.screenshots || {}).length, autoplay: row.autoplay, swipe: row.rapidSwipe }));
      } catch (error) {
        row.failure = error.message.slice(0, 1000);
        result.failures.push({ case: config.name, message: error.message.slice(0, 1000) });
        console.error(JSON.stringify(result.failures.at(-1)));
      } finally {
        releaseJS();
        if (process.env.IMAGE_REGIONS && priorRun) {
          const old = priorRun.cases.find(c => c.name === row.name);
          if (old?.screenshots && row.screenshots) {
            row.screenshots = { ...old.screenshots, ...row.screenshots };
            row.geometry = old.geometry.map(g => row.geometry.find(next => next.key === g.key) || g);
          }
        }
        result.cases.push(row);
        result.apiKeys = Object.keys(manifest).filter(k => k.startsWith('api:')).sort();
        result.apiReads = apiReads;
        await save(`${stage}.json`, result);
        await context.close();
      }
    }
    console.log(JSON.stringify({ stage, preloadCount: preloads.length, failures: result.failures.length, publicFixtures: Object.keys(manifest).length }));
    if (result.failures.length) process.exitCode = 1;
  }
} finally {
  await browser?.close();
  next?.kill();
  await new Promise(done => imageReplay.close(done));
  await new Promise(done => fixtureServer.close(done));
}
