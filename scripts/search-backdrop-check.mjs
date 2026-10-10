import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const mobile of [true, false]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile, hasTouch: mobile });
    page.setDefaultNavigationTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/search/suggestions?*', route => route.fulfill({ json: { keywords: [], total: 1,
      items: [{ id: 'fixture', kind: 'car', name: 'Backdrop fixture', href: '/tim-kiem#selected-result', imageUrl: null, price: 1 }] } }));
    await page.goto(`${base}/tim-kiem`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('input[data-product-search]');
    const popup = page.locator('#tt-product-search-popup');
    await input.waitFor();
    await page.evaluate(() => {
      const spacer = document.createElement('div'); spacer.style.height = '3000px'; document.body.append(spacer);
      window.backgroundEvents = { pointerdown: 0, pointerup: 0, click: 0 };
      for (const kind of ['button', 'a']) {
        const el = document.createElement(kind); el.id = `backdrop-background-${kind}`; el.textContent = `Background ${kind}`;
        if (kind === 'button') el.type = 'button'; else el.href = '#background-link';
        Object.assign(el.style, { position: 'fixed', bottom: '24px', [kind === 'button' ? 'left' : 'right']: '20px',
          width: '140px', height: '44px', zIndex: '10059', background: 'white' });
        for (const name of Object.keys(window.backgroundEvents)) el.addEventListener(name, () => { window.backgroundEvents[name]++; });
        document.body.append(el);
      }
    });
    const client = mobile ? await page.context().newCDPSession(page) : null;
    for (const scroll of [0, 600]) {
      for (const kind of ['button', 'a']) {
        await page.evaluate(scroll => window.scrollTo({ top: scroll, behavior: 'instant' }), scroll);
        const originalScroll = await page.evaluate(() => scrollY);
        const url = page.url();
        await page.evaluate(() => { window.backgroundEvents = { pointerdown: 0, pointerup: 0, click: 0 }; });
        await input.evaluate(el => el.focus({ preventScroll: true }));
        await input.fill('fixture');
        await popup.locator('.tt-search-suggestions__product').waitFor();
        const target = page.locator(`#backdrop-background-${kind}`);
        const box = await target.boundingBox(); const x = box.x + box.width / 2; const y = box.y + box.height / 2;
        assert(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('tt-search-backdrop'), { x, y }),
          'The backdrop must cover the actionable background fixture');
        if (mobile) await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        else { await page.mouse.move(x, y); await page.mouse.down(); }
        await page.waitForTimeout(50);
        assert.equal(await popup.count(), 1, 'Keep the backdrop mounted until the activating click has been consumed');
        if (mobile) await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.mouse.up();
        await popup.waitFor({ state: 'detached' });
        assert.equal(page.url(), url, 'Dismissal must not navigate');
        assert.deepEqual(await page.evaluate(() => window.backgroundEvents), { pointerdown: 0, pointerup: 0, click: 0 },
          'The same gesture must never activate the covered button or link');
        assert.equal(await page.evaluate(() => scrollY), originalScroll);
        assert.equal(await input.evaluate(el => document.activeElement === el), false);
        // A subsequent intentional click after dismissal must still work.
        if (mobile) await target.tap(); else await target.click();
        assert.equal(await page.evaluate(() => window.backgroundEvents.click), 1, 'Do not block the next legitimate interaction');
        if (kind === 'a') assert.equal(new URL(page.url()).hash, '#background-link');
        await page.evaluate(() => history.replaceState(history.state, '', '/tim-kiem'));
      }
    }
    await input.evaluate(el => el.focus({ preventScroll: true })); await input.fill('fixture');
    await popup.locator('.tt-search-suggestions__product').click();
    await page.waitForURL(url => url.hash === '#selected-result', { waitUntil: 'domcontentloaded' });
    await popup.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    if (client) await client.detach();
    console.log(`PASS ${mobile ? 'mobile native touch' : 'desktop mouse'}: covered links/buttons, full pointer sequence, scroll restore, next click and result navigation`);
    await page.close();
  }
} finally { await browser.close(); }
