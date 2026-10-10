// Uses the saved car-discount fixture and an isolated Next test server.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3101';
try {
  for (const width of [320, 360, 375, 390, 414, 430, 700, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width < 700, hasTouch: width < 700 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/car-discount-check`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const card = slug => page.locator(`[data-car-id="${slug}"]`);
    const badge = slug => card(slug).locator('.car-card-discount');
    await badge('discount').waitFor(); await page.waitForTimeout(150);
    for (const slug of ['no-price', 'zero-price', 'negative-price']) assert.equal(await badge(slug).count(), 0);
    for (const slug of ['discount', 'billion-price', 'new-discount']) {
      assert.equal(await badge(slug).count(), 1);
      assert.equal(await badge(slug).locator('span').innerText(), 'Giảm giá');
      const geometry = await card(slug).evaluate(el => {
        const bar = el.querySelector('.gia_sp'), price = el.querySelector('.car-card-price'), badge = el.querySelector('.car-card-discount');
        const rect = x => { const r = x.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
        return { bar: rect(bar), price: rect(price), badge: rect(badge), icon: rect(badge.querySelector('svg')), clippedPrice: price.scrollWidth > price.clientWidth, clippedBadge: badge.scrollWidth > badge.clientWidth, barOverflow: bar.scrollWidth > bar.clientWidth, color: getComputedStyle(badge).color, pointer: getComputedStyle(badge).pointerEvents };
      });
      const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      if (width <= 700) assert(Math.abs((geometry.price.top + geometry.price.bottom) / 2 - (geometry.badge.top + geometry.badge.bottom) / 2) < 1,
        `Price and badge must share a row: ${width}px ${slug}`);
      assert.equal(overlaps(geometry.price, geometry.badge), false, `Price/badge overlap: ${width}px ${slug}`);
      assert.equal(overlaps(geometry.price, geometry.icon), false, `Price/icon overlap: ${width}px ${slug}`);
      assert(geometry.icon.left >= geometry.bar.left && geometry.badge.right <= geometry.bar.right, `Badge fits bar: ${width}px ${slug}`);
      assert.equal(geometry.clippedPrice || geometry.clippedBadge || geometry.barOverflow, false, `No clipped price/badge: ${width}px ${slug}`);
      assert.equal(geometry.color, 'rgb(23, 23, 23)'); assert.equal(geometry.pointer, 'none');
    }
    assert.equal(await card('new-discount').locator('.car-card-new-arrival').count(), 1, 'New arrival and discount coexist');
    if ([390,1440].includes(width)) await card('discount').screenshot({ path: `../toi-uu-hieu-suat-website/car-discount/card-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS discount ${width}px: old price conditions, full price/tag, no overlap, new arrival coexistence`);
    await page.close();
  }
} finally { await browser.close(); }
