// Production-only, isolated public API fixture. No real API/Admin/DB requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { load } from 'cheerio';

const stage = process.argv[2];
assert(['before', 'after', 'control'].includes(stage));
const out = resolve('../docs/artifacts/font-optimization-2026-10-17');
await mkdir(out, { recursive: true });
if (stage === 'before') assert(!existsSync(resolve(out, 'before-visual.json')), 'Keep the existing pre-patch golden; do not overwrite it on the candidate build');
const picture = '/images/ban-xe-banner.png';
const cars = [0, 1, 2, 3, 4, 5].map(i => ({ slug: `font-car-${i}`, name: `Xe Lướt Toàn Trung — Toyota Vios ${2025 - i}`,
  year: 2025 - i, price: 433000000, originalPrice: 450000000, mileage: 20000, status: 'active', newArrival: false,
  fuel: 'Xăng', transmission: 'Số tự động', seatCount: 5, cover: picture, brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' } }));
const paged = data => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const requests = [];
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  requests.push(url.pathname + url.search);
  let data = paged([]);
  if (url.pathname.endsWith('/cars')) data = paged(cars);
  else if (url.pathname.endsWith('/brands')) data = [{ id: 'toyota', name: 'Toyota', slug: 'toyota', imageUrl: picture, stockCount: 6 }];
  else if (url.pathname.endsWith('/slides')) data = paged([{ id: 'hero', title: 'Khám phá xe mới về', imageUrl: '/images/xe-moi-ve-banner.png', link: '/san-pham' }]);
  else if (url.pathname.endsWith('/content')) data = [{ id: url.searchParams.get('group'), key: 'chinh-sach-quyen-rieng-tu',
    title: 'Tư vấn minh bạch, tận tâm — Ưu đãi & bảo hành', body: '<p>Đầy đủ tiếng Việt: Ắ Ằ Ẳ Ẵ Ặ Ấ Ầ Ẩ Ẫ Ậ — Giá 433 triệu ₫.</p>', imageUrl: picture, link: '/san-pham', sortOrder: 0 }];
  else if (url.pathname.includes('/site-settings/')) data = url.pathname.endsWith('thiet-lap-thong-tin')
    ? [{ key: 'site_name', value: 'Xe Lướt Toàn Trung' }]
    : [{ key: 'logo', value: picture }];
  else if (url.pathname.endsWith('/seo')) data = { metaTitle: 'Xe Lướt Toàn Trung — Kiểm thử font', metaDescription: 'Giữ nguyên nội dung và metadata.', robotsIndex: true, robotsFollow: true };
  else if (url.pathname.endsWith('/testimonials')) data = paged([{ id: 'customer', name: 'Khách hàng kiểm thử', content: 'Thủ tục rõ ràng, dễ dàng lựa chọn.', rating: 5 }]);
  else if (url.pathname.endsWith('/articles')) data = paged([{ slug: 'font-news', title: 'Kinh nghiệm mua xe: an tâm và tiết kiệm', excerpt: 'Tính toán chi phí, ưu đãi hợp lý.', status: 'published', imageUrl: picture }]);
  else if (url.pathname.endsWith('/accessories')) data = paged([{ id: 'accessory', name: 'Cảm biến áp suất lốp', brand: 'ICAR', price: 2800000, imageUrl: picture, imageUrls: [] }]);
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));
let child, browser;
const stable = html => {
  const $ = load(html);
  $('script:not([type="application/ld+json"]),link[as="script"]').remove();
  const metadata = $('title,meta,link[rel="canonical"],link[rel="icon"]').toArray().map(e => $.html(e)).sort();
  $('title,meta,link[rel="canonical"],link[rel="icon"]').remove();
  $('template[id^="B:"]').remove();
  $('[hidden][id^="S:"]').each((_, e) => { if (!$(e).children().length && !$(e).text()) $(e).remove(); });
  return JSON.stringify({ metadata, html: $.html().replace(/<!--(?:\$\??|\/\$|\$!| )-->/g, '') });
};
try {
  await listen(api);
  const reservation = createServer(); await listen(reservation);
  const port = reservation.address().port; await new Promise(done => reservation.close(done));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`, PERF_DIAGNOSTICS: 'false', HOME_CMS_COMPOSITION: 'false' },
  });
  for (let i = 0; ; i++) {
    try { const r = await fetch(base); await r.text(); if (r.ok) break; } catch {}
    if (i > 180 || child.exitCode !== null) throw Error('Next production fixture startup failed');
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let fontResponses = [];
    page.on('response', response => {
      if (response.request().resourceType() === 'font' && response.url().includes('/SF-Pro-Display-'))
        fontResponses.push({ path: new URL(response.url()).pathname, status: response.status(), cache: response.headers()['cache-control'] });
    });
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET') return route.abort();
      if (stage === 'control' && url.pathname === '/assets/css/style.css')
        return readFile(resolve(out, 'style.before.css')).then(body => route.fulfill({ contentType: 'text/css', body }));
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: null });
      if (url.hostname !== '127.0.0.1') return request.resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#eee"/></svg>' }) : route.abort();
      return route.continue();
    });
    for (const [index, path] of ['/', '/san-pham', '/ban-xe'].entries()) {
      const start = requests.length;
      fontResponses = [];
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      // Golden screenshots cover the settled whole page, including offscreen
      // lazy images. Request those test images before awaiting decode().
      await page.evaluate(async () => {
        await document.fonts.ready;
        [...document.images].forEach(i => { i.loading = 'eager'; });
        await Promise.race([Promise.all([...document.images].map(i => i.decode().catch(() => {}))), new Promise(done => setTimeout(done, 5000))]);
      });
      const name = `${viewport.width}-${index}`;
      const html = stable(await response.text());
      const dom = await page.evaluate(() => ({ text: document.body.innerText,
        boxes: [...document.querySelectorAll('h1,h2,.menu>ul>li>a,.car-card-price,.slider_slick,.tt-home-service-step')].map(e => {
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          return { text: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height, family: s.fontFamily, weight: s.fontWeight, size: s.fontSize, lineHeight: s.lineHeight };
        }) }));
      const shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await writeFile(resolve(out, `${stage}-${name}.png`), shot);
      let pixels;
      if (stage === 'before') {
        await writeFile(resolve(out, `before-${name}.html.json`), html);
        await writeFile(resolve(out, `before-${name}.dom.json`), JSON.stringify(dom));
      } else {
        assert.equal(fontResponses.length, 2, `${name}: exactly two SF font files`);
        for (const font of fontResponses) {
          assert.equal(font.path.includes('-UnicodeText.'), stage === 'after', `${name}: expected original/subset font`);
          assert.equal(font.status, 200);
          assert.match(font.cache, /max-age=31536000.*immutable/, `${name}: production cache header`);
        }
        assert.equal(html, await readFile(resolve(out, `before-${name}.html.json`), 'utf8'), `${name}: SSR HTML/SEO/image hints`);
        assert.deepEqual(dom, JSON.parse(await readFile(resolve(out, `before-${name}.dom.json`), 'utf8')), `${name}: text/layout/font styles`);
        const previous = await readFile(resolve(out, `before-${name}.png`));
        pixels = await page.evaluate(async ({ a, b }) => {
          const images = await Promise.all([a, b].map(async x => createImageBitmap(await (await fetch('data:image/png;base64,' + x)).blob())));
          if (images[0].width !== images[1].width || images[0].height !== images[1].height) return { dimensionsDiffer: true };
          const cvs = document.createElement('canvas'); cvs.width = images[0].width; cvs.height = images[0].height;
          const ctx = cvs.getContext('2d', { willReadFrequently: true });
          const arrays = images.map(img => { ctx.clearRect(0, 0, cvs.width, cvs.height); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, cvs.width, cvs.height).data; });
          let changedPixels = 0, maxChannelDelta = 0;
          for (let i = 0; i < arrays[0].length; i += 4) {
            let delta = 0;
            for (let j = 0; j < 4; j++) delta = Math.max(delta, Math.abs(arrays[0][i + j] - arrays[1][i + j]));
            if (delta) changedPixels++;
            maxChannelDelta = Math.max(maxChannelDelta, delta);
          }
          return { changedPixels, maxChannelDelta, width: cvs.width, height: cvs.height };
        }, { a: previous.toString('base64'), b: shot.toString('base64') });
        assert.equal(pixels.dimensionsDiffer, undefined, `${name}: screenshot size`);
        // Windows/Chrome gradient dithering varies by 1-3 channel levels even
        // with the original fonts. Require an A/A control before accepting that
        // noise; native glyph raster tests remain strictly zero-difference.
        if (stage === 'control') assert(pixels.maxChannelDelta <= 3, `${name}: original-font control changed materially: ${JSON.stringify(pixels)}`);
        else if (pixels.changedPixels) {
          const controls = JSON.parse(await readFile(resolve(out, 'control-visual.json'), 'utf8')).results;
          assert(controls.some(r => r.pixels.changedPixels > 0) && controls.every(r => r.pixels.maxChannelDelta <= 3) && pixels.maxChannelDelta <= 3,
            `${name}: difference exceeds confirmed A/A dithering: ${JSON.stringify(pixels)}`);
        }
      }
      results.push({ viewport, path, apiGets: requests.length - start, fontResponses, pixels, screenshotSha256: createHash('sha256').update(shot).digest('hex'), ssrSha256: createHash('sha256').update(html).digest('hex') });
      console.log(`PASS ${stage} ${name}: ${path}`);
    }
    assert.deepEqual(errors, [], 'No page/hydration errors');
    await context.close();
  }
  await writeFile(resolve(out, `${stage}-visual.json`), JSON.stringify({ stage, build: (await readFile('.next/BUILD_ID', 'utf8')).trim(), results, passed: true }, null, 2));
} finally { await browser?.close(); child?.kill(); await new Promise(done => api.close(done)); }
