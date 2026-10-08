import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Headless browsers cannot display an OS keyboard. Reproduce its viewport
    // resizing and panning without changing the layout viewport, as on iOS.
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 844, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.setSearchTestViewport = values => {
      Object.assign(viewport, values);
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
  await page.route('**/api/v1/search/suggestions?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({ json: { keywords: ['Toyota', 'Mazda', 'ICAR', 'TEIN', 'Màn hình Android', 'Phuộc nhún', 'Vios', 'City'], total: 4,
      items: ['car', 'accessory', 'car', 'accessory'].map((kind, index) => ({ id: String(index), kind, name: `${query || 'Suggested'} ${kind} ${index}`, href: `/product-${index}`, imageUrl: null, price: 1000000 })) } });
  });
  const popup = page.locator('#tt-product-search-popup');
  const checkGeometry = async () => {
    await page.waitForFunction(() => {
      const input = document.querySelector('#keyword, input[data-product-search]');
      const popup = document.querySelector('#tt-product-search-popup');
      const backdrop = document.querySelector('.tt-search-backdrop');
      if (!input || !popup || !backdrop) return false;
      const anchor = input.closest('.vehicle-search,.tt-accessory-filters__search,.tt-search-page__form,.search') || input;
      const field = input.getBoundingClientRect();
      const bounds = anchor.getBoundingClientRect();
      const box = popup.getBoundingClientRect();
      const viewport = window.visualViewport;
      return bounds.top >= viewport.offsetTop && field.bottom <= viewport.offsetTop + viewport.height
        && Math.abs(box.top - bounds.bottom - 8) < 1
        && box.bottom <= viewport.offsetTop + viewport.height - 11
        && box.left >= viewport.offsetLeft + 11 && box.right <= viewport.offsetLeft + viewport.width - 11
        && document.elementFromPoint(field.left + field.width / 2, field.top + field.height / 2) === input;
    });
    const covered = await page.evaluate(() => {
      const field = document.querySelector('#keyword, input[data-product-search]');
      const anchor = field.closest('.vehicle-search,.tt-accessory-filters__search,.tt-search-page__form,.search') || field;
      const bounds = anchor.getBoundingClientRect();
      return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top - 6)?.classList.contains('tt-search-backdrop');
    });
    assert(covered, 'The blurred border must stay aligned with the search bar');
    assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
  };

  for (const path of ['/', '/san-pham', '/phu-kien-o-to', '/tim-kiem']) {
    await page.goto(`${base}${path}`);
    const input = page.locator('#keyword, input[data-product-search]').first();
    await input.tap();
    await popup.waitFor();
    await checkGeometry();
    assert(Number(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 16, 'Prevent automatic iOS input zoom');
    // Keyboard animates through several heights before it settles.
    for (const [height, offsetTop] of [[540, 0], [420, 40], [360, 100], [420, 120]]) {
      await page.evaluate(values => window.setSearchTestViewport(values), { height, offsetTop });
      await checkGeometry();
    }
    assert.equal(await page.locator('.tt-search-layer--compact').count(), 1);
    await input.fill('mazda');
    await popup.locator('.tt-search-suggestions__product').first().waitFor();
    await checkGeometry();
    // Fixed layer origins can also shift when a browser pans its viewport.
    await page.locator('.tt-search-layer').evaluate(el => { el.style.transform = 'translate(20px, 120px)'; });
    await page.evaluate(() => window.setSearchTestViewport({ offsetLeft: 20, width: 370 }));
    await checkGeometry();
    await page.locator('.tt-search-layer').evaluate(el => { el.style.transform = ''; });
    // Android/browser configurations that also shrink the layout viewport.
    await page.setViewportSize({ width: 390, height: 430 });
    await page.evaluate(() => window.setSearchTestViewport({ height: 430, offsetTop: 0, offsetLeft: 0, width: 390 }));
    await checkGeometry();
    // Hide keyboard, show it again without requiring another tap.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.setSearchTestViewport({ height: 844, offsetTop: 0 }));
    await checkGeometry();
    await page.evaluate(() => window.setSearchTestViewport({ height: 420, offsetTop: 80 }));
    await checkGeometry();
    await popup.locator('.tt-search-suggestions__keyword').first().tap();
    await checkGeometry();
    await page.locator('.tt-search-suggestions__heading button').tap();
    await popup.waitFor({ state: 'detached' });
    assert.equal(await input.evaluate(el => document.activeElement === el), false);
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.locator('.tt-search-layer').count(), 0);
    await page.evaluate(() => window.setSearchTestViewport({ height: 844, offsetTop: 0 }));
    await input.tap();
    await popup.waitFor();
    await checkGeometry();
    await page.locator('.tt-search-suggestions__heading button').tap();
    await popup.waitFor({ state: 'detached' });
    console.log(`PASS mobile keyboard resize/pan, rounded cutout, typing, keyboard toggle, close and reopen: ${path}`);
  }
  assert.deepEqual(errors, []);
  await page.close();
} finally { await browser.close(); }
