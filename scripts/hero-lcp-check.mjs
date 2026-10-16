// Production-build regression for the hero visibility condition only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'cheerio';
import { chromium } from 'playwright';

const variant = process.argv[2];
assert(['before', 'after'].includes(variant));
const run = process.env.HERO_RUN || '';
assert(!run || /^[a-z0-9-]{1,30}$/.test(run));
const output = resolve('../docs/artifacts/hero-lcp-fix-2026-10-16', run);
await mkdir(resolve(output, 'images'), { recursive: true });
await mkdir(resolve(output, variant), { recursive: true });
const digest = value => createHash('sha256').update(value).digest('hex');
const files = ['components/common/Carousel.tsx', 'components/common/Markup.tsx', 'components/common/ResponsiveImage.tsx', 'lib/image-delivery.ts', 'app/globals.css', 'lib/public-api.ts', 'lib/public-pages.ts', 'app/page.tsx', 'app/layout.tsx'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, digest(await readFile(file))])));
const sourceHashes = await hashes();
const slidesResponse = await fetch('http://127.0.0.1:4000/api/v1/slides?limit=100');
assert.equal(slidesResponse.status, 200);
const slides = (await slidesResponse.json()).data;
const heroAsset = url => slides.some(slide => url.includes(new URL(slide.imageUrl).pathname));
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const base = `http://127.0.0.1:${port}`;
let child, browser;
const result = { variant, time: new Date().toISOString(), buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), sourceHashes, cases: [], failures: [] };
const save = () => writeFile(resolve(output, `${variant}/result.json`), JSON.stringify(result, null, 2));
try {
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: 'http://127.0.0.1:4000', HOME_CMS_COMPOSITION: 'false', PERF_DIAGNOSTICS: 'false' } });
  for (let i = 0; ; i++) {
    try { const r = await fetch(base); if (r.ok) { await r.text(); break; } } catch {}
    if (i > 120 || child.exitCode !== null) throw Error('Isolated production Next startup failed');
    await new Promise(done => setTimeout(done, 250));
  }
  const html = await (await fetch(base)).text(), $ = load(html);
  const hero = $('.slider_slick');
  assert.equal(hero.length, 1);
  assert.equal(hero.hasClass('carousel-hydrating'), variant === 'before');
  const others = $('.slick-slider').filter((_, el) => !$(el).hasClass('slider_slick'));
  assert(others.length > 0);
  others.each((_, el) => assert($(el).hasClass('carousel-hydrating'), 'Other SSR carousels keep their hydration guard'));
  result.ssr = { heroClass: hero.attr('class'), imageAttributes: hero.find('img').toArray().map(el => el.attribs), preloads: $('link[rel="preload"][as="image"]').toArray().map(el => el.attribs), otherCarousels: others.toArray().map(el => ({ className: el.attribs.class, hash: digest($.html(el)) })) };
  assert.equal(result.ssr.imageAttributes[0].loading, 'eager');
  assert.equal(result.ssr.imageAttributes[0].fetchpriority, 'high');
  // Compare all business SSR HTML after removing ONLY the intentional hero class
  // and Next's variable transport/script bookkeeping, as in the earlier golden.
  hero.removeClass('carousel-hydrating hero-ssr');
  const metadata = $('title,meta,link[rel="canonical"],link[rel="icon"]').toArray().map(el => $.html(el)).sort();
  $('title,meta,link[rel="canonical"],link[rel="icon"]').remove();
  $('script').each((_, el) => { if ($(el).attr('type') !== 'application/ld+json') $(el).remove(); });
  $('link[as="script"]').remove();
  // CSS content is checked by the exact source patch; its bundle fingerprint
  // necessarily changes when the scoped SSR track rule is added.
  $('link[rel="stylesheet"]').each((index, el) => { if (/^\/_next\/static\/css\//.test($(el).attr('href') || '')) $(el).attr('href', `/next-css-${index}.css`); });
  $('template[id^="B:"]').remove();
  $('[hidden][id^="S:"]').each((_, el) => { if (!$(el).children().length && !$(el).text()) $(el).remove(); });
  result.ssr.normalizedBusinessHash = digest(JSON.stringify({ metadata, html: $.html().replace(/<!--(?:\$\??|\/\$|\$!| )-->/g, '').replace(/\snonce="[^"]*"/g, '') }));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const configs = [
    ...[{ device: 'mobile', width: 390, height: 844, dpr: 3 }, { device: 'desktop', width: 1440, height: 1000, dpr: 1 }].flatMap(device => ['normal', 'delayed-js', 'no-js', 'slow-cold'].map(mode => ({ ...device, mode, name: `${device.device}-${mode}` }))),
    { device: 'mobile', width: 360, height: 844, dpr: 2, mode: 'normal', name: 'mobile-360-normal' },
  ];
  for (const config of configs) {
    if (process.env.HERO_CASES && !process.env.HERO_CASES.split(',').includes(config.name)) continue;
    const row = { config, requests: [], pageErrors: 0, hydrationErrors: 0 };
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: config.dpr, isMobile: config.device === 'mobile', hasTouch: config.device === 'mobile', javaScriptEnabled: config.mode !== 'no-js' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', () => row.pageErrors++);
    page.on('console', message => { if (message.type() === 'error' && /hydration|hydrating|server rendered|Minified React error #(418|419|421|422|423|425)/i.test(message.text())) row.hydrationErrors++; });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (config.mode === 'slow-cold') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000 });
    cdp.on('Network.requestWillBeSent', event => { if (event.type === 'Image' && heroAsset(event.request.url)) row.requests.push({ url: event.request.url, priority: event.request.initialPriority, initiator: event.initiator.type }); });
    const started = Date.now();
    let releaseJs;
    const gate = new Promise(done => { releaseJs = done; });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET' || request.headers()['next-router-prefetch']) return route.abort();
      if (url.origin === base) {
        if (config.mode === 'delayed-js' && request.resourceType() === 'script') await gate;
        return route.continue();
      }
      if (heroAsset(url.href) && request.resourceType() === 'image') {
        const file = resolve('../docs/artifacts/hero-lcp-fix-2026-10-16/images', `${digest(url.href)}.bin`), metaFile = file + '.json';
        let body, meta;
        try { body = await readFile(file); meta = JSON.parse(await readFile(metaFile, 'utf8')); }
        catch {
          const remote = await route.fetch({ timeout: 20000 });
          assert.equal(remote.status(), 200, 'Public hero image fixture must load');
          body = await remote.body(); meta = { url: url.href, contentType: remote.headers()['content-type'], sha256: digest(body), bytes: body.length };
          await writeFile(file, body); await writeFile(metaFile, JSON.stringify(meta, null, 2));
        }
        if (config.mode === 'slow-cold') await new Promise(done => setTimeout(done, 1000));
        return route.fulfill({ status: 200, contentType: meta.contentType, body });
      }
      return route.abort();
    });
    const probe = () => {
      if (window.__heroLcpCheck) return;
      const data = window.__heroLcpCheck = { samples: [], shifts: [], lcp: [] };
      try { new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) data.shifts.push({ time: e.startTime, value: e.value, hero: e.sources?.some(s => s.node?.closest?.('.slider')) ?? false }); })).observe({ type: 'layout-shift', buffered: true }); } catch {}
      try { new PerformanceObserver(list => list.getEntries().forEach(e => { if (e.element?.closest('.slider_slick')) data.lcp.push({ time: e.startTime, loadTime: e.loadTime, renderTime: e.renderTime }); })).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
      let last = '', frames = 0;
      const sample = () => {
        const slider = document.querySelector('.slider_slick'), img = slider?.querySelector('img');
        if (slider && img) {
          const rect = slider.getBoundingClientRect(), imageRect = img.getBoundingClientRect();
          const sample = { visible: getComputedStyle(slider).visibility === 'visible', loaded: img.complete && img.naturalWidth > 0, hydrated: !slider.classList.contains('carousel-hydrating') && !slider.classList.contains('hero-ssr'), activeIndex: slider.querySelector('.slick-current')?.getAttribute('data-index'), width: rect.width, height: rect.height, imageHeight: imageRect.height, imageX: imageRect.x - rect.x, documentWidth: document.documentElement.scrollWidth, cssReady: [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet), opaqueSlides: [...slider.querySelectorAll('.slick-slide')].filter(slide => Number(getComputedStyle(slide).opacity) > 0.99).length };
          const key = JSON.stringify(sample);
          if (key !== last && data.samples.length < 350) { data.samples.push({ time: performance.now(), ...sample }); last = key; }
        }
      };
      window.__heroLcpSample = sample;
      const tick = () => { sample(); if (++frames < 2400) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    if (config.mode !== 'no-js') await page.addInitScript(probe);
    try {
      await page.goto(base, { waitUntil: 'commit', timeout: 60000 });
      await page.locator('.slider_slick img').first().waitFor({ state: 'attached' });
      if (config.mode === 'no-js') { await page.evaluate(probe); await page.evaluate(() => window.__heroLcpSample()); } // CDP observer only; app JS stays disabled.
      await page.waitForFunction(() => { const slider = document.querySelector('.slider_slick'), img = slider?.querySelector('img'); return img?.complete && img.naturalWidth > 0 && [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet); }, undefined, { timeout: 60000 });
      if (config.mode === 'no-js') { await page.evaluate(() => window.__heroLcpSample()); row.timingMethod = 'DevTools snapshots before/after load check; upper bounds, application JS disabled'; }
      if (config.mode === 'delayed-js' || config.mode === 'no-js') {
        row.beforeAppJs = await page.locator('.slider_slick').evaluate(slider => ({ visibility: getComputedStyle(slider).visibility, className: slider.className, height: slider.getBoundingClientRect().height, active: slider.querySelector('.slick-current')?.getAttribute('data-index'), otherGuards: [...document.querySelectorAll('.slick-slider:not(.slider_slick)')].map(el => ({ className: el.className, visibility: getComputedStyle(el).visibility })) }));
        assert.equal(row.beforeAppJs.visibility, variant === 'after' ? 'visible' : 'hidden');
        assert(row.beforeAppJs.otherGuards.every(el => el.visibility === 'hidden' && el.className.includes('carousel-hydrating')));
        row.beforeAppJs.imageChain = await page.locator('.slider_slick img').first().evaluate(img => {
          const chain = [];
          for (let el = img; el && el.tagName !== 'BODY'; el = el.parentElement) {
            const style = getComputedStyle(el), rect = el.getBoundingClientRect();
            chain.push({ tag: el.tagName, className: el.className, inline: el.getAttribute('style'), visibility: style.visibility, opacity: style.opacity, transform: style.transform, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          }
          const r = img.getBoundingClientRect(), covering = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { chain, covering: covering ? { tag: covering.tagName, className: covering.className } : null };
        });
        await page.waitForTimeout(750);
        await page.locator('.slider').screenshot({ path: resolve(output, variant, `${config.name}-ssr.png`), timeout: 15000 });
      }
      if (config.mode === 'delayed-js') {
        await page.waitForTimeout(Math.max(0, 3000 - (Date.now() - started)));
        row.jsReleaseAtMs = Date.now() - started; releaseJs();
      }
      if (config.mode !== 'no-js') {
        await page.waitForFunction(() => document.querySelector('.slider_slick') && !document.querySelector('.slider_slick').classList.contains('carousel-hydrating') && !document.querySelector('.slider_slick').classList.contains('hero-ssr') && [...document.querySelectorAll('.slick-slider:not(.slider_slick)')].every(el => !el.classList.contains('carousel-hydrating')), undefined, { timeout: 60000 });
        // Wait out Slick's unchanged 650ms style transition before comparing pixels.
        await page.waitForTimeout(750);
        await page.locator('.slider').screenshot({ path: resolve(output, variant, `${config.name}-hydrated.png`), timeout: 15000 });
        if (config.mode === 'normal') {
          const initial = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
          await page.waitForFunction(index => document.querySelector('.slider_slick .slick-current')?.getAttribute('data-index') !== index, initial, { timeout: 6000 });
          row.autoplay = true;
          await page.waitForTimeout(750);
          const previous = await page.locator('.slider_slick .slick-current').getAttribute('data-index');
          if (config.device === 'mobile') {
            const bounds = await page.locator('.slider').boundingBox(), x = config.width * .8, y = bounds.y + bounds.height / 2;
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
            for (let n = 1; n <= 6; n++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - config.width * .6 * n / 6, y, id: 1 }] }); await page.waitForTimeout(20); }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForFunction(index => document.querySelector('.slider_slick .slick-current')?.getAttribute('data-index') !== index, previous, { timeout: 1200 });
            row.touchSwipe = true;
          } else {
            await page.locator('.slider_slick .hero-dots button').nth(3).click();
            await page.waitForFunction(() => document.querySelector('.slider_slick .slick-current')?.getAttribute('data-index') === '3');
            row.dotNavigation = true;
          }
          await page.waitForTimeout(750);
        }
      }
      row.final = await page.evaluate(() => {
        const slider = document.querySelector('.slider_slick'), img = slider.querySelector('img');
        const heroBox = slider.getBoundingClientRect();
        return { probe: window.__heroLcpCheck, visibility: getComputedStyle(slider).visibility, width: heroBox.width, height: heroBox.height, imageSrc: img.currentSrc, dots: getComputedStyle(slider.querySelector('.hero-dots')).display, externalOverlayBoxes: [...document.querySelectorAll('.tt-chat-launcher')].map(el => { const r = el.getBoundingClientRect(); return { selector: '.tt-chat-launcher', outsideHero: !el.closest('.slider'), x: r.x - heroBox.x, y: r.y - heroBox.y, width: r.width, height: r.height, shadowPadding: 20 }; }), otherCarousels: [...document.querySelectorAll('.slick-slider:not(.slider_slick),.lookup-carousel-mobile')].map(el => ({ className: el.className, visibility: getComputedStyle(el).visibility, imageCount: el.querySelectorAll('img').length })), navigation: performance.getEntriesByType('navigation').map(e => ({ responseStart: e.responseStart, responseEnd: e.responseEnd, domContentLoaded: e.domContentLoadedEventEnd })) };
      });
      const samples = row.final.probe.samples;
      row.timing = { firstImageLoadedMs: samples.find(s => s.loaded)?.time ?? null, firstHeroVisibleMs: samples.find(s => s.visible && s.cssReady)?.time ?? null, firstLoadedVisibleMs: samples.find(s => s.loaded && s.visible && s.cssReady)?.time ?? null };
      assert.equal(row.pageErrors, 0); assert.equal(row.hydrationErrors, 0);
      const stable = samples.filter(s => s.cssReady && s.width > 0);
      assert(stable.every(s => Math.abs(s.height - row.final.height) < 1), 'No hero height shift after CSS');
      assert(stable.every(s => s.documentWidth <= config.width), 'No horizontal overflow');
      assert(stable.filter(s => s.activeIndex === '0').every(s => s.opaqueSlides === 1), 'Only one opaque slide initially');
      if (variant === 'after') assert(stable.every(s => s.visible), 'Hero never hidden waiting for hydration');
      if (variant === 'after') assert(stable.filter(s => s.activeIndex === '0').every(s => Math.abs(s.imageX) < 1), 'First SSR image is inside the clipping viewport');
      assert(row.final.otherCarousels.length > 0);
    } catch (error) {
      row.failure = String(error.message).replaceAll(base, '<local-next>'); result.failures.push(config.name);
      row.diagnostic = await page.evaluate(() => {
        const img = document.querySelector('.slider_slick img'), chain = [];
        for (let el = img; el && el.tagName !== 'BODY'; el = el.parentElement) { const s = getComputedStyle(el), r = el.getBoundingClientRect(); chain.push({ tag: el.tagName, className: el.className, inline: el.getAttribute('style'), visibility: s.visibility, opacity: s.opacity, transform: s.transform, x: r.x, y: r.y, width: r.width, height: r.height }); }
        return { img: img ? { complete: img.complete, naturalWidth: img.naturalWidth, src: img.currentSrc } : null, chain, styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => ({ href: new URL(el.href).pathname, ready: Boolean(el.sheet) })) };
      }).catch(() => null);
    }
    finally { releaseJs(); await context.close(); }
    result.cases.push(row); await save();
    console.log(JSON.stringify({ variant, case: config.name, timing: row.timing, failure: row.failure, autoplay: row.autoplay, swipe: row.touchSwipe }));
  }
} finally {
  await browser?.close(); child?.kill();
  if (child && child.exitCode === null) await new Promise(done => child.once('exit', done));
  result.sourceUnchangedDuringTests = JSON.stringify(sourceHashes) === JSON.stringify(await hashes());
  await save();
}
assert.equal(result.failures.length, 0, 'Every case must pass; failed cases are retained');
