import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const out = '../toi-uu-hieu-suat-website/card-image-loading';
const browser = await chromium.launch({ channel: 'chrome', headless: true }), records = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 390 ? 3 : 2, hasTouch: width === 390 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(base + '/san-pham', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const card = page.locator('[data-car-id]').first(), image = card.locator('[data-current="true"] img');
    await page.waitForFunction(() => { const img = document.querySelector('[data-car-id] [data-current="true"] img'); return img?.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await card.scrollIntoViewIfNeeded();
    const original = await image.getAttribute('src');
    const originalSource = await image.getAttribute('data-image-original');
    const coverKey = new URL(originalSource).pathname;
    async function move(direction) {
      if (width === 1440) { await card.hover(); await card.locator(direction === 1 ? '.slick-next' : '.slick-prev').click(); }
      else {
        const r = await card.locator('.car-card-gallery__viewport').boundingBox(), y = r.y + r.height * .5, x = r.x + r.width * (direction === 1 ? .85 : .15);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - direction * r.width * .7, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    }
    await move(1);
    await page.waitForFunction(src => { const card = document.querySelector('[data-car-id]'), img = card.querySelector('[data-current="true"] img'); return img.getAttribute('src') !== src && img.complete && img.naturalWidth > 0 && !card.querySelector('.is-moving') && getComputedStyle(img).visibility === 'visible'; }, original, { timeout: 60000 });
    await move(-1);
    await page.waitForFunction(src => { const card = document.querySelector('[data-car-id]'); return card.querySelector('[data-current="true"] img').getAttribute('src') === src && !card.querySelector('.is-moving'); }, original, { timeout: 60000 });
    await page.locator('.car-load-more__button').click();
    await page.waitForFunction(() => document.querySelectorAll('.vehicle-results > .item').length === 12, null, { timeout: 60000 });
    const last = page.locator('.vehicle-results > .item').last();
    await last.evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - innerHeight - 500, behavior: 'instant' }));
    await page.waitForTimeout(350);
    assert.equal(await last.locator('[data-current="true"] img').getAttribute('loading'), 'eager');
    // Exercise cleanup and newly mounted cards on client route navigation.
    await page.locator('#vehicle-sort').selectOption('gia asc');
    await page.waitForURL(url => url.searchParams.get('gia') === 'gia asc');
    await page.locator('.vehicle-filter-panel[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('.vehicle-results > .item').count(), 6);
    assert.deepEqual(errors, []);
    await context.close();

    const fallback = await browser.newContext({ viewport: { width, height: 900 } });
    const fallbackPage = await fallback.newPage();
    await fallbackPage.route('https://cdn.toantrungxeluot.io.vn/cdn-cgi/image/**', route => route.request().url().includes(coverKey) ? route.abort() : route.continue());
    await fallbackPage.goto(base + '/san-pham', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await fallbackPage.waitForFunction(() => { const img = document.querySelector('[data-car-id] [data-current="true"] img'); return img?.complete && img.naturalWidth > 0 && !img.currentSrc.includes('/cdn-cgi/image/') && getComputedStyle(img).visibility === 'visible'; }, null, { timeout: 60000 });
    const fallbackSource = await fallbackPage.locator('[data-car-id] [data-current="true"] img').first().evaluate(img => img.currentSrc);
    assert(fallbackSource.startsWith('https://cdn.toantrungxeluot.io.vn/'));
    await fallbackPage.route(fallbackSource, route => route.abort());
    await fallbackPage.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await fallbackPage.locator('[data-car-id]').first().getByRole('status').first().waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(await fallbackPage.locator('[data-car-id]').first().getByRole('status').first().textContent(), 'Không tải được ảnh xe');
    records.push({ width, arrowsOrSwipe: 'PASS', previous: 'PASS', loadMore: '6 -> 12', appendedCoverAhead: 'PASS', sortAndRemount: 'PASS', transformFallback: 'PASS', finalImageError: 'PASS', errors });
    fs.writeFileSync(`${out}/interactions.json`, JSON.stringify(records, null, 2));
    console.log(JSON.stringify(records.at(-1)));
    await fallback.close();
  }
} finally { await browser.close(); }
