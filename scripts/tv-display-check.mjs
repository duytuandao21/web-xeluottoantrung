import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Production build required. All API data and image bytes below are local fixtures.
const base = 'http://127.0.0.1:3117';
const artifactDir = 'artifacts/tv-display';
const headerOnly = process.argv.includes('--header-only');
const rotationOnly = process.argv.includes('--rotation-only');
const checkPositions = !process.argv.includes('--smoke');
const calls = [];
let failure = false;
let revision = 0;
let inventoryLimit = 128;
let tvConfig = null;
const defaultFixtureConfig = { logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Liên hệ nhận giá tốt',
  carIntervalSeconds: 15, hotlineIntervalSeconds: 5, syncSalesContacts: true, hotlines: [] };
let mixedBrands = false;
const toyotaBrand = { slug: 'toyota', name: 'Toyota', imageUrl: 'https://cdn.toantrungxeluot.io.vn/tv-brands/toyota.png' };
const brandCatalog = [toyotaBrand,
  { slug: 'mercedes-benz', name: 'Mercedes-Benz', imageUrl: 'https://cdn.toantrungxeluot.io.vn/tv-brands/mercedes.png' },
  { slug: 'hyundai', name: 'Hyundai', imageUrl: null }];
const catalogWithEmptyBrands = [
  { slug: 'empty-first', name: 'No active cars first', imageUrl: null }, toyotaBrand,
  { slug: 'empty-middle', name: 'Deposit only', imageUrl: null }, ...brandCatalog.slice(1),
  { slug: 'empty-last', name: 'No active cars last', imageUrl: null },
];
const names = ['Toyota Fortuner 2.4AT', 'Toyota Innova Cross 2.0V', 'Hyundai Santa Fe Dầu Premium',
  'Mercedes-Benz GLB 200 AMG', 'Vinfast VF3 Tiêu chuẩn', 'Ford Everest Titanium Bi-turbo 4x4'];
const cars = Array.from({ length: 128 }, (_, index) => ({
  slug: `tv-car-${index + 1}`, name: `${names[index % names.length]} ${2020 + index % 6}`,
  year: 2020 + index % 6, price: index % 6 === 0 ? 1_190_000_000 : 239_000_000 + index * 1_000_000,
  originalPrice: index % 2 ? null : 1_290_000_000, mileage: index % 5 ? 48000 + index * 10 : null,
  fuel: index % 3 ? 'Xăng' : 'Dầu', status: 'active', coverWidth: 1200, coverHeight: 800,
  cover: `https://cdn.toantrungxeluot.io.vn/tv-test/tv-car-${index + 1}.jpg`,
  brand: toyotaBrand,
}));
const api = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  calls.push(url.pathname + url.search);
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/api/v1/cars') {
    if (failure) { response.statusCode = 503; return response.end('{}'); }
    assert.equal(url.searchParams.get('status'), 'active');
    assert.equal(url.searchParams.get('limit'), '100');
    const page = Number(url.searchParams.get('page'));
    assert.equal(url.searchParams.get('view'), page === 1 ? 'tv' : null);
    const selected = mixedBrands ? cars.slice(0, 16).map((car, i) => ({ ...car, brand: brandCatalog[i < 8 ? 0 : i < 15 ? 1 : 2] })) : cars.slice(0, inventoryLimit);
    const inventory = revision ? selected.slice(1).map(car => ({ ...car, price: 333_000_000 })) : selected;
    const data = inventory.slice((page - 1) * 100, page * 100);
    return response.end(JSON.stringify({ data, meta: { page, limit: 100, total: inventory.length, totalPages: Math.ceil(inventory.length / 100),
      ...(page === 1 ? { tvBrands: mixedBrands ? catalogWithEmptyBrands : [toyotaBrand] } : {}) } }));
  }
  if (url.pathname.endsWith('/thiet-lap-thong-tin')) return response.end(JSON.stringify([{ key: 'phone', value: '0777262607' }, { key: 'siteName', value: headerOnly ? 'OTO TOAN TRUNG | O TO CU TPHCM | O TO CU GIA LAI' : 'Xe Lướt Toàn Trung' }]));
  if (url.pathname.endsWith('/thiet-lap-logo')) return response.end(JSON.stringify([{ key: 'logo', value: '/upload/photo/logo-tt-gold-6981.webp' }]));
  if (url.pathname === '/api/v1/site-settings/tv-display') return response.end(JSON.stringify([{ key: 'config', value: JSON.stringify(tvConfig || defaultFixtureConfig) }]));
  if (url.pathname === '/api/v1/content' && url.searchParams.get('group') === 'thiet-lap-nut-goi') return response.end(JSON.stringify([
    { title: 'Sale HCM', body: '(Tư vấn bán hàng (HCM))', phone: '0777262607', status: 'active' },
    { title: 'Sale Gia Lai', body: '(Tư Vấn Bán Hàng (Gia Lai))', phone: '0777393913', status: 'active' },
    { title: 'Thu mua', body: '(Thu mua và Thẩm định xe)', phone: '0922325679', status: 'active' },
    { title: 'Hidden', body: '(Tư vấn bán hàng)', phone: '0777262609', status: 'inactive' },
  ]));
  if (url.pathname === '/api/v1/about-story' || url.pathname === '/api/v1/seo') { response.statusCode = 404; return response.end('{}'); }
  if (url.pathname.includes('/lookups/') || url.pathname === '/api/v1/services') return response.end(JSON.stringify({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }));
  return response.end('[]');
});
await new Promise((resolve, reject) => { api.once('error', reject); api.listen(4127, '127.0.0.1', resolve); });
await mkdir(artifactDir, { recursive: true });
const output = [];
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3117', '-H', '127.0.0.1'], {
  env: { ...process.env, API_URL: 'http://127.0.0.1:4127' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => output.push(String(chunk)));
