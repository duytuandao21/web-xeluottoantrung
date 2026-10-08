import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { load } from 'cheerio';

// Production-only measurement; never imported by the application.
assert(process.argv.includes('--baseline') || process.argv.includes('--compare'), 'Choose --baseline or --compare.');
const stage = process.argv.includes('--compare') ? 'after' : 'before';
const output = path.resolve('../toi-uu-hieu-suat-website/phase-2d');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const visualOnly = process.argv.includes('--visual-only');
const slowOnly = process.argv.includes('--slow-only');
assert(!(visualOnly && slowOnly), 'Choose one of --visual-only or --slow-only.');
fs.mkdirSync(`${output}/screenshots/${stage}`, { recursive: true });
const save = (file, data) => fs.writeFileSync(`${output}/${file}`, JSON.stringify(data, null, 2));
const baseline = stage === 'after' ? JSON.parse(fs.readFileSync(`${output}/browser-before.json`, 'utf8')) : null;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const records = [];
const setup = async (width, slow = false) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width <= 430 ? 3 : 2 });
  const page = await context.newPage(), errors = [], network = new Map();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__heroLcp = []; window.__heroFrames = []; window.__heroShifts = [];
    new PerformanceObserver(list => list.getEntries().forEach(e => window.__heroLcp.push({ time: e.startTime, load: e.loadTime, render: e.renderTime, url: e.url, size: e.size, html: e.element?.outerHTML }))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) window.__heroShifts.push({ time: e.startTime, value: e.value, sources: e.sources?.map(s => ({ html: s.node?.outerHTML?.slice(0, 200), previous: s.previousRect.toJSON(), current: s.currentRect.toJSON() })) }); })).observe({ type: 'layout-shift', buffered: true });
    setInterval(() => {
      const slide = document.querySelector('.slider_slick .slick-current'), image = slide?.querySelector('img');
      if (image) window.__heroFrames.push({ time: performance.now(), index: Number(slide.dataset.index), ready: image.complete && image.naturalWidth > 0, src: image.currentSrc, opacity: getComputedStyle(slide).opacity });
    }, 100);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (slow) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 1250000 });
  cdp.on('Network.requestWillBeSent', e => network.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp, priority: e.request.initialPriority, initiator: e.initiator.type }));
  cdp.on('Network.resourceChangedPriority', e => { const row = network.get(e.requestId); if (row) row.finalPriority = e.newPriority; });
  cdp.on('Network.responseReceived', e => { const row = network.get(e.requestId); if (row) Object.assign(row, { status: e.response.status, response: e.timestamp, mime: e.response.mimeType, timing: e.response.timing }); });
  cdp.on('Network.loadingFinished', e => { const row = network.get(e.requestId); if (row) Object.assign(row, { end: e.timestamp, bytes: e.encodedDataLength }); });
  cdp.on('Network.loadingFailed', e => { const row = network.get(e.requestId); if (row) row.error = e.errorText; });
  return { context, page, errors, network };
};
const sliderCall = (page, method, ...args) => page.locator('.slider_slick').evaluate((element, { method, args }) => {
  let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber'))];
  while (fiber) { if (fiber.stateNode?.[method] && fiber.stateNode?.slideHandler) return fiber.stateNode[method](...args); fiber = fiber.return; }
  throw Error(`Cannot find Slick method ${method}`);
}, { method, args });
const dom = page => page.locator('.slider_slick').evaluate(element => {
  const rect = element.getBoundingClientRect();
  let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber'))], settings;
  while (fiber) { if (fiber.stateNode?.slideHandler) { const p = fiber.stateNode.props; settings = Object.fromEntries(['autoplay','autoplaySpeed','speed','fade','infinite','arrows','dots','pauseOnHover','slidesToShow','slidesToScroll','draggable','swipe','touchMove','lazyLoad'].map(k => [k,p[k]])); break; } fiber = fiber.return; }
  return { rect: { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height }, settings,
    images: [...element.querySelectorAll('img')].map(image => { const r = image.getBoundingClientRect(), s = getComputedStyle(image); return { src: image.getAttribute('src'), alt: image.alt, href: image.closest('a')?.getAttribute('href'), index: Number(image.closest('.slick-slide')?.dataset.index), clone: !!image.closest('.slick-cloned'), width: r.width, height: r.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, fit: s.objectFit, position: s.objectPosition, loading: image.getAttribute('loading'), priority: image.getAttribute('fetchpriority') }; }),
    preloads: [...document.querySelectorAll('link[rel=preload][as=image]')].map(el => ({ href: el.href, priority: el.getAttribute('fetchpriority') })) };
});
try {
  for (const width of slowOnly ? [] : [1920,1440,768,430,390,375]) {
    const { context, page, errors, network } = await setup(width);
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
    assert.equal(response.status(), 200);
    const $ = load(await response.text());
    const ssr = { images: $('.slider_slick img').map((_,img)=>({ src:$(img).attr('src'), priority:$(img).attr('fetchpriority'), loading:$(img).attr('loading') })).get() };
    if (baseline) {
      assert.equal(ssr.images[0].priority, 'high');
      assert.equal(ssr.images[0].loading, 'eager');
      assert(ssr.images.slice(1).every(image => image.priority === undefined && image.loading === undefined));
    }
    await page.locator('.slider_slick:not(.carousel-hydrating)').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('.slider_slick').evaluate(async element => { await Promise.all([...element.querySelectorAll('img')].map(image => image.decode())); await document.fonts.ready; });
    await sliderCall(page, 'pause', 'paused');
    // A pre-existing fade can reject slickGoTo while waitForAnimate is true.
    await page.waitForTimeout(1800);
    await sliderCall(page, 'slickGoTo', 0, true);
    await page.waitForTimeout(1800);
    const layout = await dom(page), shots = [];
    for (let index = 0; index < layout.images.length; index++) {
      await sliderCall(page, 'slickGoTo', index, true);
      await page.waitForTimeout(1800);
      assert.equal(await page.locator('.slider_slick .slick-current').getAttribute('data-index'), String(index));
      const file = `screenshots/${stage}/hero-${width}-${index}.png`;
      await page.locator('.slider_slick').screenshot({ path: `${output}/${file}`, animations: 'disabled', mask: [page.locator('.tt-chat-launcher'), page.locator('.btn-frame')] });
      let difference;
      if (baseline) {
        const old = baseline.find(row => row.width === width && !row.slow);
        const a = await sharp(`${output}/${old.shots[index].file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const b = await sharp(`${output}/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual(a.info, b.info);
        let max = 0, sum = 0;
        for (let k = 0; k < a.data.length; k++) { const delta = Math.abs(a.data[k] - b.data[k]); max = Math.max(max, delta); sum += delta; }
        difference = { max, mean: sum / a.data.length };
        // Allow Chrome's 8-bit resampling rounding between fresh contexts.
        // Sources, crop and geometry must also match exactly below.
        assert(max <= 2, `Hero pixels changed: ${width}/${index} ${JSON.stringify(difference)}`);
      }
      shots.push({ index, file, difference });
    }
    // Compare actual DOM and Slick settings; only the intended image hints may differ.
    if (baseline) {
      const old = baseline.find(row => row.width === width && !row.slow);
      const strip = row => ({ rect: row.rect, settings: row.settings, images: row.images.map(({ loading, priority, ...image }) => image) });
      assert.deepEqual(strip(layout), strip(old.layout));
      assert.equal(layout.images[0].loading, 'eager');
      assert.equal(layout.images[0].priority, 'high');
      assert.equal(layout.preloads.find(p => p.href === layout.images[0].src)?.priority, 'high');
      assert.equal(layout.preloads.filter(p => p.priority === 'high').length, 1);
      assert(layout.images.slice(1).every(image => image.priority === null && image.loading === null));
      assert.deepEqual(layout.preloads.filter(p => layout.images.some(i => i.src === p.href)).map(p => p.href), old.layout.preloads.filter(p => old.layout.images.some(i => i.src === p.href)).map(p => p.href));
    }
    const metrics = await page.evaluate(() => ({ lcp: window.__heroLcp, frames: window.__heroFrames, shifts: window.__heroShifts, navigation: performance.getEntriesByType('navigation')[0].toJSON() }));
    records.push({ width, slow: false, errors, layout, ssr, shots, metrics, network: [...network.values()] });
    save(`browser-${stage}.json`, records);
    assert.equal(errors.length, 0);
    console.log(JSON.stringify({ stage, width, slides: layout.images.length, heroPreloads: layout.preloads.filter(p => layout.images.some(i => i.src === p.href)).length, pixelCheck: baseline ? 'PASS' : 'baseline', lcp: metrics.lcp.at(-1) }));
    await context.close();
  }
  // Cold 10 Mbps / 100 ms latency. Observe > 2 full loops at the original interval.
  if (visualOnly) {
    // Keep the original cold-network/autoplay baseline; recapture only settled UI.
    const previous = JSON.parse(fs.readFileSync(`${output}/browser-${stage}-slow-reference.json`, 'utf8'));
    records.push(...previous.filter(row => row.slow));
    save(`browser-${stage}.json`, records);
  }
  for (const width of visualOnly ? [] : [1440,390]) {
    const { context, page, errors, network } = await setup(width, true);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.slider_slick:not(.carousel-hydrating)').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(34000);
    const layout = await dom(page);
    const autoplay = await page.evaluate(() => window.__heroFrames);
    const transitions = autoplay.filter((frame, i) => i === 0 || frame.index !== autoplay[i-1].index);
    assert(transitions.every((frame, i) => i === 0 || frame.index === (transitions[i-1].index + 1) % layout.images.length), 'Autoplay order or loop changed');
    // Test real touch/mouse drag without introducing programmatic focus/scroll.
    await sliderCall(page, 'pause', 'paused');
    await page.waitForTimeout(1800);
    const bounds = await page.locator('.slider_slick').boundingBox();
    const startIndex = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .5, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(1800);
    const endIndex = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
    assert.notEqual(startIndex, endIndex, 'Swipe/drag did not advance');
    let touch;
    if (stage === 'after' && width === 390) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const point = fraction => ({ x: bounds.x + bounds.width * fraction, y: bounds.y + bounds.height * .5 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.8)] });
      for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.8 - step * .06)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1800);
      const touchEndIndex = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
      assert.notEqual(endIndex, touchEndIndex, 'Mobile touch swipe did not advance');
      touch = { startIndex: endIndex, endIndex: touchEndIndex };
    }
    const metrics = await page.evaluate(() => ({ lcp: window.__heroLcp, frames: window.__heroFrames, shifts: window.__heroShifts, navigation: performance.getEntriesByType('navigation')[0].toJSON() }));
    assert(transitions.length >= 10, `Not enough autoplay transitions: ${transitions.length}`);
    assert.equal(errors.length, 0);
    const blankTransitions = transitions.filter(frame => frame.index !== 0 && !frame.ready);
    const record = { width, slow: true, errors, layout, metrics, transitions, blankTransitions, drag: { startIndex, endIndex }, touch, network: [...network.values()] };
    records.push(record);
    save(`browser-${stage}.json`, records);
    if (baseline) {
      const old = baseline.find(row => row.width === width && row.slow);
      assert.deepEqual(layout.settings, old.layout.settings);
      assert(blankTransitions.length <= old.blankTransitions.length, `Slow network blank transitions regressed ${width}: ${blankTransitions.length} > ${old.blankTransitions.length}`);
    }
    console.log(JSON.stringify({ stage, width, slow: true, transitions: transitions.length, blankTransitions: blankTransitions.length, drag: { startIndex, endIndex } }));
    await context.close();
  }
  if (slowOnly) save(`browser-${stage}-slow-reference.json`, records);
} finally { await browser.close(); }
