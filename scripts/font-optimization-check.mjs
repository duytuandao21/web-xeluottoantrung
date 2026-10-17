// Native-browser font proof + cold font bytes, with a loopback-only static host.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { chromium } from 'playwright';

const out = resolve('../docs/artifacts/font-optimization-2026-10-17');
await mkdir(out, { recursive: true });
const subsets = JSON.parse(await readFile(resolve(out, 'generation-verification.json'), 'utf8'));
const manifest = JSON.parse(await readFile('config/versioned-fonts.json', 'utf8'));
const fontPaths = new Set(manifest.map(r => r.src));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  if (fontPaths.has(url.pathname)) {
    res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public,max-age=31536000,immutable' });
    res.end(await readFile(resolve('public/assets/fonts', basename(url.pathname))));
  } else if (url.pathname === '/assets/css/style.css') {
    const path = url.searchParams.get('stage') === 'before' ? resolve(out, 'style.before.css') : 'public/assets/css/style.css';
    res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(await readFile(path));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/css/style.css?stage=${url.searchParams.get('stage') || 'after'}"></head><body><h1>Xe Lướt Toàn Trung — Định giá ô tô</h1><p>Khám phá ưu đãi: 433.000.000 ₫; 20.000 km. Ắ Ằ Ẳ Ẵ Ặ Ấ Ầ Ẩ Ẫ Ậ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ớ Ờ Ở Ỡ Ợ Ứ Ừ Ử Ữ Ự.</p></body></html>`);
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const network = [];
  // Fresh contexts: no previously loaded full font may mask a subset failure.
  for (const mode of ['before', 'after', 'after-extended', 'after-missing-subset']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await context.newPage(), fonts = [];
    page.on('response', response => { if (response.request().resourceType() === 'font') fonts.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    if (mode === 'after-missing-subset') await page.route('**/*UnicodeText*.woff2', r => r.fulfill({ status: 404, body: '' }));
    await page.goto(base + '/?stage=' + (mode === 'before' ? 'before' : 'after'));
    if (mode === 'after-extended') await page.evaluate(points => {
      const p = document.createElement('p'); p.textContent = String.fromCodePoint(points[0]);
      const h = document.createElement('h2'); h.textContent = String.fromCodePoint(points.at(-1));
      document.body.append(p, h);
    }, subsets[0].extendedCodepoints);
    await page.evaluate(async () => { await document.fonts.ready; });
    const successful = fonts.filter(f => f.status === 200);
    const actual = successful.map(f => f.path).sort();
    const expected = mode === 'before' || mode === 'after-missing-subset' ? subsets.map(s => s.originalWoff2)
      : mode === 'after-extended' ? subsets.flatMap(s => [s.src, s.originalWoff2]) : subsets.map(s => s.src);
    assert.deepEqual(actual, expected.sort(), `${mode}: correct actual font files, not system fallback`);
    const timing = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(r => r.name.includes('/SF-Pro-Display-') && r.encodedBodySize > 0)
      .map(r => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize })));
    for (const font of successful) assert.equal(timing.find(t => t.path === font.path)?.bytes, manifest.find(r => r.src === font.path).afterBytes);
    const bytes = successful.reduce((n, f) => n + timing.find(t => t.path === f.path).bytes, 0);
    network.push({ mode, fonts, timing, bytes });
    console.log(`PASS ${mode}: ${successful.length} fonts / ${bytes} bytes`);
    await context.close();
  }
  const page = await browser.newPage(); await page.goto(base);
  const proof = await page.evaluate(async subsets => {
    const results = [];
    const texts = [
      'Xe Lướt Toàn Trung — Khám phá xe nổi bật, thủ tục rõ ràng',
      'ă â ê ô ơ ư đ Á Ắ Ằ Ẳ Ẵ Ặ Ấ Ầ Ẩ Ẫ Ậ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ớ Ờ Ở Ỡ Ợ Ứ Ừ Ử Ữ Ự ỵ ỹ',
      'ắ ằ ẳ ẵ ặ ấ ầ ẩ ẫ ậ ế ề ể ễ ệ ố ồ ổỗ ộ ớ ờ ở ỡ ợ ứ ừ ử ữ ự',
      '433.000.000 ₫ · € £ ¥ $ © ® ™ № ± × ÷ ≤ ≥ → ← ✓ ★ % & @ #',
      'AVATAR To Wa fi ffi ff fl office 0123456789 1/2 3/4',
      'Ελληνικά Αθήνα — Русский язык Україна — français œ æ ß',
      'Nội dung Admin mới: Ăn ở, số chỗ, phụ kiện, ưu đãi 2026',
    ];
    texts.push(texts[1].normalize('NFD'), texts[2].normalize('NFD'));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const [index, font] of subsets.entries()) {
      const baseline = `Before${index}`, candidate = `After${index}`;
      const full = new FontFace(baseline, `url(${font.originalWoff2})`);
      const text = new FontFace(candidate, `url(${font.src})`, { unicodeRange: 'U+0-FFFFF' });
      const extended = new FontFace(candidate, `url(${font.originalWoff2})`, { unicodeRange: 'U+100000-10FFFF' });
      await Promise.all([full.load(), text.load(), extended.load()]);
      [full, text, extended].forEach(f => document.fonts.add(f));
      let count = 0;
      const compare = (value, size, weight, dpr, caps = 'normal') => {
        canvas.width = (value.length > 2 ? 1800 : 256) * dpr; canvas.height = 96 * dpr;
        const draw = family => {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
          ctx.font = `${weight} ${size}px ${family}`; ctx.fontKerning = 'normal'; ctx.fontVariantCaps = caps; ctx.fillStyle = '#14213a';
          ctx.fillText(value, 12, 60);
          const m = ctx.measureText(value);
          return { metrics: [m.width, m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent,
            m.fontBoundingBoxAscent, m.fontBoundingBoxDescent], pixels: new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer) };
        };
        const a = draw(baseline), b = draw(candidate);
        if (a.metrics.some((v, i) => v !== b.metrics[i])) throw Error(`Metrics differ ${font.family}: ${JSON.stringify(value)}/${size}/${weight}/${dpr}/${caps}`);
        for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) throw Error(`Pixels differ ${font.family}: ${JSON.stringify(value)}/${size}/${weight}/${dpr}/${caps}`);
        count++;
      };
      for (const cp of font.textCodepoints) compare(String.fromCodePoint(cp), 19, 400, 1);
      for (const size of [15, 19, 28, 38]) for (const weight of [400, 700]) for (const dpr of [1, 3]) for (const value of texts) compare(value, size, weight, dpr);
      for (const caps of ['small-caps', 'all-small-caps', 'unicase', 'titling-caps']) for (const value of texts.slice(0, 5)) compare(value, 28, 400, 1, caps);
      for (const cp of font.extendedCodepoints.filter((_, i) => i % 90 === 0)) {
        compare(String.fromCodePoint(cp), 28, 400, 1);
        compare('Toàn ' + String.fromCodePoint(cp) + ' Trung', 19, 400, 3);
      }
      results.push({ family: font.family, samples: count, textCodepoints: font.textCodepoints.length, changedPixels: 0, metricsEqual: true });
      [full, text, extended].forEach(f => document.fonts.delete(f));
    }
    return results;
  }, subsets);
  console.log('PASS browser raster/metrics: ' + JSON.stringify(proof));
  const domProof = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async subsets => {
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0;padding:20px;background:white;color:#14213a';
      for (const font of subsets) {
        const before = new FontFace('Original-' + font.family, `url(${font.originalWoff2})`);
        await before.load(); document.fonts.add(before);
        for (const size of [15, 16, 19, 24, 30, 38]) for (const weight of [400, 700]) {
          const row = document.createElement('div'); row.dataset.font = font.family;
          row.textContent = 'Xe Lướt Toàn Trung: Ắ Ằ Ẩ Ẫ Ậ Ễ Ệ Ớ Ờ Ử Ữ Ự — 433 triệu ₫. AVATAR fi 1/2';
          row.style.cssText = `font-family:Original-${font.family};font-size:${size}px;font-weight:${weight};line-height:1.5;margin:8px 0;`;
          if (size === 24) row.style.fontFeatureSettings = '"kern" 1, "tnum" 1, "frac" 1, "ss01" 1';
          if (size === 30) row.style.fontVariantCaps = 'all-small-caps';
          document.body.append(row);
        }
      }
      await document.fonts.ready;
    }, subsets);
    const before = await page.screenshot({ fullPage: true });
    const boxes = await page.locator('[data-font]').evaluateAll(rows => rows.map(r => { const b = r.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
    await page.evaluate(async () => {
      for (const row of document.querySelectorAll('[data-font]')) row.style.fontFamily = row.dataset.font;
      await document.fonts.ready;
    });
    const after = await page.screenshot({ fullPage: true });
    assert.deepEqual(await page.locator('[data-font]').evaluateAll(rows => rows.map(r => { const b = r.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })), boxes);
    // Solid-background native DOM text, not only canvas: strict raster equality.
    assert(before.equals(after), `${width}px: native DOM text raster differs`);
    await writeFile(resolve(out, `text-before-${width}.png`), before);
    await writeFile(resolve(out, `text-after-${width}.png`), after);
    domProof.push({ width, rows: 24, changedPixels: 0, sameBoxes: true });
  }
  console.log('PASS native DOM text screenshots: ' + JSON.stringify(domProof));
  await writeFile(resolve(out, 'font-proof.json'), JSON.stringify({ passed: true, chrome: browser.version(), network, proof, domProof }, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