server.stderr.on('data', chunk => output.push(String(chunk)));
let browser;
const watchdog = setTimeout(() => { output.push('TV test watchdog: closing owned browser after 5 minutes.'); void browser?.close(); }, 300000);
const summaries = [];
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(`${base}/TV/QR-xeluottoantrung.svg`); break; }
    catch { if (server.exitCode !== null) throw new Error(output.join('')); await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
  const logo = await readFile('public/upload/photo/logo-tt-gold-6981.webp');
  const brandLogo = await readFile('public/thumbs/65x35x2/upload/product/png-clipart-toyota-logo-toyota-symbol-logo-transport-cars-removebg-preview-3661.png');
  const createPage = async (viewport = { width: 1920, height: 1080 }, options = {}) => {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
    await context.route('https://cdn.toantrungxeluot.io.vn/**', route => {
      const url = route.request().url();
      return route.fulfill({ contentType: url.includes('/tv-test/') ? 'image/jpeg' : url.includes('/tv-brands/') ? 'image/png' : 'image/webp',
        body: url.includes('/tv-test/') ? photo : url.includes('/tv-brands/') ? brandLogo : logo });
    });
    // The installed production build keeps the user's API rewrite. Block optional
    // storefront client reads here so a layout check cannot contact that origin.
    await context.route(`${base}/api/v1/**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }) }));
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    return { context, page };
  };
  const pumpUntil = async (page, predicate) => {
    // Network/decode remain real asynchronous work; let them settle between clock
    // advances instead of assuming headers also mean React committed the result.
    for (let attempt = 0; attempt < 24; attempt++) {
      await page.waitForTimeout(100);
      if (await predicate()) return;
      await page.clock.runFor(1000);
    }
    assert.fail('Timed out waiting for a committed TV state');
  };
  const startPositionCheck = page => page.evaluate(() => {
    const selectors = ['.tv-masthead', '.tv-logo', '.tv-heading h1', '.tv-qr', '.tv-hotline', '.tv-stage', '.tv-footer', '.tv-brand-ribbon', '.tv-brand-summaries'];
    const nodes = selectors.map(selector => document.querySelector(selector));
    const geometry = node => { const b = node.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
    const original = nodes.map(geometry);
    const slots = [...document.querySelectorAll('.tv-board--active [data-tv-card]')].map(geometry);
    let frame, samples = 0, maxDelta = 0, maxCardDelta = 0, mutations = 0, transitionFrames = 0, blankFrames = 0, unreadyImages = 0, coveredIncomingFrames = 0;
    const observer = new MutationObserver(records => {
      mutations += records.filter(record => {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        return !node?.closest('.tv-hotline__numbers, .tv-brand-ribbon');
      }).length;
    });
    observer.observe(nodes[0], { attributes: true, childList: true, characterData: true, subtree: true });
    const sample = () => {
      samples++;
      nodes.forEach((node, i) => geometry(node).forEach((value, j) => { maxDelta = Math.max(maxDelta, Math.abs(value - original[i][j])); }));
      let visible = false;
      document.querySelectorAll('.tv-board').forEach(board => {
        const style = getComputedStyle(board);
        if (style.visibility !== 'visible' || Number(style.opacity) <= .01) return;
        visible = true;
        unreadyImages += [...board.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).length;
        if (board.style.opacity) transitionFrames++;
        if (board.style.opacity && Number(style.opacity) < .99) {
          const current = document.querySelector('.tv-board--active');
          if (board !== current && Number(style.zIndex) <= Number(getComputedStyle(current).zIndex)) coveredIncomingFrames++;
        }
        board.querySelectorAll('[data-tv-card]').forEach((card, index) => {
          if (Number(getComputedStyle(card).opacity) <= .01) return;
          geometry(card).forEach((value, j) => { maxCardDelta = Math.max(maxCardDelta, Math.abs(value - slots[index][j])); });
        });
      });
      if (!visible) blankFrames++;
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    window.stopTVPositionCheck = () => {
      cancelAnimationFrame(frame); observer.disconnect();
      return { samples, transitionFrames, maxDelta, maxCardDelta, mutations, blankFrames, unreadyImages, coveredIncomingFrames,
        sameNodes: nodes.every((node, i) => node === document.querySelector(selectors[i])),
        heading: document.querySelector('.tv-heading h1').innerText };
    };
  });
  const finishPositionCheck = async page => {
    const result = await page.evaluate(() => window.stopTVPositionCheck());
    console.log(JSON.stringify({ positionCheck: result }));
    assert.ok(result.samples > 50 && result.transitionFrames > 10, 'sample the animated frames, not only the final state');
    assert.equal(result.maxDelta, 0, 'header, stage and footer remain stationary');
    assert.equal(result.maxCardDelta, 0, 'every visible card stays in the same slot throughout transitions and buffer reuse');
    assert.equal(result.mutations, 0, 'rotation does not modify the header DOM');
    assert.equal(result.blankFrames, 0, 'there is always a visible board during the fade and class handoff');
    assert.equal(result.unreadyImages, 0, 'all visible images have loaded before the board appears');
    assert.equal(result.coveredIncomingFrames, 0, 'the fading board is above the old board in both buffer directions');
    assert.ok(result.sameNodes);
    return result;
  };

  for (const viewport of (rotationOnly ? [] : [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 3840, height: 2160 }, { width: 1080, height: 1920 }])) {
    const { context, page } = await createPage(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (checkPositions) await page.clock.install();
    const before = calls.length;
    assert.equal((await page.goto(`${base}/TV`)).status(), 200);
    if (checkPositions) await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const data = await page.evaluate(() => {
      const active = document.querySelector('.tv-board--active');
      return {
        cards: active.querySelectorAll('[data-tv-card]').length,
        loaded: [...active.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0),
        overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
        extras: document.querySelectorAll('.wap_header, .menu_mobi, .tt-footer, .sale-header-button, .chatbot-launcher').length,
        legacyCSS: document.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]').length,
        clipped: [...active.querySelectorAll('h2, .tv-car__price strong, .tv-car__specs')].filter(node => node.scrollWidth > node.clientWidth + 1).length,
        titleClippedVertically: [...active.querySelectorAll('h2')].filter(node => node.scrollHeight > node.clientHeight + 1).length,
        brands: [...active.querySelectorAll('h2')].map(title => {
          const brand = title.querySelector('.tv-car__brand');
          return { text: brand?.textContent, expected: title.title.trim().split(/\s+/)[0],
            preserved: title.textContent === title.title.trim(),
            ratio: brand ? parseFloat(getComputedStyle(brand).fontSize) / parseFloat(getComputedStyle(title).fontSize) : 0,
            stroke: brand ? parseFloat(getComputedStyle(brand).webkitTextStrokeWidth) : 0 };
        }),
        clipDetails: [...active.querySelectorAll('h2, .tv-car__price strong, .tv-car__specs')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ tag: node.tagName, text: node.textContent, box: [node.clientWidth, node.clientHeight], scroll: [node.scrollWidth, node.scrollHeight] })),
        title: document.title,
      };
    });
    await page.screenshot({ path: `${artifactDir}/${viewport.width}x${viewport.height}.png` });
    console.log(JSON.stringify({ viewport, ...data }));
    assert.equal(data.cards, 6); assert.ok(data.loaded); assert.equal(data.extras, 0);
    assert.equal(data.legacyCSS, 0);
    assert.deepEqual(data.overflow, [0, 0]); assert.equal(data.clipped, 0);
    assert.equal(data.titleClippedVertically, 0);
    assert.ok(data.brands.every(brand => brand.text === brand.expected && brand.preserved && brand.ratio >= 1.17 && brand.stroke > 0), 'only the first word is emphasized, without changing the car name');
    assert.match(await page.locator('.tv-pagination').innerText(), /128/);
    assert.equal(await page.locator('.tv-pagination > strong').count(), 0, 'page numbers are removed');
    assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count'), '128');
    const layout = await page.locator('.tv-screen').evaluate(node => {
      const header = node.querySelector('.tv-masthead').getBoundingClientRect();
      const footer = node.querySelector('.tv-footer').getBoundingClientRect();
      const qrImage = node.querySelector('.tv-masthead .tv-qr img');
      const qr = qrImage.getBoundingClientRect();
      const qrCaption = node.querySelector('.tv-qr > span').getBoundingClientRect();
      const logo = node.querySelector('.tv-brand-summary--active img').getBoundingClientRect();
      const hotline = node.querySelector('.tv-footer .tv-hotline').getBoundingClientRect();
      const hotlineParts = [...node.querySelectorAll('.tv-hotline__icon, .tv-hotline > div > span, .tv-hotline__numbers')].map(item => item.getBoundingClientRect());
      const inside = (box, bounds) => box.top >= bounds.top && box.bottom <= bounds.bottom && box.left >= bounds.left && box.right <= bounds.right;
      const stage = node.querySelector('.tv-stage').getBoundingClientRect();
      return { qrSize: qr.width, logoSize: logo.width, qrInside: inside(qr, header) && inside(qrCaption, header), hotlineInside: inside(hotline, footer),
        headerHeight: header.height,
        qrLoaded: qrImage.complete && qrImage.naturalWidth > 0, stage: [stage.top, stage.bottom],
        hotlineOneLine: hotlineParts.every((box, i) => Math.abs(box.top + box.height / 2 - hotlineParts[0].top - hotlineParts[0].height / 2) < 1 && (!i || box.left >= hotlineParts[i - 1].right)),
        hotlineGaps: hotlineParts.slice(1).map((box, i) => box.left - hotlineParts[i].right),
        labelClipped: [...node.querySelectorAll('.tv-brand-summary--active .tv-brand-summary__count, .tv-hotline > div > span, .tv-hotline__number--active, .tv-qr > span')].some(item => item.scrollWidth > item.clientWidth + 1) };
    });
    assert.ok(layout.qrInside && layout.qrLoaded, 'larger SVG QR is ready and wholly inside the header');
    assert.ok(layout.hotlineInside, 'hotline fits the unchanged footer');
    assert.ok(layout.hotlineOneLine && layout.hotlineGaps.every(gap => gap < viewport.width * .02), 'icon, label and rotating number share one line with compact gaps');
    assert.ok(layout.qrSize >= viewport.height * (viewport.width > viewport.height ? .139 : .099) && layout.logoSize >= viewport.width * .064);
    assert.equal(layout.labelClipped, false);
    const portrait = viewport.height > viewport.width;
    assert.ok(Math.abs(layout.headerHeight - viewport.height * (portrait ? .13 : .15)) < 1, 'larger QR keeps the header height unchanged');
    assert.ok(Math.abs(layout.stage[0] - viewport.height * (portrait ? .14 : .166)) < 1 &&
      Math.abs(layout.stage[1] - viewport.height * (portrait ? .91 : .90)) < 1, 'car region keeps its original bounds');
    assert.equal(await page.locator('.tv-masthead .tv-hotline, .tv-footer .tv-qr, .tv-website').count(), 0);
    assert.equal(await page.locator('.tv-qr').count(), 1);
    assert.doesNotMatch(await page.locator('.tv-screen').innerText(), /Xem thêm xe tại|xeluottoantrung\.com/);
    assert.match(await page.locator('.tv-hotline').innerText(), /0777262607/);
    assert.equal(calls.slice(before).filter(path => path.startsWith('/api/v1/cars?')).length, 2);
    assert.equal(calls.slice(before).length, 7, 'two inventory reads, four shared settings reads and one existing sales contact list');
    assert.ok(calls.slice(before).every(path => path.startsWith('/api/v1/cars?') || path.startsWith('/api/v1/site-settings/') || path.startsWith('/api/v1/content?group=thiet-lap-nut-goi')));
    assert.equal((await page.locator('meta[name="robots"]').getAttribute('content')), 'noindex, nofollow');
    assert.equal(await page.locator('link[rel="icon"]').count(), 1);
    assert.equal(await page.locator('.tv-heading p').count(), 0);
    await page.screenshot({ path: `${artifactDir}/${viewport.width}x${viewport.height}.png` });
    summaries.push({ viewport, ...data, layout, errors }); assert.deepEqual(errors, []);
    if (checkPositions) {
      const reads = calls.length;
      await startPositionCheck(page);
      for (const slug of ['tv-car-7', 'tv-car-13', 'tv-car-19', 'tv-car-25']) {
        await page.clock.fastForward(14000);
        await page.clock.runFor(2500);
        await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="${slug}"]`).count() === 1);
      }
      const header = await finishPositionCheck(page);
      assert.equal(header.heading, 'BẢNG GIÁ XE ĐANG BÁN');
      assert.equal(calls.length, reads);
      summaries.push({ viewport, stableHeader: header });
      console.log(JSON.stringify({ viewport, stableHeader: header }));
    }
    await context.close();
  }

  if (!process.argv.includes('--smoke') && !headerOnly) {
  // Brand boundary, partial pages, next-logo readiness, and repeated buffers.
  {
    mixedBrands = true;
    const { context, page } = await createPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route(/tv-brands\/mercedes\.png/, async route => {
      await gate; await route.fulfill({ contentType: 'image/webp', body: logo }).catch(() => {});
    });
    await page.clock.install();
    const readsBefore = calls.length;
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(calls.length - readsBefore, 6, 'one inventory request plus existing settings/contacts; no brand request');
    const reads = calls.length;
    await startPositionCheck(page);
    const check = async (brand, slugs) => {
      await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="tv-car-${slugs[0]}"]`).count() === 1);
      assert.equal(await page.locator('.tv-brand--active').getAttribute('data-brand-slug'), brand);
      assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-slug'), brand);
      assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count'), String(brand === 'toyota' ? 8 : brand === 'mercedes-benz' ? 7 : 1));
      assert.match(await page.locator('.tv-brand-summary--active').innerText(), /^\d+ xe đang bán$/);
      assert.ok(await page.locator('.tv-brand-summary--active img').evaluateAll(images => images.every(image => image.dataset.tvFailed === 'true' || image.complete && image.naturalWidth > 0)));
      if (await page.locator('.tv-brand-summary--active img').count())
        assert.equal(await page.locator('.tv-brand-summary--active img').evaluate(image => image.currentSrc),
          await page.locator('.tv-brand--active img').evaluate(image => image.currentSrc), 'reuse the same logo candidate');
      assert.deepEqual(await page.locator('.tv-board--active [data-car-slug]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.carSlug.split('-').at(-1)))), slugs);
      assert.ok(await page.locator('.tv-brand--active img').evaluateAll(images => images.every(image => image.dataset.tvFailed === 'true' || image.complete && image.naturalWidth > 0)));
      assert.equal(await page.locator('.tv-brand--active strong').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
      assert.doesNotMatch(await page.locator('.tv-brand--active').innerText(), /Hãng/i);
      assert.equal(calls.length, reads);
    };
    await check('toyota', [1, 2, 3, 4, 5, 6]);
    await page.clock.runFor(16500); await check('toyota', [7, 8]);
    // Next brand's cars are ready, but its logo is still held. Keep current pair.
    await page.clock.runFor(16500);
    assert.equal(await page.locator('.tv-brand--active').getAttribute('data-brand-slug'), 'toyota');
    assert.equal(await page.locator('.tv-board--active [data-tv-card]').count(), 2);
    release(); await check('mercedes-benz', [9, 10, 11, 12, 13, 14]);
    await page.clock.runFor(16500); await check('mercedes-benz', [15]);
    await page.clock.runFor(16500); await check('hyundai', [16]);
    await page.screenshot({ path: `${artifactDir}/brand-partial.png` });
    await page.clock.runFor(16500); await check('toyota', [1, 2, 3, 4, 5, 6]);
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [brand, slugs] of [['toyota', [7, 8]], ['mercedes-benz', [9, 10, 11, 12, 13, 14]],
        ['mercedes-benz', [15]], ['hyundai', [16]], ['toyota', [1, 2, 3, 4, 5, 6]]]) {
        await page.clock.runFor(16500); await check(brand, slugs);
      }
    }
    assert.equal(await page.locator('.tv-brand-measure').count(), 3, 'empty brands do not enter the header or rotation');
    assert.equal(await page.locator('.tv-pagination > strong').count(), 0);
    const stable = await finishPositionCheck(page);
    assert.deepEqual(errors, []);
    summaries.push({ brandCycle: 'PASS', completeCycles: 3, skipsEmptyBrands: 'PASS', pages: [6, 2, 6, 1, 1], slowBrandLogoHoldsPreviousPage: 'PASS', noBrandRotationRequests: true, stable });
    // Exercise new server props without remounting the TV client component.
    // Next's installed publicAppRouterInstance is exposed here for diagnostics.
    const beforeServerRefresh = calls.length;
    const beforeRefreshToken = await page.locator('.tv-board--active').getAttribute('data-token');
    const serverRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/TV' &&
      response.request().headers()['rsc'] === '1' && response.status() === 200);
    await page.evaluate(() => window.next.router.refresh());
    // A Flight stream may stay open after React commits the new server props.
    // Wait for the matching active buffer rather than response.finished().
    await serverRefresh;
    await pumpUntil(page, async () => await page.locator('.tv-board--active').getAttribute('data-token') !== beforeRefreshToken &&
      await page.locator('.tv-stage').getAttribute('data-ready') === 'true' &&
      await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count() === 1);
    await page.clock.runFor(16500);
    await pumpUntil(page, async () => await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').count() === 1);
    assert.equal(calls.length - beforeServerRefresh, 6, 'only the requested server refresh reads');
    assert.deepEqual(errors, []);
    summaries.push({ newServerPropsDoNotFreezeRotation: 'PASS' });
    await context.close();
    // Broken transform + original logo hides only the optional logo.
    const broken = await createPage();
    await broken.context.route(/tv-brands\/toyota\.png/, route => route.fulfill({ status: 404, body: '' }));
    await broken.page.goto(`${base}/TV`);
    await broken.page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(await broken.page.locator('.tv-brand--active img[data-tv-failed="true"]').count(), 1);
    assert.equal(await broken.page.locator('.tv-brand--active strong').innerText(), 'TOYOTA');
    summaries.push({ optionalBrandLogoFailure: 'PASS' });
    await broken.context.close(); mixedBrands = false;
  }
  // A long carousel crosses the five-minute refresh without restarting at page 0.
  {
    mixedBrands = true;
    tvConfig = { logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Hotline',
      carIntervalSeconds: 300, hotlineIntervalSeconds: 120, syncSalesContacts: true, hotlines: [] };
    const { context, page } = await createPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const expected of [7, 9, 15, 16, 1]) {
        const reads = calls.length;
        const refreshed = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 200);
        await page.clock.fastForward(300100);
        await (await refreshed).json();
        await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="tv-car-${expected}"]`).count() === 1);
        assert.equal(calls.length - reads, 6, 'only the existing five-minute refresh reads');
        const showing = await page.locator('.tv-brand--active').getAttribute('data-brand-slug');
        assert.equal(showing, expected <= 8 ? 'toyota' : expected <= 15 ? 'mercedes-benz' : 'hyundai');
        assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-slug'), showing);
      }
    }
    assert.deepEqual(errors, []);
    summaries.push({ cyclesAcrossRefresh: 'PASS', completeCycles: 2, refreshes: 10, skipsEmptyBrands: 'PASS' });
    await context.close(); mixedBrands = false; tvConfig = null;
  }
  if (!rotationOnly) {
  // Separate clocks: phones change every 5s without moving cars or fetching data.
  {
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const reads = calls.length;
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777262607');
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777393913');
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777262607');
    assert.equal(calls.length, reads);
    summaries.push({ independentFiveSecondHotlines: 'PASS', salesOnly: 'PASS', noPhoneRotationAPIReads: true });
    await context.close();
  }
  // Custom header/list and both custom intervals use the saved config.
  {
    tvConfig = { logoUrl: '/upload/photo/logo-tt-gold-6981.webp', title: 'Xe đang bán tại showroom', hotlineTitle: 'Liên hệ bán hàng',
      carIntervalSeconds: 8, hotlineIntervalSeconds: 3, syncSalesContacts: false,
      hotlines: [{ name: 'A', phone: '0901234567' }, { name: 'B', phone: '+84901234568' }] };
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.match(await page.locator('.tv-heading').innerText(), /XE ĐANG BÁN TẠI SHOWROOM/);
    assert.match(await page.locator('.tv-hotline').innerText(), /Liên hệ bán hàng/);
    const reads = calls.length;
    await page.clock.runFor(3000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '+84901234568');
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    await page.clock.runFor(5000);
    await pumpUntil(page, async () => await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').count() === 1);
    assert.equal(calls.length, reads);
    summaries.push({ customTVConfigurationAndIntervals: 'PASS' });
    await context.close(); tvConfig = null;
  }
  {
    tvConfig = { logoUrl: '', title: 'W'.repeat(60), hotlineTitle: 'W'.repeat(24), carIntervalSeconds: 15,
      hotlineIntervalSeconds: 5, syncSalesContacts: false, hotlines: [{ name: 'Long number', phone: '+841234567890' }] };
    const { context, page } = await createPage({ width: 1366, height: 768 });
    await page.goto(`${base}/TV`); await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await page.waitForTimeout(150);
    const clipped = await page.locator('.tv-heading h1, .tv-hotline > div > span, .tv-hotline__number--active').evaluateAll(nodes =>
      nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
    assert.deepEqual(clipped, [], 'long configured titles and international phones fit their fixed header/footer regions');
    summaries.push({ longConfiguredHeaderFits: 'PASS' });
    await context.close(); tvConfig = null;
  }
  // Real 15-second interval; a deliberately slow next image holds the first page.
  {
    const { context, page } = await createPage();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route(/tv-car-7\.jpg/, async route => { await gate; await route.fulfill({ contentType: 'image/jpeg', body: photo }).catch(() => {}); });
    await page.goto(`${base}/TV`);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const reads = calls.length;
    await page.waitForTimeout(16000);
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    release();
    await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').waitFor();
    assert.ok(await page.locator('.tv-board--active img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
    assert.equal(calls.length, reads, 'no API reads during page rotation');
    summaries.push({ slowNextImage: 'PASS', noRotationAPIReads: true });
    await context.close();
  }

  }
  // Accelerated five-minute wall clock, while requests and GSAP still run normally.
  {
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`);
    await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await context.route(/missing-logo\.jpg/, route => route.fulfill({ status: 404, body: '' }));
    tvConfig = { logoUrl: 'https://cdn.toantrungxeluot.io.vn/tv-test/missing-logo.jpg', title: 'Cập nhật TV', hotlineTitle: 'Hotline mới',
      carIntervalSeconds: 15, hotlineIntervalSeconds: 2, syncSalesContacts: false, hotlines: [{ name: 'New', phone: '0901111222' }] };
    revision = 1;
    const refreshed = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 200);
    await page.clock.fastForward(300100);
    assert.equal((await (await refreshed).json()).cars.length, 127);
    // During the crossfade, the incoming footer text is visible before the
    // active-class handoff. Wait for the committed summary, not that text.
    await pumpUntil(page, async () => await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count') === '127');
    assert.match(await page.locator('.tv-pagination').innerText(), /127/);
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 0);
    assert.match(await page.locator('.tv-board--active .tv-car__price').first().innerText(), /333/);
    await pumpUntil(page, async () => await page.locator('.tv-heading h1').innerText() === 'CẬP NHẬT TV');
    await pumpUntil(page, async () => (await page.locator('.tv-logo').getAttribute('src')).includes('logo-tt-gold-6981.webp'));
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0901111222');
    failure = true;
    const unavailable = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 503);
    await page.clock.fastForward(300100);
    await unavailable;
    await pumpUntil(page, () => page.locator('.tv-pagination small').isVisible());
    assert.equal(await page.locator('.tv-board--active [data-tv-card]').count(), 6);
    assert.ok(await page.locator('.tv-pagination small').isVisible());
    summaries.push({ refresh: 'PASS', updatedTVConfigurationAndLogoFallback: 'PASS', failureKeepsLastGoodData: 'PASS' });
    failure = false; revision = 0; tvConfig = null;
    await context.close();
  }

  if (!rotationOnly) {
  // Reuse both animation buffers, reach the partial last page, then wrap cleanly.
  {
    inventoryLimit = 13;
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`);
    await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await startPositionCheck(page);
    const seen = new Set();
    for (const expected of ['tv-car-1', 'tv-car-7', 'tv-car-13', 'tv-car-1']) {
      await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="${expected}"]`).count() === 1);
      for (const slug of await page.locator('.tv-board--active [data-car-slug]').evaluateAll(nodes => nodes.map(node => node.dataset.carSlug))) seen.add(slug);
      await page.waitForTimeout(100);
      await page.clock.runFor(16500);
    }
    assert.equal(seen.size, 13);
    summaries.push({ completeCycleIncludingPartialLastPage: 'PASS', stableSlots: await finishPositionCheck(page) });
    await context.close();
    inventoryLimit = 0;
    const empty = await createPage();
    await empty.page.goto(`${base}/TV`);
    await empty.page.locator('.tv-empty').waitFor();
    assert.match(await empty.page.locator('.tv-pagination').innerText(), /0 xe/);
    assert.equal(await empty.page.locator('.tv-board--active [data-tv-card]').count(), 0);
    summaries.push({ emptyInventory: 'PASS' });
    await empty.context.close();
    inventoryLimit = 128;
  }

  {
    const { context, page } = await createPage(undefined, { reducedMotion: 'reduce' });
    await context.route(/tv-car-2\.jpg/, route => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${base}/TV`);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(await page.locator('.tv-board--active img[data-tv-failed="true"]').count(), 1);
    await page.waitForTimeout(15500);
    await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').waitFor();
    summaries.push({ missingImage: 'PASS', reducedMotionRotation: 'PASS' });
    await page.goto(`${base}/ve-chung-toi`);
    await page.locator('.wap_header').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.tv-screen').count(), 0);
    assert.equal(await page.locator('link[rel="stylesheet"][href="/assets/css/style.css"]').count(), 1);
    summaries.push({ normalWebsiteLayout: 'PASS' });
    await context.close();
  }
  }
  }
  await writeFile(`${artifactDir}/${rotationOnly ? 'rotation-results' : headerOnly ? 'header-results' : process.argv.includes('--smoke') ? 'smoke-results' : 'results'}.json`, JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.kill();
  if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  await new Promise(resolve => api.close(resolve));
  await writeFile(`${artifactDir}/server.log`, output.join(''));
}
