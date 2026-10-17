// Production build + isolated GET-only fixture. Never changes application state.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { cpus } from 'node:os';
import { chromium } from 'playwright';
import { load } from 'cheerio';
import { api, listen } from './css-fixture.mjs';
import { sources, generate, absoluteUrls, digest } from './build-legacy-css.mjs';

const stage = process.argv[2];
const visualProtocol = 'cdn-width-frozen-css-250ms-v2';
assert(['before', 'after', 'bench', 'audit', 'control', 'paint', 'smoke'].includes(stage));
const project = resolve(process.env.CSS_AUDIT_PROJECT || '.');
const buildId = (await readFile(resolve(project, '.next/BUILD_ID'), 'utf8')).trim();
const out = resolve('../docs/artifacts/css-optimization-2026-10-17');
await mkdir(out, { recursive: true });
const generated = await generate();
assert.equal(absoluteUrls('x{src:url("../webfonts/fa-solid-900.woff2")}', '/assets/css/all.css'), 'x{src:url("/assets/webfonts/fa-solid-900.woff2")}');
assert.equal(absoluteUrls('x{src:url("../webfonts/fa-solid-900.eot?#iefix")}', '/assets/css/all.css'), 'x{src:url("/assets/webfonts/fa-solid-900.eot?#iefix")}');
assert.equal(absoluteUrls('x{background:url(./ajax-loader.gif?v=1#image)}', '/assets/slick/slick-theme.css'), 'x{background:url(/assets/slick/ajax-loader.gif?v=1#image)}');
for (const css of ['x{background:url("data:image/svg+xml,<svg>(x)</svg>")}', 'x{background:url(//cdn.example/image.png)}', 'x{filter:url(#filter)}'])
  assert.equal(absoluteUrls(css, '/assets/css/style.css'), css, 'Data/external/fragment URLs must not change');
assert.deepEqual(await generate(async source => (await readFile(resolve('public', source.slice(1)), 'utf8')).replace(/\r?\n/g, '\r\n')), generated,
  'Windows CRLF and Ubuntu LF produce identical CSS, fingerprint and manifest');
assert.notDeepEqual((await generate(async source => (await readFile(resolve('public', source.slice(1)), 'utf8')) + (source === sources[0] ? '\n.css-source-probe{color:red}' : ''))).manifest,
  generated.manifest, 'Source changes invalidate the generated manifest/fingerprint');
