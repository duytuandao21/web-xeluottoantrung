import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 767, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 768, isMobile: width < 768 });
    // Avoid unrelated detail-page prefetches exhausting the development API limit.
    await context.route('**/*', route => route.request().headers()['next-router-prefetch'] === '1' ? route.abort() : route.continue());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3001');
      if (response.status() === 200) break;
      if (attempt < 2) await page.waitForTimeout(35000);
    }
    assert.equal(response.status(), 200, `Homepage at ${width}px`);
    const viewport = page.locator('#tt-accessories-root .tt-accessories__viewport');
    await viewport.waitFor();
    assert(await viewport.locator('.tt-accessories__card').count() > 4);
    await viewport.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const metrics = await viewport.evaluate(element => ({
      width: element.clientWidth, card: element.querySelector('article').getBoundingClientRect().width,
      overflow: getComputedStyle(element).overflowX, scrollbar: getComputedStyle(element).scrollbarWidth,
      snap: getComputedStyle(element).scrollSnapType,
    }));
    const controls = page.locator('#tt-accessories-root .tt-accessories__controls');
    if (width < 768) {
      assert(metrics.card > metrics.width * .45 && metrics.card < metrics.width * .51, 'Two cards per row');
      assert.equal(metrics.overflow, 'auto');
      assert.equal(metrics.scrollbar, 'none');
      assert.equal(metrics.snap, 'x mandatory');
      assert.equal(await controls.count(), 0);
      const cdp = await context.newCDPSession(page);
      const swipe = async direction => {
        const box = await viewport.boundingBox();
        const start = box.x + box.width * (direction === 'next' ? .84 : .16);
        const finish = box.x + box.width * (direction === 'next' ? .16 : .84);
        const y = box.y + 60;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (finish - start) * step / 12, y }] });
          await page.waitForTimeout(25);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(800);
      };
      await swipe('next');
      const afterNext = await viewport.evaluate(element => element.scrollLeft);
      assert(afterNext > 40, `Swipe forwards at ${width}px`);
      assert.equal(new URL(page.url()).pathname, '/', 'Swiping must not open an accessory');
      await swipe('prev');
      assert(await viewport.evaluate(element => element.scrollLeft) < afterNext - 30, 'Swipe backwards');
      assert.equal(new URL(page.url()).pathname, '/');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
      await viewport.screenshot({ path: `.next/home-accessory-swipe-${width}.png` });
      if (width === 390) {
        const position = await viewport.evaluate(element => element.scrollLeft);
        await page.waitForFunction(previous => document.querySelector('#tt-accessories-root .tt-accessories__viewport').scrollLeft > previous + 30, position, { timeout: 22000 });
        const link = viewport.locator('.tt-accessories__image').nth(1);
        const expected = await link.getAttribute('href');
        await link.click();
        await page.waitForURL(`**${expected}`);
      }
    } else {
      assert.equal(await controls.count(), 1);
      const track = viewport.locator('.tt-accessories__track');
      const before = await track.evaluate(element => element.style.transform);
      await controls.getByRole('button', { name: 'Xem phụ kiện tiếp theo' }).click();
      assert.notEqual(await track.evaluate(element => element.style.transform), before);
    }
    assert.deepEqual(errors, []);
    console.log(`Passed ${width}px: ${width < 768 ? 'native touch swipe both directions, two cards, hidden arrows/scrollbar, valid links' : 'desktop arrows and carousel'}.`);
    await context.close();
  }
} finally { await browser.close(); }
