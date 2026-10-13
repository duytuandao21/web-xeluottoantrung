// Real production UI against an isolated, read-only catalog fixture.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const cars = Array.from({ length: 13 }, (_, index) => ({
  slug: `filter-fixture-${index}`, name: `Toyota Vios ${index + 1}`, year: 2025, price: 220000000,
  mileage: 20000, status: 'active', fuel: 'Xăng', transmission: 'Số tự động', bodyType: 'Sedan', seatCount: 5,
  brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' }, cover: null,
}));
const lookup = (name, slug) => ({ id: slug, name, slug });
const result = (data, page = 1, limit = 100) => ({
  data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total: data.length, totalPages: Math.ceil(data.length / limit) },
});
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.test'), query = url.searchParams, path = url.pathname;
  let data = result([]), status = 200;
  if (path === '/api/v1/cars') data = result(query.has('price_min') || query.has('price_max') ? cars.slice(0, 7) : cars,
    Number(query.get('page') || 1), Number(query.get('limit') || 6));
  else if (path === '/api/v1/brands') data = [lookup('Toyota', 'toyota')];
  else if (path.endsWith('/body-styles')) data = result([lookup('Sedan', 'sedan'), lookup('SUV', 'suv')]);
  else if (path.endsWith('/transmissions')) data = result([lookup('Số tự động', 'tu-dong')]);
  else if (path.endsWith('/car-colors')) data = result([lookup('Trắng', 'trang')]);
  else if (path.endsWith('/branches')) data = result([lookup('Toàn Trung', 'toan-trung')]);
  else if (path.endsWith('/filter-options')) data = result(query.get('group') === 'budget'
    ? [{ ...lookup('100 - 300 triệu', '100-300'), group: 'budget', minValue: 100, maxValue: 300 }]
    : [{ ...lookup('Dưới 50.000 km', 'duoi-50000'), group: 'mileage', minValue: 0, maxValue: 50000 }]);
  else if (path === '/api/v1/content') data = query.get('group') === 'thiet-lap-goi-y-nam-san-xuat' ? [{ title: '2025' }] : [];
  else if (path.startsWith('/api/v1/site-settings/') || /\/brands\/[^/]+\/models$/.test(path)) data = [];
  else if (path === '/api/v1/seo' || /^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)) { status = 404; data = { message: 'No fixture record' }; }
  response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data));
});
let child, browser;
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  await listen(api);
  const portReservation = createServer(); await listen(portReservation);
  const port = portReservation.address().port;
  await new Promise(resolve => portReservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', String(port)], {
    cwd: process.cwd(), env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}` }, windowsHide: true, stdio: 'ignore',
  });
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${child.exitCode}`);
    try { const response = await fetch(`${base}/san-pham`, { signal: AbortSignal.timeout(2000) }); if (response.ok) break; } catch {}
    if (attempt > 40) throw new Error('Isolated listing server unavailable');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await mkdir('artifacts/vehicle-filters', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1440, 390, 320]) {
    const touch = width < 760;
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.pathname.startsWith('/api/v1/')) {
        const response = await fetch(`http://127.0.0.1:${api.address().port}${url.pathname}${url.search}`);
        return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      }
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
    });
    await page.goto(`${base}/san-pham`, { waitUntil: 'networkidle' });
    const ready = () => page.waitForFunction(() => {
      const panel = document.querySelector('.vehicle-filter-panel');
      if(panel?.getAttribute('aria-busy') !== 'false') return false;
      const rendered = new URL(panel.dataset.filterBase, location.origin).searchParams, current = new URL(location.href).searchParams;
      rendered.sort(); current.sort();
      return rendered.toString() === current.toString();
    });
    await ready();
    const activate = async locator => touch ? locator.tap() : locator.click();
    const visible = page.locator('.vehicle-filter-popover:not([hidden])');
    for (const key of ['ngan-sach', 'nam-san-xuat', 'kieu-dang', 'hop-so', 'so-km', 'mau-sac', 'chi-nhanh']) {
      const trigger = page.locator(`[data-filter-popover-trigger][aria-controls="vehicle-filter-${key}"]`);
      await activate(trigger);
      await page.locator(`#vehicle-filter-${key}`).waitFor({ state: 'visible' });
      await activate(trigger);
      await page.locator(`#vehicle-filter-${key}`).waitFor({ state: 'hidden' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Second click hides the list');
      await activate(trigger);
      await page.mouse.move(4, 800); await page.waitForTimeout(220);
      assert.equal(await visible.count(), 1, 'Exactly one active popover');
      assert.equal(await visible.getAttribute('id'), `vehicle-filter-${key}`);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    }
    const priceTrigger = page.locator('[data-filter-popover-trigger][aria-controls="vehicle-filter-ngan-sach"]');
    await activate(priceTrigger);
    const price = page.locator('#vehicle-filter-ngan-sach');
    if (!touch) {
      await page.locator('[aria-controls="vehicle-filter-nam-san-xuat"]').hover();
      assert.equal(await visible.getAttribute('id'), 'vehicle-filter-ngan-sach', 'Hover cannot replace a pinned selection');
    }
    const anchored = async () => {
      const triggerBounds = await priceTrigger.boundingBox(), menuBounds = await price.boundingBox();
      assert(Math.abs(menuBounds.y - triggerBounds.y - triggerBounds.height - 8) < 1, 'Menu stays directly below its category');
    };
    await anchored();
    const initialScroll = await page.evaluate(() => scrollY);
    await page.mouse.move(4, 800);
    await page.evaluate(() => {
      const header = [...document.querySelectorAll('.wap_header,.menu_mobi')].find(el => el.getClientRects().length);
      const menu = document.getElementById('vehicle-filter-ngan-sach');
      window.scrollBy(0, menu.getBoundingClientRect().top - header.getBoundingClientRect().bottom / 2);
    });
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => {
      const header = [...document.querySelectorAll('.wap_header,.menu_mobi')].find(el => el.getClientRects().length);
      const menu = document.getElementById('vehicle-filter-ngan-sach'), bounds = menu.getBoundingClientRect();
      const y = header.getBoundingClientRect().bottom - 8;
      return bounds.top < y && bounds.bottom > y && !!document.elementFromPoint(bounds.left + 20, y)?.closest('.wap_header,.menu_mobi');
    }), 'The header paints above an overlapping open menu');
    assert.equal(await price.evaluate(el => el.hidden), false, 'Going behind the header does not close the menu');
    await page.screenshot({ path: `artifacts/vehicle-filters/${width}-below-header.png` });
    await page.evaluate(value => window.scrollTo(0, value), initialScroll); await page.waitForTimeout(100);
    await page.mouse.move(4, 800); await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(220);
    assert(await priceTrigger.evaluate(el => el.getBoundingClientRect().bottom < 0), 'Category scrolls away naturally');
    assert.equal(await page.locator('.vehicle-filter-bar.is-docked,.vehicle-filter-bar-placeholder').count(), 0, 'No fixed toolbar or placeholder');
    assert.equal(await price.evaluate(el => el.hidden), false, 'Scrolling out of view does not close the menu');
    assert.equal(await priceTrigger.getAttribute('aria-expanded'), 'true');
    await anchored();
    await page.evaluate(() => window.scrollBy(0, 100)); await page.waitForTimeout(100);
    await anchored();
    await page.evaluate(value => window.scrollTo(0, value), initialScroll); await page.waitForTimeout(150);
    assert(await price.isVisible(), 'Scrolling back shows the still-open menu in its original location');
    await anchored();
    await page.screenshot({ path: `artifacts/vehicle-filters/${width}-pinned.png` });
    await activate(page.locator('[aria-controls="vehicle-filter-nam-san-xuat"]'));
    assert.equal(await visible.getAttribute('id'), 'vehicle-filter-nam-san-xuat', 'Switching categories opens the corresponding menu');
    await activate(priceTrigger); await anchored();
    await page.setViewportSize({ width, height: 550 }); await page.waitForTimeout(100);
    const resized = await price.boundingBox();
    assert(resized.y >= 11 && resized.y + resized.height <= 539, 'Resize keeps the pinned popover in view');
    await anchored();
    await page.setViewportSize({ width, height: 900 });
    await activate(price.getByRole('link', { name: '100 - 300 triệu', exact: true }));
    await page.waitForURL(url => url.searchParams.get('ngan-sach') === '100-300'); await ready();
    assert(await price.isVisible(), 'Choosing an option keeps the active menu open after navigation');
    await anchored();
    assert.equal(await priceTrigger.getAttribute('aria-expanded'), 'true');
    await price.locator('input[name=min]').fill('0'); await price.locator('input[name=max]').fill('500');
    await activate(price.getByRole('button', { name: 'Lọc theo khoảng đã nhập' }));
    await page.waitForURL(url => url.searchParams.get('ngan-sach') === '0-500'); await ready();
    assert(await price.isVisible(), 'Applying a custom range keeps the menu open');
    await page.mouse.click(4, 450); await price.waitFor({ state: 'hidden' });
    assert.equal(await priceTrigger.getAttribute('aria-expanded'), 'false', 'Outside click closes it');
    assert.equal(await page.locator('.vehicle-filter-bar.is-docked,.vehicle-filter-bar-placeholder').count(), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await activate(priceTrigger); await page.keyboard.press('Escape'); await price.waitFor({ state: 'hidden' });
    if(!touch) {
      await page.mouse.move(4, 800);
      await priceTrigger.hover(); await price.waitFor({ state: 'visible' });
      await price.locator('input[name=min]').click();
      await page.mouse.move(4, 800); await page.waitForTimeout(220);
      assert(await price.isVisible(), 'Clicking inside a hover preview pins it too');
      await page.mouse.click(4, 450); await price.waitFor({ state: 'hidden' });
    }
    await page.locator('[aria-controls="vehicle-filter-kieu-dang"]').scrollIntoViewIfNeeded();
    await activate(page.locator('[aria-controls="vehicle-filter-kieu-dang"]'));
    await activate(page.locator('#vehicle-filter-kieu-dang').getByRole('link', { name: 'Sedan', exact: true }));
    await page.waitForURL(url => url.searchParams.get('kieu-dang') === 'sedan'); await ready();
    assert(await page.locator('#vehicle-filter-kieu-dang').isVisible(), 'Multiple-choice filters remain open too');
    await page.mouse.click(4, 450);
    await page.getByRole('button', { name: 'Xem thêm 1 xe', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.vehicle-results > .item').length === 7);
    assert.equal(await page.locator('.car-load-more__button').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: seven filter toggles, menus remain open while scrolling away and back, natural row placement, selection and remaining count`);
    await page.close();
  }
} finally {
  await browser?.close();
  if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
  await new Promise(resolve => api.close(resolve));
}
