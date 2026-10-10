import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultNavigationTimeout(60000);
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
    }, undefined, { timeout: 10000 }).catch(async error => {
      console.error(await page.evaluate(() => {
        const box = el => el && JSON.parse(JSON.stringify(el.getBoundingClientRect()));
        const input = document.querySelector('#keyword, input[data-product-search]');
        const bounds = input.getBoundingClientRect();
        return { viewport: { top: visualViewport.offsetTop, height: visualViewport.height },
          input: box(document.querySelector('#keyword, input[data-product-search]')),
          popup: box(document.querySelector('#tt-product-search-popup')),
          layer: box(document.querySelector('.tt-search-layer')), bodyTop: document.body.style.top,
          anchor: box(input.closest('.vehicle-search,.tt-accessory-filters__search,.tt-search-page__form,.search')),
          hit: document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.outerHTML.slice(0, 400),
          clip: document.querySelector('.tt-search-backdrop').style.clipPath,
          ancestors: (() => { const rows = []; for (let el=input.parentElement; el; el=el.parentElement) {
            const css=getComputedStyle(el); rows.push({ tag:el.className, overflow:css.overflow, z:css.zIndex, box:box(el) });
          } return rows; })() };
      }));
      throw error;
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
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('#keyword, input[data-product-search]').first();
    await input.scrollIntoViewIfNeeded();
    const originalScroll = await page.evaluate(() => window.scrollY);
    await input.tap();
    await popup.waitFor();
    await checkGeometry();
    assert.equal(await input.evaluate(el => {
      const anchor = el.closest('.tt-search-anchor--open');
      return anchor && getComputedStyle(anchor).touchAction;
    }), 'pan-x pinch-zoom', 'The original search row must prevent native vertical panning');
    for (const delta of [40, -40]) {
      assert.equal(await input.evaluate((el, delta) => {
        const emit = (name, y) => {
          const event = new Event(name, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'touches', { value: name === 'touchend' ? [] : [{ clientX: 100, clientY: y }] });
          el.dispatchEvent(event); return event.defaultPrevented;
        };
        emit('touchstart', 200);
        const prevented = emit('touchmove', 200 - delta);
        emit('touchend', 200 - delta);
        return prevented;
      }, delta), true, `Block original input swipes in ${path}`);
    }
    const bodyTop = await page.evaluate(() => document.body.style.top);
    await popup.locator('.tt-search-suggestions__options').evaluate(el => { el.scrollTop = 100; el.dispatchEvent(new Event('scroll')); });
    assert.equal(await page.evaluate(() => document.body.style.top), bodyTop, 'Results scrolling must not move the body');
    assert(Number(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 16, 'Prevent automatic iOS input zoom');
    // Keyboard animates through several heights before it settles.
    for (const [height, offsetTop] of [[540, 0], [420, 40], [360, 100], [420, 120]]) {
      await page.evaluate(values => window.setSearchTestViewport(values), { height, offsetTop });
      await checkGeometry();
      assert.equal(await page.evaluate(() => document.body.style.top), bodyTop, 'Keyboard panning must not move the locked body');
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
    assert.equal(await page.locator('.tt-search-anchor--open').count(), 0, 'Remove search row gesture restrictions on close');
    assert.equal(await page.evaluate(() => window.scrollY), originalScroll, 'Closing restores the location before alignment');
    await page.evaluate(() => window.setSearchTestViewport({ height: 844, offsetTop: 0 }));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.scrollY), originalScroll, 'Keyboard closing must preserve the restored location');
    await input.tap();
    await popup.waitFor();
    await checkGeometry();
    await page.locator('.tt-search-suggestions__heading button').tap();
    await popup.waitFor({ state: 'detached' });
    console.log(`PASS mobile keyboard resize/pan, rounded cutout, typing, keyboard toggle, close and reopen: ${path}`);
  }
  const serviceErrors = errors.filter(message => /^Public API \/lookups\/filter-options: 500$/.test(message));
  if (serviceErrors.length) console.warn('Baseline API lookup failures (outside popup test):', serviceErrors);
  assert.deepEqual(errors.filter(message => !serviceErrors.includes(message)), []);
  await page.close();
} finally { await browser.close(); }
