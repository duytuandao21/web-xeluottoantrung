// Explicit post-activation smoke check. Uses the running development/test API.
// Creates two anonymous valuation records; never submits test contact leads.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = join(tmpdir(), 'valuation-release-screens');
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, locale: 'vi-VN' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${process.env.VALUATION_TEST_URL || 'http://localhost:3003'}/tien-ich/dinh-gia-xe`, { waitUntil: 'domcontentloaded' });
    const root = page.locator('.tt-valuation-page'), field = name => root.locator(`#valuation-${name}`);
    const ready = async name => {
      await field(name).waitFor();
      await page.waitForFunction(id => { const field = document.getElementById(id); return field && !field.disabled; }, `valuation-${name}`);
    };
    const next = () => root.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await ready('brandId'); await field('brandId').selectOption({ label: 'Kia' });
    await ready('modelId'); await field('modelId').selectOption({ label: 'Morning' });
    await ready('variantId'); await field('variantId').selectOption({ label: '1.2 MT' });
    await ready('modelYear'); await field('modelYear').selectOption('2018');
    await next(); await field('odometerKm').fill('64000'); await next();
    for (const [name, code] of Object.entries({ exteriorCondition: 'ORIGINAL', interiorCondition: 'GOOD', accidentLevel: 'NONE', floodLevel: 'NONE' })) await field(name).selectOption(code);
    await next();
    for (const [name, code] of Object.entries({ engineCondition: 'NORMAL', transmissionCondition: 'NORMAL', serviceHistory: 'PARTIAL' })) await field(name).selectOption(code);
    await next(); await field('ownerCount').fill('2'); await field('usageType').selectOption('PERSONAL');
    const responsePromise = page.waitForResponse(response => response.url().includes('/valuation/estimate') && response.request().method() === 'POST');
    await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
    const response = await responsePromise, result = await response.json();
    assert.equal(response.status(), 200); assert.equal(result.policyVersion, '1.0.0');
    assert.equal(result.referencePrice, 178000000); assert.deepEqual(result.marketRange, { min: 165000000, max: 191000000 });
    assert.deepEqual(result.dealerBuyingRange, { min: 156000000, max: 166000000 });
    assert.match(result.disclaimer, /niêm yết/); assert.ok(result.recordId);
    await root.getByRole('heading', { name: 'Kết quả định giá', exact: true }).waitFor();
    assert.match(await root.locator('.tt-valuation-price:not(.tt-valuation-price--dealer)').innerText(), /165 – 191 triệu/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(output, `live-result-${width}.png`), fullPage: true });
    if (width === 390) {
      await root.getByRole('button', { name: 'Đăng ký kiểm định xe', exact: true }).click();
      await page.setViewportSize({ width, height: 430 });
      const phone = root.locator('#valuation-contact-phone');
      await phone.focus();
      const box = await phone.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 430, 'Input remains visible in the reduced mobile viewport');
      assert.equal(await phone.evaluate(input => getComputedStyle(input).fontSize), '16px', 'Avoid input focus zoom on iOS');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'valuation-contact-city');
      await page.screenshot({ path: join(output, 'live-mobile-reduced-viewport.png') });
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, policyVersion: result.policyVersion, marketRange: result.marketRange, dealerBuyingRange: result.dealerBuyingRange, recordId: result.recordId, contactSubmitted: false, errors: errors.length }));
    await context.close();
  }
  console.log(`Live smoke passed. Screenshots: ${output}. Reduced viewport testing does not emulate an actual Safari keyboard.`);
} finally { await browser.close(); }
