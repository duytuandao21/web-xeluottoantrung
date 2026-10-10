import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const engine = process.env.TEST_BROWSER || 'chromium';
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'chrome', headless: true }));
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultNavigationTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Models viewport geometry only. This is NOT a real iPhone OS keyboard.
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 844, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.setSearchTestViewport = values => {
      Object.assign(viewport, values);
      viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
    };
  });
  const suggestionsFixture = async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({ json: q === 'empty' ? { keywords: [], items: [], total: 0 } : {
      keywords: ['Toyota', 'Mazda', 'Honda', 'ICAR'], total: 5,
      items: Array.from({ length: 5 }, (_, index) => ({ id: String(index), kind: 'car', name: `${q || 'Car'} ${index}`, href: `/test-car-${index}`, imageUrl: null, price: 1000000 })),
    } });
  };
  await page.route('**/api/v1/search/suggestions?*', suggestionsFixture);
  await page.goto(`${base}/tim-kiem`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[data-product-search]').first().waitFor();
  await page.evaluate(() => {
    const spacer = document.createElement('div'); spacer.style.height = '3000px'; document.body.append(spacer);
  });
  const input = page.locator('input[data-product-search]').first();
  const popup = page.locator('#tt-product-search-popup');
  const options = page.locator('#tt-product-search-options');
  const readStyles = () => page.evaluate(() => ({ body: document.body.style.cssText, root: document.documentElement.style.cssText,
    anchor: document.querySelector('input[data-product-search]').closest('.tt-search-page__form').style.cssText }));
  const readGeometry = () => page.evaluate(() => {
    const box = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; };
    return { body: box(document.body), input: box(document.querySelector('input[data-product-search]')),
      popup: box(document.querySelector('#tt-product-search-popup')), scrollX, scrollY,
      viewport: { top: visualViewport.offsetTop, left: visualViewport.offsetLeft, height: visualViewport.height },
      listScroll: document.querySelector('#tt-product-search-options').scrollTop };
  });
  const setViewport = async values => {
    await page.evaluate(values => window.setSearchTestViewport(values), values);
    await page.waitForFunction(() => {
      const el = document.querySelector('#tt-product-search-popup');
      if (!el) return false;
      const box = el.getBoundingClientRect(); const v = visualViewport;
      return box.height > 0 && box.top >= v.offsetTop && box.bottom <= v.offsetTop + v.height - 11;
    }, undefined, { timeout: 10000 });
    assert(await page.evaluate(() => window.searchPopupNode === document.querySelector('#tt-product-search-popup')), 'Viewport events must not remount the popup');
  };
  // Synthetic events verify cancellation decisions, not native iOS scrolling.
  const gesture = (selector, delta, { horizontal = 0, multi = false } = {}) => page.evaluate(({ selector, delta, horizontal, multi }) => {
    const target = document.querySelector(selector);
    const emit = (name, y, x) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      const points = name === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      if (multi && points.length) points.push({ clientX: x + 10, clientY: y + 10 });
      Object.defineProperty(event, 'touches', { value: points }); target.dispatchEvent(event); return event.defaultPrevented;
    };
    emit('touchstart', 200, 150);
    const prevented = emit('touchmove', 200 - delta, 150 + horizontal);
    emit('touchend', 200 - delta, 150 + horizontal);
    return prevented;
  }, { selector, delta, horizontal, multi });

  for (const where of ['start', 'middle', 'end']) {
    await page.evaluate(where => {
      const max = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo({ top: where === 'start' ? 0 : where === 'middle' ? max / 2 : max, behavior: 'instant' });
    }, where);
    const originalScroll = await page.evaluate(() => window.scrollY);
    const originalStyles = await readStyles();
    // Keyboard/programmatic focus avoids Playwright scrolling the field first.
    await input.evaluate(el => el.focus({ preventScroll: true }));
    await popup.waitFor(); await input.fill('car');
    await popup.locator('.tt-search-suggestions__product').nth(4).waitFor();
    await page.evaluate(() => { window.searchPopupNode = document.querySelector('#tt-product-search-popup'); });
    const lockedTop = await page.evaluate(() => document.body.style.top);
    for (const values of [{ height: 540, offsetTop: 0 }, { height: 420, offsetTop: 80 }, { height: 360, offsetTop: 100 },
      { height: 844, offsetTop: 0 }, { height: 420, offsetTop: 80 }]) {
      await setViewport(values);
      assert.equal(await page.evaluate(() => document.body.style.top), lockedTop);
    }
    const marker = await page.evaluate(() => document.querySelector('.tt-search-page>h1').getBoundingClientRect().top);
    const max = await options.evaluate(el => el.scrollHeight - el.clientHeight);
    assert(max > 40, 'Scrollable fixture is required');
    await options.evaluate(el => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
    assert.equal(await gesture('#tt-product-search-options', 10), false, 'Allow an interior list scroll');
    await options.evaluate(el => { el.scrollTop = 0; });
    assert.equal(await gesture('#tt-product-search-options', -30), true, 'Block pulling beyond the top');
    await options.evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight; });
    assert.equal(await gesture('#tt-product-search-options', 30), true, 'Block scrolling beyond the bottom');
    await options.evaluate(el => { el.scrollTop = 5; });
    assert.equal(await gesture('#tt-product-search-options', -30), true);
    assert.equal(await options.evaluate(el => el.scrollTop), 0, 'Consume the valid distance before the boundary');
    assert.equal(await gesture('.tt-search-suggestions__heading', 40), true, 'The heading must not pan the background');
    assert.equal(await gesture('#tt-product-search-options', 2), false, 'Do not cancel taps');
    assert.equal(await gesture('#tt-product-search-options', 10, { horizontal: 40 }), false, 'Preserve horizontal text gestures');
    assert.equal(await gesture('#tt-product-search-options', 20, { multi: true }), false, 'Preserve multitouch');
    assert.equal(await gesture('input[data-product-search]', 40), true, 'A vertical swipe on the original input must not pan the viewport');
    assert.equal(await gesture('input[data-product-search]', -40), true, 'Block the opposite swipe direction on the input');
    assert.equal(await gesture('.tt-search-page__form', 40), true, 'The original form is outside the portal but must be guarded');
    assert.equal(await gesture('.tt-search-page__form button', -40), true, 'Swiping the original submit button must not pan');
    assert.equal(await gesture('.tt-search-suggestions__all', 40), true, 'Only the result list may scroll, not its footer');
    assert.equal(await gesture('input[data-product-search]', 2), false, 'Preserve input taps and small caret movements');
    assert.equal(await gesture('input[data-product-search]', 10, { horizontal: 40 }), false, 'Preserve horizontal input caret gestures');
    assert.equal(await gesture('input[data-product-search]', 20, { multi: true }), false, 'Preserve pinch zoom on the input');
    assert.equal(await input.evaluate(el => getComputedStyle(el.closest('.tt-search-page__form')).touchAction), 'pan-x pinch-zoom');
    assert.equal(await options.evaluate(el => getComputedStyle(el).touchAction), 'pan-y pinch-zoom');
    await input.evaluate(el => { el.setSelectionRange(0, 2); });
    assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, 2], 'Input selection remains available');
    assert.equal(await gesture('input[data-product-search]', 40), true, 'Selected input text must not exempt vertical panning');
    await popup.locator('.tt-search-suggestions__product>span').first().evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    assert.equal(await gesture('input[data-product-search]', 40), true, 'A selection in the list must not exempt the original input');
    assert.equal(await gesture('#tt-product-search-options', -30), true, 'A text selection must not reopen scroll chaining at a boundary');
    await options.evaluate(el => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
    assert.equal(await gesture('#tt-product-search-options', 10), false, 'A text selection does not block an interior list scroll');
    await page.evaluate(() => getSelection().removeAllRanges());

    if (engine === 'chromium') {
      // Actual Chromium touch input: native list scrolling, not synthetic events.
      const client = await page.context().newCDPSession(page);
      const swipe = async (target, delta) => {
        const box = await target.boundingBox(); const x = box.x + box.width / 3; const y = box.y + box.height / 2;
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 8; step++) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - delta * step / 8 }] });
          await page.waitForTimeout(20);
        }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(100);
      };
      // Regression: the original input does not descend from the portal.
      // Check real browser touch dispatch in both directions, repeatedly.
      const beforeInputSwipes = await readGeometry();
      for (const delta of [60, -60, 60, -60]) await swipe(input, delta);
      assert.deepEqual(await readGeometry(), beforeInputSwipes, 'Input swipes must leave popup, page, viewport and list unmoved');
      assert(await input.evaluate(el => document.activeElement === el), 'Swiping the field does not dismiss it or lose focus');
      await options.evaluate(el => { el.scrollTop = 0; });
      await swipe(options, 70);
      assert(await options.evaluate(el => el.scrollTop > 0), 'Native touch scrolls the result list');
      await swipe(options, -70);
      await client.detach();
    }
    assert.equal(await page.evaluate(() => document.body.style.top), lockedTop);
    assert.equal(await page.evaluate(() => document.querySelector('.tt-search-page>h1').getBoundingClientRect().top), marker, 'Background content stays frozen');
    await input.fill('empty');
    await popup.locator('[aria-busy="false"]').waitFor();
    await popup.getByText('Không có kết quả phù hợp.', { exact: true }).waitFor();
    assert.equal(await options.evaluate(el => el.scrollHeight - el.clientHeight), 0);
    assert.equal(await gesture('#tt-product-search-options', 30), true, 'Block gestures on a short/empty list');
    assert.equal(await gesture('#tt-product-search-options', -30), true);
    assert.equal(await gesture('input[data-product-search]', 40), true, 'Input remains guarded without results');
    assert.equal(await gesture('input[data-product-search]', -40), true);
    await popup.locator('.tt-search-suggestions__heading button').tap();
    await popup.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.scrollY), originalScroll);
    // Simulate Safari completing its keyboard pan after the popup has closed.
    await page.evaluate(() => { window.scrollTo({ top: 10, behavior: 'instant' }); window.setSearchTestViewport({ height: 844, offsetTop: 0 }); });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.scrollY), originalScroll, 'Late keyboard pan restores the original location');
    assert.deepEqual(await readStyles(), originalStyles, 'All modified inline styles are restored');
    assert.equal(await page.locator('.tt-search-anchor--open').count(), 0, 'Remove anchor gesture CSS after closing');
    assert.equal(await gesture('input[data-product-search]', 40), false, 'Closed popup leaves no touch interception');
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }));
    assert.equal(await page.evaluate(() => window.scrollY), 100, 'Normal page scroll works after closing');
    console.log(`PASS ${engine}: ${where} page position, keyboard cycles, boundaries, empty results, selection, cleanup and scroll restore`);
  }
  // A quick reopen owns a fresh scroll snapshot and cancels the older restore.
  await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }));
  await input.evaluate(el => el.focus({ preventScroll: true })); await popup.waitFor();
  await page.evaluate(() => { window.searchPopupNode = document.querySelector('#tt-product-search-popup'); });
  await setViewport({ height: 420, offsetTop: 80 });
  await popup.locator('.tt-search-suggestions__heading button').tap(); await popup.waitFor({ state: 'detached' });
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }));
  await input.evaluate(el => el.focus({ preventScroll: true })); await popup.waitFor();
  await page.evaluate(() => { window.searchPopupNode = document.querySelector('#tt-product-search-popup'); });
  const newLockedTop = await page.evaluate(() => document.body.style.top);
  await setViewport({ height: 844, offsetTop: 0 });
  assert.equal(await page.evaluate(() => document.body.style.top), newLockedTop, 'Older restore must not disrupt a new popup');
  await popup.locator('.tt-search-suggestions__heading button').tap(); await popup.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.scrollY), 180, 'Quick reopen stores a fresh original position');
  console.log(`PASS ${engine}: rapid close/reopen and pending keyboard restore cancellation`);
  // Desktop must keep its original anchor and receive no touch cancellation.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.setSearchTestViewport({ width: 1440, height: 1000, offsetTop: 0 }));
  await input.evaluate(el => el.focus({ preventScroll: true }));
  await popup.waitFor(); await input.fill('car');
  await popup.locator('.tt-search-suggestions__product').first().waitFor();
  assert.equal(await gesture('.tt-search-suggestions__heading', 40), false);
  assert.equal(await gesture('input[data-product-search]', 40), false, 'Desktop input gestures are unchanged');
  assert.equal(await input.evaluate(el => getComputedStyle(el.closest('.tt-search-page__form')).touchAction), 'auto');
  assert.equal(await input.evaluate(el => el.closest('.tt-search-page__form').style.cssText), '');
  const desktopTop = await page.evaluate(() => document.body.style.top);
  await options.evaluate(el => { el.scrollTop = 100; el.dispatchEvent(new Event('scroll')); });
  assert.equal(await page.evaluate(() => document.body.style.top), desktopTop);
  await page.keyboard.press('Escape'); await popup.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.setSearchTestViewport({ width: 390, height: 844, offsetTop: 0 }));
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }));
  await input.evaluate(el => el.blur()); // Escape intentionally keeps keyboard focus.
  await input.evaluate(el => el.focus({ preventScroll: true })); await popup.waitFor(); await input.fill('car');
  await popup.locator('.tt-search-suggestions__product').first().waitFor();
  await page.locator('.tt-search-page__form button[type="submit"]').tap();
  await page.waitForURL(url => url.pathname === '/tim-kiem' && url.searchParams.get('keyword') === 'car', { timeout: 30000, waitUntil: 'domcontentloaded' });
  console.log(`PASS ${engine}: original search submit remains usable while popup is open`);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: desktop anchor, scrolling and Escape cleanup`);
  if (engine === 'chromium') {
    // A second page uses Chrome's actual visualViewport, without the mock.
    // Layout resize still does not simulate the iPhone's OS keyboard.
    const nativePage = await browser.newPage({ viewport: { width: 390, height: 430 }, isMobile: true, hasTouch: true });
    await nativePage.route('**/api/v1/search/suggestions?*', suggestionsFixture);
    await nativePage.goto(`${base}/tim-kiem`, { waitUntil: 'domcontentloaded' });
    const nativeInput = nativePage.locator('input[data-product-search]');
    await nativeInput.tap(); await nativeInput.fill('car');
    await nativePage.locator('.tt-search-suggestions__product').nth(4).waitFor();
    const geometry = () => nativePage.evaluate(() => {
      const rect = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; };
      return { body: rect(document.body), popup: rect(document.querySelector('#tt-product-search-popup')), scrollX, scrollY,
        viewport: { top: visualViewport.offsetTop, left: visualViewport.offsetLeft, height: visualViewport.height },
        listScroll: document.querySelector('#tt-product-search-options').scrollTop };
    });
    await nativePage.waitForTimeout(1100); // Let the existing opening animation and geometry settle.
    const nativeClient = await nativePage.context().newCDPSession(nativePage);
    const swipe = async (target, delta) => {
      const box = await target.boundingBox(); const x = box.x + box.width / 3; const y = box.y + box.height / 2;
      await nativeClient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await nativeClient.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - delta * step / 8 }] });
        await nativePage.waitForTimeout(20);
      }
      await nativeClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await nativePage.waitForTimeout(150);
    };
    const before = await geometry();
    for (const delta of [60, -60, 60, -60]) await swipe(nativeInput, delta);
    assert.deepEqual(await geometry(), before, 'Native Chrome visualViewport must not pan when swiping the input');
    const nativeList = nativePage.locator('#tt-product-search-options');
    assert(await nativeList.evaluate(el => el.scrollHeight > el.clientHeight), 'Native fixture must scroll');
    await swipe(nativeList, 60);
    assert(await nativeList.evaluate(el => el.scrollTop > 0), 'List still scrolls with the real Chromium viewport');
    await nativePage.locator('.tt-search-suggestions__heading button').tap();
    await nativePage.locator('#tt-product-search-popup').waitFor({ state: 'detached' });
    assert.equal(await nativePage.locator('.tt-search-anchor--open').count(), 0);
    await nativeClient.detach(); await nativePage.close();
    console.log('PASS chromium: native input/list touch with the actual browser visualViewport');
  }
  await page.close();
} finally { await browser.close(); }