let child, baselineChild, browser;
const stable = html => {
  const $ = load(html);
  $('script:not([type="application/ld+json"]),link[as="script"]').remove();
  // CSS resources are tested separately, rule-for-rule, without ignoring DOM.
  $('link[rel="stylesheet"],link[rel="preload"][as="style"]').remove();
  const metadata = $('title,meta,link[rel="canonical"],link[rel="icon"]').toArray().map(e => $.html(e)).sort();
  $('title,meta,link[rel="canonical"],link[rel="icon"]').remove();
  $('template[id^="B:"]').remove();
  $('[hidden][id^="S:"]').each((_, e) => { if (!$(e).children().length && !$(e).text()) $(e).remove(); });
  return JSON.stringify({ metadata, html: $.html().replace(/<!--(?:\$\??|\/\$|\$!| )-->/g, '') });
};
const compareHints = snapshot => {
  const data = JSON.parse(snapshot), $ = load(data.html);
  // React can stream equivalent image hints in a different order, including
  // original-CSS A/A. Compare the complete multiset of hints and EVERY attribute.
  const hints = [...(data.hints || []), ...$('link[rel="preload"]').toArray().map(e => $.html(e))].sort();
  $('link[rel="preload"]').remove();
  $('[hidden][id^="S:"]').each((_, e) => { if (!$(e).children().length && !$(e).text()) $(e).remove(); });
  return JSON.stringify({ metadata: data.metadata, hints, html: $.html() });
};
const sourceTexts = await Promise.all(sources.map(async source => ({ source, css: await readFile(resolve('public', source.slice(1)), 'utf8') })));
try {
  await listen(api);
  const reservation = createServer(); await listen(reservation);
  const port = reservation.address().port; await new Promise(done => reservation.close(done));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', project, '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: project, windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`, PERF_DIAGNOSTICS: 'false', HOME_CMS_COMPOSITION: 'false' },
  });
  for (let i = 0; ; i++) {
    try { const r = await fetch(base); await r.text(); if (r.ok) break; } catch {}
    if (i > 180 || child.exitCode !== null) throw Error('Next fixture startup failed');
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  // All browser-accepted rules, not just currently matched selectors. This also
  // covers arbitrary future CMS classes, nested media, keyframes and font faces.
  const cssPage = await browser.newPage();
  await routes(cssPage);
  await cssPage.coverage.startCSSCoverage();
  await cssPage.goto(base + '/');
  const links = await cssPage.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(n => ({ href: new URL(n.href).pathname, media: n.media || 'all' })));
  const coverage = await cssPage.coverage.stopCSSCoverage();
  const inventory = [];
  for (const link of links) {
    const response = await fetch(base + link.href), css = await response.text();
    assert.equal(response.status, 200);
    const entry = coverage.find(e => new URL(e.url).pathname === link.href);
    inventory.push({ ...link, raw: Buffer.byteLength(css), gzip: gzipSync(css).length, brotli: brotliCompressSync(css).length,
      ruleCharactersUsed: entry?.ranges.reduce((sum, r) => sum + r.end - r.start, 0), characters: entry?.text.length, sha256: digest(css) });
  }
  if (stage === 'before') {
    assert.equal(inventory.length, 14, 'Never overwrite baseline goldens on the candidate build');
    assert.deepEqual(inventory.slice(4).map(e => e.href), sources, 'Original synchronous stylesheet order');
  }
  if (process.env.CSS_AUDIT_REFRESH_CONTRACTS === 'true') {
    assert.equal(stage, 'control', 'Contract refresh is only allowed on the original-CSS control');
    assert.equal(inventory.length, 14);
    assert.deepEqual(inventory.slice(4).map(e => e.href), sources);
  }
  if (['after', 'bench', 'paint', 'smoke'].includes(stage)) {
    const baseline = JSON.parse(await readFile(resolve(out, 'before-stylesheets.json'), 'utf8'));
    const identity = rows => rows.map(({ href, media, sha256 }) => ({ href, media, sha256 }));
    assert.deepEqual(identity(inventory.slice(0, 4)), identity(baseline.slice(0, 4)), 'Unchanged ordered Next CSS bundles');
    assert.equal(inventory.length, 5);
    assert.equal(inventory[4].href, generated.manifest.href);
    assert.equal(inventory[4].media, 'all');
  }
  await writeFile(resolve(out, `${stage}-stylesheets.json`), JSON.stringify(inventory, null, 2));
  const cssom = await cssPage.evaluate(({ inputs, candidate }) => {
    const rules = text => {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(text);
      return [...sheet.cssRules].map(r => r.cssText);
    };
    return { original: inputs.flatMap(rules), candidate: rules(candidate) };
  }, { inputs: sourceTexts.map(({ css, source }) => absoluteUrls(css, source)), candidate: generated.css });
  assert.deepEqual(cssom.candidate, cssom.original, 'Identical ordered CSSOM; no dropped/reordered/rewritten declarations');
  await writeFile(resolve(out, 'cssom.json'), JSON.stringify({ rules: cssom.original.length, sha256: digest(JSON.stringify(cssom.original)), equal: true,
    sources: generated.manifest.sources, beforeGzip: sourceTexts.reduce((n, x) => n + gzipSync(x.css).length, 0), afterGzip: gzipSync(generated.css).length,
    beforeBrotli: sourceTexts.reduce((n, x) => n + brotliCompressSync(x.css).length, 0), afterBrotli: brotliCompressSync(generated.css).length }, null, 2));
  await cssPage.close();

  const results = [];
  async function routes(page) {
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() !== 'GET') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/car-menu') return route.fulfill({ json: { data: [] } });
        const r = await fetch(`http://127.0.0.1:${api.address().port}${url.pathname}${url.search}`);
        return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
      }
      if (url.hostname !== '127.0.0.1') {
        if (req.resourceType() !== 'image') return route.abort();
        // A srcset 240w/320w response must have that intrinsic width. Returning
        // 200px for every CDN variant changes density-corrected naturalWidth
        // depending on which candidate the browser/cache selects (e.g. logos).
        const width = Number(url.pathname.match(/width=(\d+)/)?.[1] || 200);
        const height = Math.max(1, Math.round(width / 2));
        return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eee"/></svg>` });
      }
      return route.continue();
    });
  }

  if (stage === 'bench') {
    assert(process.env.CSS_BASELINE_PROJECT, 'Use a real baseline production build; never rewrite hydrated HTML');
    const baselineProject = resolve(process.env.CSS_BASELINE_PROJECT);
    const reserved = createServer(); await listen(reserved); const baselinePort = reserved.address().port; await new Promise(done => reserved.close(done));
    baselineChild = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', baselineProject, '--hostname', '127.0.0.1', '--port', String(baselinePort)], {
      cwd: baselineProject, windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`, PERF_DIAGNOSTICS: 'false', HOME_CMS_COMPOSITION: 'false' },
    });
    const baseA = `http://127.0.0.1:${baselinePort}`;
    for (let i = 0; ; i++) { try { const r = await fetch(baseA); await r.text(); if (r.ok) break; } catch {} if (i > 180 || baselineChild.exitCode !== null) throw Error('Baseline Next startup failed'); await new Promise(done => setTimeout(done, 250)); }
    // Equal sequential SSR warm-up; never run another measured workload in
    // parallel. Browser contexts and HTTP caches remain cold for every sample.
    for (let i = 0; i < 3; i++) for (const origin of [baseA, base]) { const response = await fetch(origin); assert(response.ok); await response.text(); }
    // A/B/B/A, repeated twice per device. Both variants use the same production
    // data, fonts, images and fresh browser contexts. Only CSS links differ
    // between the actual builds. Processes are both idle between navigations.
    for (const mobile of [false, true]) for (let run = 0; run < 8; run++) {
      const variant = ['A', 'B', 'B', 'A'][run % 4];
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(); await routes(page, variant);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (mobile) {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.addInitScript(() => {
        window.__cssAudit = { lcp: [], shifts: [] };
        new PerformanceObserver(list => list.getEntries().forEach(e => window.__cssAudit.lcp.push({ startTime: e.startTime, tag: e.element?.tagName, className: e.element?.className }))).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cssAudit.shifts.push(e.value); })).observe({ type: 'layout-shift', buffered: true });
      });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const cpuNow = () => cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((n, x) => n + x, 0) }), { idle: 0, total: 0 });
      const cpuDelta = (a, b) => 100 * (1 - (b.idle - a.idle) / (b.total - a.total));
      const pre = cpuNow(); await new Promise(r => setTimeout(r, 1000)); const startCpu = cpuNow();
      try {
        await page.goto((variant === 'A' ? baseA : base) + '/', { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(mobile ? 3500 : 1500);
        const metrics = await page.evaluate(() => ({ ttfb: performance.getEntriesByType('navigation')[0].responseStart,
          protocol: performance.getEntriesByType('navigation')[0].nextHopProtocol,
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, lcp: window.__cssAudit.lcp.at(-1),
          cls: window.__cssAudit.shifts.reduce((a, b) => a + b, 0),
          scripts: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script').map(r => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize })),
          fonts: performance.getEntriesByType('resource').filter(r => /\.woff2/.test(r.name)).map(r => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize })),
          css: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'link' && /\.css(?:\?|$)/.test(r.name)).map(r => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize, end: r.responseEnd })) }));
        assert.equal(metrics.css.length, variant === 'A' ? 14 : 5, 'Actual initial CSS request count');
        assert(Number.isFinite(metrics.fcp) && Number.isFinite(metrics.lcp?.startTime), 'Both FCP and LCP samples are required');
        const endCpu = cpuNow();
        await new Promise(r => setTimeout(r, 1000)); const post = cpuNow();
        results.push({ mobile, run, variant, ...metrics, hostCpu: { before: cpuDelta(pre, startCpu), during: cpuDelta(startCpu, endCpu), after: cpuDelta(endCpu, post) }, errors });
        console.log(`BENCH ${mobile ? 'mobile' : 'desktop'} ${run} ${variant}: FCP ${metrics.fcp}, LCP ${metrics.lcp?.startTime}, CLS ${metrics.cls}`);
      } catch (error) { results.push({ mobile, run, variant, failure: String(error), errors }); console.warn(`BENCH FAILED ${mobile} ${run} ${variant}: ${String(error)}`); }
      await writeFile(resolve(out, 'benchmark.json'), JSON.stringify({ build: buildId, baselineBuild: (await readFile(resolve(baselineProject, '.next/BUILD_ID'), 'utf8')).trim(), results }, null, 2));
      await context.close();
    }
  } else if (stage === 'paint') {
    for (const width of [390, 1440]) for (const mode of ['normal', 'no-js', 'delayed-js', 'delayed-css', 'slow-cold']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: mode !== 'no-js' });
      const page = await context.newPage(); await routes(page);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      if (mode === 'delayed-js') await page.route('**/*.js*', async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue(); });
      if (mode === 'delayed-css') await page.route('**' + generated.manifest.href, async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
      const cdp = await context.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (mode === 'slow-cold') {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const response = await page.goto(base + '/', { waitUntil: 'commit' }); assert.equal(response.status(), 200);
      if (mode === 'no-js') {
        // RAF polling itself depends on script execution. Inspect the SSR DOM
        // synchronously after native load when page JavaScript is disabled.
        await page.waitForLoadState('load');
        const state = await page.evaluate(() => {
          const h = document.querySelector('.slider_slick'), i = h?.querySelector('img');
          return { present: !!h, complete: i?.complete, width: i?.naturalWidth, visible: h ? getComputedStyle(h).visibility : null };
        });
        assert(state.present && state.complete && state.width > 0 && state.visible === 'visible', JSON.stringify(state));
      } else await page.waitForFunction(() => {
          const hero = document.querySelector('.slider_slick'), image = hero?.querySelector('img');
          return image?.complete && image.naturalWidth > 0 && getComputedStyle(hero).visibility === 'visible' && performance.getEntriesByName('first-contentful-paint').length;
        });
      const firstVisible = await page.locator('.slider_slick').evaluate(e => ({ at: performance.now(), fromSsr: e.classList.contains('hero-ssr'), visible: getComputedStyle(e).visibility, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
      await page.waitForLoadState('load'); await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        cssEnd: Math.max(...performance.getEntriesByType('resource').filter(e => /\.css$/.test(e.name)).map(e => e.responseEnd)),
        heroLoaded: performance.getEntriesByType('resource').find(e => e.name === document.querySelector('.slider_slick img').currentSrc)?.responseEnd }));
      if (Number.isFinite(metrics.fcp)) assert(metrics.fcp + 1 >= metrics.cssEnd, 'Blocking styles are complete before first content paint (no unstyled first paint)');
      else assert.equal(mode, 'no-js', 'FCP is required when scripts are enabled');
      if (mode === 'no-js' || mode === 'delayed-js') assert(firstVisible.fromSsr, 'Hero visible before hydration');
      assert.deepEqual(errors, []);
      results.push({ width, mode, ...metrics, firstVisible, errors });
      await page.screenshot({ path: resolve(out, `paint-${width}-${mode}.png`) });
      console.log(`PASS PAINT ${width} ${mode}: FCP ${metrics.fcp?.toFixed(1) ?? 'unavailable (JS disabled)'} CSS-end ${metrics.cssEnd.toFixed(1)}`);
      await context.close();
    }
  } else if (stage !== 'audit') {
    for (const width of process.env.CSS_AUDIT_WIDTHS ? process.env.CSS_AUDIT_WIDTHS.split(',').map(Number) : [360, 390, 430, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage(); await routes(page);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const snapshot = async name => {
        if (process.env.CSS_AUDIT_SNAPSHOT_ONLY && !name.endsWith(process.env.CSS_AUDIT_SNAPSHOT_ONLY)) return;
        await page.evaluate(async () => { await document.fonts.ready; [...document.images].forEach(i => { i.loading = 'eager'; }); await Promise.race([Promise.all([...document.images].map(i => i.decode().catch(() => {}))), new Promise(r => setTimeout(r, 5000))]); });
        // Clicking the ownership link moves pointer focus under the modal and
        // starts its existing 300 ms color transition. Compare the settled state.
        if (name.endsWith('-ownership') || name.endsWith('-contact')) await page.waitForTimeout(700);
        // Legacy infinite call-button animations do not honor reduced motion.
        // Freeze ONLY the test document at a defined frame before both DOM and
        // PNG capture; production CSS, animation durations and JS stay untouched.
        await page.evaluate(async () => {
          for (const animation of document.getAnimations()) {
            try {
              if (animation.effect?.getComputedTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 250; }
              else animation.finish();
            } catch { /* Non-time-based animation: retain its current state. */ }
          }
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        const sheets = await page.evaluate(() => [...document.styleSheets].map(sheet => ({ href: sheet.href ? new URL(sheet.href).pathname : '/inline.css', rules: [...sheet.cssRules].map(rule => rule.cssText) })));
        const orderedRules = sheets.flatMap(sheet => sheet.rules.map(rule => absoluteUrls(rule, sheet.href)));
        const contract = { sha256: digest(JSON.stringify(orderedRules)), count: orderedRules.length, sheets: sheets.map(s => s.href) };
        if (stage === 'before' || process.env.CSS_AUDIT_REFRESH_CONTRACTS === 'true') await writeFile(resolve(out, `${name}.cssom.json`), JSON.stringify(contract));
        else {
          const baseline = JSON.parse(await readFile(resolve(out, `${name}.cssom.json`), 'utf8'));
          assert.equal(contract.sha256, baseline.sha256, `${name}: complete ordered cascade differs: ${JSON.stringify({ actual: contract.sheets, expected: baseline.sheets })}`);
          assert.equal(contract.count, baseline.count);
        }
        if (process.env.CSS_AUDIT_CONTRACT_ONLY === 'true') { results.push({ name, contract }); return; }
        const dom = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => !['SCRIPT', 'STYLE', 'LINK', 'TITLE', 'META'].includes(e.tagName)).map(e => {
          const s = getComputedStyle(e), r = e.getBoundingClientRect();
          return { tag: e.tagName, className: e.className, box: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 100) / 100),
            styles: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.color, s.backgroundColor, s.display, s.visibility, s.position, s.margin, s.padding, s.border, s.borderRadius, s.transform, s.animationName],
            before: getComputedStyle(e, '::before').content, after: getComputedStyle(e, '::after').content };
        }));
        const png = await page.screenshot({ fullPage: true, animations: 'allow' });
        await writeFile(resolve(out, `${stage}-${name}.png`), png);
        if (stage === 'before') { await writeFile(resolve(out, `${name}.dom.json`), JSON.stringify(dom)); results.push({ name, captured: true }); }
        else {
          // Next may stream metadata into body or hoist it to head. Metadata
          // values are compared strictly in stable(); these nodes have no box.
          const expected = JSON.parse(await readFile(resolve(out, `${name}.dom.json`), 'utf8')).filter(e => !['TITLE', 'META'].includes(e.tag));
          // Chromium can report a different used value for auto margins before
          // a layout flush, even in original-CSS A/A. Authored margins/cascade
          // were just compared strictly above; compare actual geometry strictly.
          const comparable = rows => rows.map(e => ({ ...e, styles: e.styles.map((v, i) => i === 9 ? '<used-margin: compare ordered rules and geometry>' : v) }));
          const marginUsedValues = dom.flatMap((e, i) => e.styles[9] !== expected[i]?.styles[9] ? [{ index: i, actual: e.styles[9], expected: expected[i]?.styles[9] }] : []);
          if (JSON.stringify(comparable(dom)) !== JSON.stringify(comparable(expected))) {
            await writeFile(resolve(out, `${stage}-${name}.actual-dom.json`), JSON.stringify(dom));
            const first = dom.findIndex((e, i) => JSON.stringify(e) !== JSON.stringify(expected[i]));
            throw Error(`${name}: DOM/style mismatch at ${first}: ${JSON.stringify({ actual: dom[first], expected: expected[first], lengths: [dom.length, expected.length] })}`);
          }
          const previous = await readFile(resolve(out, `before-${name}.png`));
          const diff = await page.evaluate(async ({ a, b }) => {
            const imgs = await Promise.all([a, b].map(async x => createImageBitmap(await (await fetch('data:image/png;base64,' + x)).blob())));
            if (imgs[0].width !== imgs[1].width || imgs[0].height !== imgs[1].height) return { dimensionsDiffer: true };
            const c = document.createElement('canvas'); c.width = imgs[0].width; c.height = imgs[0].height; const ctx = c.getContext('2d', { willReadFrequently: true });
            const arrays = imgs.map(i => { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(i, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; });
            let changed = 0, max = 0;
            for (let i = 0; i < arrays[0].length; i += 4) { let d = 0; for (let j = 0; j < 4; j++) d = Math.max(d, Math.abs(arrays[0][i+j] - arrays[1][i+j])); if (d) changed++; max = Math.max(max, d); }
            return { changed, max };
          }, { a: previous.toString('base64'), b: png.toString('base64') });
          let matchesControl = false;
          if (stage !== 'control' && (diff.dimensionsDiffer || diff.max > 3)) {
            // An independent ORIGINAL-CSS control must match the candidate
            // byte-for-byte. Never mask image regions or widen pixel thresholds.
            const controls = JSON.parse(await readFile(resolve(out, 'control-result.json'), 'utf8'));
            assert.equal(controls.visualProtocol, visualProtocol,
              'Do not use an older screenshot protocol as an A/A control');
            assert(controls.results.some(row => row.name === name), 'Require an A/A control captured for this exact case');
            const control = await readFile(resolve(out, `control-${name}.png`));
            matchesControl = png.equals(control);
            assert(matchesControl, `${name}: screenshot changed beyond A/A control: ${JSON.stringify(diff)}`);
          }
          assert(!diff.dimensionsDiffer, `${name}: screenshot size`);
          results.push({ name, diff, matchesControl, marginUsedValues, cascadeSha256: contract.sha256 });
        }
        await writeFile(resolve(out, `${stage}-progress.json`), JSON.stringify({ complete: false, visualProtocol, results }, null, 2));
      };
      for (const [index, path] of ['/', '/san-pham', '/ban-xe', '/len-doi', '/font-car-0'].entries()) {
        if (process.env.CSS_AUDIT_ROUTE_ONLY && index !== Number(process.env.CSS_AUDIT_ROUTE_ONLY)) continue;
        if (process.env.CSS_AUDIT_HOME_ONLY === 'true' && index > 0) continue;
        const response = await page.goto(base + path, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
        const html = compareHints(stable(await response.text())); const name = `${width}-${index}`;
        if (stage === 'before') await writeFile(resolve(out, `${name}.html.json`), html);
        else {
          const expected = compareHints(await readFile(resolve(out, `${name}.html.json`), 'utf8'));
          if (html !== expected) {
            await writeFile(resolve(out, `${stage}-${name}.actual-html.json`), html);
            let i = 0; while (i < html.length && html[i] === expected[i]) i++;
            throw Error(`${name}: SSR business DOM/SEO/image hints differ at ${i}: ${JSON.stringify({ actual: html.slice(i, i + 200), expected: expected.slice(i, i + 200) })}`);
          }
        }
        await snapshot(name);
        if (index === 0) {
          // Open real header menu, then retain screenshot of the same state.
          if (width <= 960) { await page.getByRole('button', { name: 'Mở menu', exact: true }).click(); }
          const root = page.locator(width <= 960 ? '.tt-mobile-menu .tt-buy-menu' : '.hidden_m .tt-buy-menu');
          await root.locator(':scope > a').click();
          await page.waitForTimeout(450); await snapshot(`${name}-menu`);
        }
        if (index === 1) {
          await page.locator('[data-filter-popover-trigger]').first().click();
          await page.waitForTimeout(250); await snapshot(`${name}-filter`);
        }
        if (index === 4) {
          assert(await page.locator('.grid-pro-detail').count(), 'Fixture must render actual vehicle detail, not an article fallback');
          await page.locator('.album_pro .slick-active img').first().click();
          await page.locator('.vehicle-lightbox').waitFor();
          await snapshot(`${name}-lightbox`); await page.keyboard.press('Escape');
          await page.locator('.vehicle-lightbox').waitFor({ state: 'detached' });
          await page.locator('[href="#ownership-cost"]').click();
          await page.getByRole('dialog').waitFor();
          await snapshot(`${name}-ownership`);
          await page.keyboard.press('Escape'); await page.locator('.tt-own-dialog').waitFor({ state: 'detached' });
          await page.locator(width <= 960 ? '.tt-mobile-contact-bar button[data-src="#nutgoi"]' : '.hidden_m .hotline a').click();
          await page.locator('.migrated-dialog').waitFor();
          await snapshot(`${name}-contact`);
        }
        console.log(`PASS ${stage} ${name} ${path}`);
      }
      assert.deepEqual(errors, [], 'No page/hydration errors'); await context.close();
    }
  }
  const passed = results.every(row => !row.failure && (!row.errors || row.errors.length === 0));
  const summary = { passed, visualProtocol, browser: browser.version(), node: process.version, build: buildId, results };
  if (stage === 'bench') {
    summary.baselineBuild = (await readFile(resolve(process.env.CSS_BASELINE_PROJECT, '.next/BUILD_ID'), 'utf8')).trim();
    await writeFile(resolve(out, 'benchmark.json'), JSON.stringify(summary, null, 2));
  }
  await writeFile(resolve(out, `${stage}-result.json`), JSON.stringify(summary, null, 2));
  assert(passed, 'Keep all failed runs in artifacts; do not accept this candidate until investigated');
} finally { await browser?.close(); child?.kill(); baselineChild?.kill(); await new Promise(done => api.close(done)); }
