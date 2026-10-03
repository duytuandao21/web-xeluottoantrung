import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Reads the real public API and uses real stateless search/detail requests.
// No API fixtures, authentication impersonation or administrative writes.
const base = process.env.AUSPICIOUS_WEB_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('.next', { recursive: true });
try {
  for (const width of [1440, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: width === 360 ? 'no-preference' : 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /hydration|unique.*key/.test(message.text())) errors.push(message.text()); });
    // Avoid speculative requests to unrelated legacy pages in the shared navigation.
    await context.route('**/*', route => route.request().headers()['next-router-prefetch'] === '1' ? route.abort() : route.continue());
    assert.equal((await page.goto(`${base}/tien-ich/xem-ngay-mua-xe`, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.locator('input[name="birthDate"]').waitFor();
    await page.locator('.tt-site-intro').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.tt-date-eyebrow').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Hướng dẫn tra cứu', exact: true }).count(), 1);
    if (width < 600) {
      const genderBox = await page.locator('select[name="gender"]').boundingBox(), purposeBox = await page.locator('select[name="purpose"]').boundingBox();
      assert.ok(Math.abs(genderBox.y - purposeBox.y) < 1, 'mobile selects align');
    }
    await page.locator('.tt-date-intro').screenshot({ path: `.next/auspicious-intro-${width}.png` });
    await page.locator('.tt-date-hero').screenshot({ path: `.next/auspicious-hero-${width}.png` });
    assert.equal(await page.locator('select[name="purpose"] option').count(), 3);
    await page.locator('input[name="birthDate"]').fill('02/02/1984');
    await page.locator('input[name="from"]').fill('01/10/2026');
    await page.locator('input[name="to"]').fill('12/10/2026');
    for (const purpose of ['BUY_CAR', 'RECEIVE_CAR', 'SIGN_CONTRACT']) {
      await page.locator('select[name="purpose"]').selectOption(purpose);
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/auspicious-dates/search') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Xem ngày phù hợp', exact: true }).click();
      await page.getByRole('dialog', { name: 'Thông tin tham khảo', exact: true }).getByRole('button', { name: 'Đồng ý', exact: true }).click();
      const response = await responsePromise, data = await response.json();
      const input = response.request().postDataJSON();
      assert.equal(input.birthDate, '1984-02-02'); assert.equal(input.from, '2026-10-01'); assert.equal(input.to, '2026-10-12');
      assert.equal(response.ok(), true); assert.equal(data.rulesetVersion, '1.1.0'); assert.equal(data.results.length, 12);
      assert.equal(data.results.find(day => day.date === '2026-10-11').classification, 'AVOID');
      assert.equal('trace' in data.results[0], false); assert.equal('sources' in data, false);
      const expected = purpose === 'RECEIVE_CAR' ? 'NORMAL' : 'GOOD';
      assert.equal(data.results.find(day => day.date === '2026-10-04').classification, expected);
      // Check the viewport before any calendar click can scroll it for us.
      await page.waitForFunction(() => {
        const results = document.querySelector('.tt-date-results'), calendar = document.querySelector('.tt-date-calendar');
        if (!results || !calendar) return false;
        const top = results.getBoundingClientRect().top;
        return document.activeElement === results && top >= 70 && top <= 135 && calendar.getBoundingClientRect().top < innerHeight;
      });
      if (purpose === 'BUY_CAR') await page.screenshot({ path: `.next/auspicious-search-scroll-${width}.png` });
      assert.equal(await page.locator('.tt-date-results > .tt-date-disclaimer').count(), 1);
      const dayButton = page.getByRole('button', { name: /^04\/10\/2026:/ });
      const detailPromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/auspicious-dates/detail') && response.request().method() === 'POST');
      await dayButton.click(); const detailResponse = await detailPromise, detail = await detailResponse.json();
      assert.equal(detailResponse.ok(), true); assert.equal(detail.classification, expected); assert.equal(detail.goodHours.length, 6);
      await page.locator('#tt-date-detail').waitFor();
      assert.equal(await page.locator('.tt-date-results > .tt-date-disclaimer').count(), 0);
      assert.equal(await page.locator('.tt-date-results .tt-date-disclaimer').count(), 1);
      assert.deepEqual(await page.locator('#tt-date-detail dt').allTextContents(), ['Âm lịch', 'Can Chi ngày', 'Tháng / năm', 'Tiết khí tại đầu ngày']);
      assert.deepEqual(await page.locator('#tt-date-detail h3').allTextContents(), ['Giờ tham khảo']);
      assert.equal(await page.locator('#tt-date-detail .tt-date-hours span').count(), 6);
      assert.equal(await page.locator('#tt-date-detail a').getAttribute('href'), '/san-pham');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.screenshot({ path: `.next/auspicious-live-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Live ${width}px: all 3 purposes, automatic result scroll/focus, v1.1.0, calendar, exclusions, detail, six hours, CTA and no overflow passed.`);
    await context.close();
  }
} finally { await browser.close(); }
