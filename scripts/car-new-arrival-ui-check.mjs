// Requires an isolated fixture route; setup is documented in the feature report.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || 'http://localhost:3101';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width < 700, hasTouch: width < 700 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/car-arrival-check`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const card = slug => page.locator(`[data-car-id="${slug}"]`);
    const badge = slug => card(slug).locator('.car-card-new-arrival');
    await badge('fresh').waitFor(); await badge('expiring').waitFor();
    await page.waitForTimeout(100);
    for (const slug of ['fresh-off', 'old-edited', 'expired', 'unknown']) assert.equal(await badge(slug).count(), 0, `No badge for ${slug}`);
    assert.equal(await badge('fresh-deposit').count(), 1);
    const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const slug of ['fresh', 'fresh-deposit']) {
      const box = await badge(slug).boundingBox(), image = await card(slug).locator('.img_sp').boundingBox();
      assert(box.x >= image.x && box.y >= image.y && box.x + box.width <= image.x + image.width && box.y + box.height <= image.y + image.height,
        `Badge fits image at width ${width}`);
      assert.equal(await badge(slug).evaluate(el => el.scrollWidth > el.clientWidth), false, 'Tag text is not clipped');
      assert.equal(await badge(slug).evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Tag does not intercept image clicks or swipes');
    }
    assert.equal(overlaps(await badge('fresh-deposit').boundingBox(), await card('fresh-deposit').locator('.tinhtrang').boundingBox()), false, 'Deposit label stays readable');
    if (width === 390) await page.screenshot({ path: '../toi-uu-hieu-suat-website/car-new-arrival/mobile.png', fullPage: true });
    await page.evaluate(() => document.body.classList.add('ss'));
    await card('fresh').locator('.id_ss').waitFor({ state: 'visible' });
    for (const slug of ['fresh', 'fresh-deposit']) assert.equal(overlaps(await badge(slug).boundingBox(), await card(slug).locator('.id_ss').boundingBox()), false, 'Badge does not overlap compare control');
    await page.evaluate(() => document.body.classList.remove('ss'));
    const remaining = await page.evaluate(() => Number(document.querySelector('[data-arrival-expiry]').dataset.arrivalExpiry) - Date.now());
    assert(remaining > 0, 'Expiry fixture must initially be fresh');
    await page.clock.fastForward(remaining + 1);
    await badge('expiring').waitFor({ state: 'detached' });
    assert.equal(await badge('fresh').count(), 1, 'Other fresh cars stay tagged after the boundary');
    assert.deepEqual(errors, []);
    console.log(`PASS arrival UI ${width}px: fresh/expired/edited data, fit, status/compare controls and automatic expiry without reload`);
    await page.close();
  }
} finally { await browser.close(); }
