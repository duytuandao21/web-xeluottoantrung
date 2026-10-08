import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}/san-pham`);
    const controls = page.locator('.id_ss');
    await page.locator('.c_sosanh').press('Enter');
    await controls.nth(0).press('Enter');
    await controls.nth(1).press('Space');
    await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
    const slugs = await controls.evaluateAll(items => items.filter(item => item.classList.contains('id_ss_active')).map(item => item.dataset.id));
    assert.equal(slugs.length, 2);
    await controls.nth(2).click();
    assert.equal(await page.locator('.id_ss_active').count(), 2);
    assert.match(await page.locator('.tt-compare-tray__notice').innerText(), /đã chọn 2 xe/);
    await page.locator('.tt-compare-primary').click();
    await page.locator('.tt-compare-dialog').waitFor();
    assert.equal(await page.locator('.tt-compare-table thead th').count(), 3);
    for (const [index, slug] of slugs.entries()) {
      const response = await page.request.get(`${base}/api/v1/cars/${slug}`);
      const car = await response.json();
      assert.match(await page.locator('.tt-compare-table thead th').nth(index + 1).innerText(), new RegExp(car.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(await page.locator('.tt-compare-table tbody tr').filter({ has: page.locator('th', { hasText: /^Năm sản xuất$/ }) }).locator('td').nth(index).innerText(), String(car.year));
      assert.equal(await page.locator('.tt-compare-table tbody tr').filter({ has: page.locator('th', { hasText: /^Số ghế$/ }) }).locator('td').nth(index).innerText(), car.seatCount == null ? 'Chưa cập nhật' : String(car.seatCount));
    }
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert(await page.locator('.tt-compare-dialog').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.tt-compare-dialog').count(), 0);
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.locator('.tt-compare-tray__heading button').first().click();
    assert(await page.locator('.tt-compare-tray').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight && element.getBoundingClientRect().top > 0));
    await page.locator('.tt-compare-tray__heading button').first().click();
    await page.locator('#vehicle-sort').selectOption('gia asc');
    await page.waitForURL(url => url.searchParams.get('gia') === 'gia asc');
    await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
    assert.equal(await page.locator('.tt-compare-tray__car').count(), 2);
    await page.locator('.car-load-more__button').click();
    await page.waitForFunction(() => document.querySelectorAll('.vehicle-results > .item').length === 12);
    await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
    assert.equal(await page.locator('.tt-compare-tray__car').count(), 2);
    const addedControl = page.locator('.vehicle-results > .item').nth(6).locator('.id_ss');
    assert.equal(await addedControl.getAttribute('role'), 'button');
    await page.locator('.tt-compare-tray__car button').first().click();
    await addedControl.click();
    await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
    assert.equal(await addedControl.getAttribute('aria-pressed'), 'true');
    await page.reload();
    await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
    assert.equal(await page.locator('.tt-compare-tray__car').count(), 2);
    await page.locator('.tt-compare-tray__car button').first().click();
    assert.equal(await page.locator('.tt-compare-tray__car').count(), 1);
    assert(await page.locator('.tt-compare-primary').isDisabled());
    await page.locator('.tt-compare-clear').click();
    assert.equal(await page.locator('.tt-compare-tray__car').count(), 0);
    await page.locator('.c_sosanh').click();
    assert.equal(await page.locator('.tt-compare-tray').count(), 0);
    console.log(`Passed ${width}px: keyboard, limit, data, modal, collapse, sort, load more, newly loaded controls, reload, remove and clear`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.route('**/api/v1/cars/*', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto(`${base}/san-pham`);
  await page.locator('.c_sosanh').click();
  await page.locator('.id_ss').first().click();
  await page.locator('.tt-compare-tray__notice button').waitFor();
  assert(await page.locator('.tt-compare-primary').isDisabled());
  await page.unroute('**/api/v1/cars/*');
  await page.locator('.tt-compare-tray__notice button').click();
  await page.waitForFunction(() => !document.querySelector('.tt-compare-tray__notice button') && !document.querySelector('.tt-compare-primary')?.textContent.includes('Đang tải'));
  await page.locator('.id_ss').nth(1).click();
  await page.locator('.tt-compare-primary:not(:disabled)').waitFor();
  console.log('Passed failed request and retry');
  await page.close();
} finally { await browser.close(); }
