import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const get = async (path) => {
  const response = await fetch(`${base}/api/v1${path}`);
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
};
const featured = await get('/search/suggestions');
assert(featured.keywords.length > 0, 'Featured selling car fixture required');
assert.deepEqual(featured.items.map(item => item.kind), ['car', 'accessory', 'car', 'accessory']);
const matches = await get('/search/suggestions?q=a');
assert.equal(matches.items.length, 5);
const accessory = (await get('/accessories?limit=1')).data[0];
assert(accessory, 'Accessory fixture required');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 760, isMobile: width < 760 });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(45000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /unique.*key|hydration|cannot update/i.test(message.text())) errors.push(message.text()); });
    await page.addInitScript(() => sessionStorage.setItem('tt-site-intro-seen', '1'));
    const popup = page.locator('#tt-product-search-popup');
    const waitItems = async (count) => {
      await page.waitForFunction(count => document.querySelectorAll('.tt-search-suggestions__product').length === count, count);
      await popup.locator('[aria-busy="false"]').waitFor();
    };
    await page.goto(`${base}/san-pham`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('#keyword');
    await page.evaluate(() => window.scrollTo({ top: 60, behavior: 'instant' }));
    await input.click();
    await popup.locator('.tt-search-suggestions__keyword').first().waitFor();
    assert.equal(await page.locator('.tt-search-backdrop').count(), 1);
    assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
    const alignedScroll = await page.evaluate(() => -parseFloat(document.body.style.top));
    assert(await input.evaluate(el => {
      const headerBottom = [...document.querySelectorAll('.wap_header, .menu_mobi')].reduce((bottom, header) => {
        const rect = header.getBoundingClientRect(); return rect.width && rect.height ? Math.max(bottom, rect.bottom) : bottom;
      }, 0);
      const anchor = el.closest('.vehicle-search');
      return Math.abs(anchor.getBoundingClientRect().top - headerBottom - 16) <= 1;
    }), 'Each opening must align the search below the header');
    assert.equal(await popup.locator('.tt-search-suggestions__card').count(), 4);
    assert(await input.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === el;
    }), 'The original search field must remain clickable and clear');
    const lockedInputTop = await input.evaluate(el => el.getBoundingClientRect().top);
    await page.mouse.move(5, 500);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(200);
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().top), lockedInputTop, 'The background must not scroll');
    assert.deepEqual(await popup.locator('.tt-search-suggestions__keyword span:first-of-type').allTextContents(), featured.keywords);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await input.inputValue(), featured.keywords[0]);
    await popup.locator('.tt-search-suggestions__product').first().waitFor();
    await input.fill('a');
    await waitItems(5);
    const tagRows = await popup.locator('.tt-search-suggestions__keyword').evaluateAll(tags => new Set(tags.map(tag => Math.round(tag.getBoundingClientRect().top))).size);
    assert(tagRows <= 2, 'Related keywords must occupy at most two rows');
    const products = popup.locator('.tt-search-suggestions__product');
    assert.deepEqual(await products.evaluateAll(rows => rows.map(row => row.getAttribute('href'))), matches.items.map(item => item.href));
    assert.equal(await popup.locator('.tt-search-suggestions__all').getAttribute('href'), '/tim-kiem?keyword=a');
    const dimensions = await popup.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, overflow: document.documentElement.scrollWidth > innerWidth,
        rows: [...el.querySelectorAll('.tt-search-suggestions__product>span')].map(item => getComputedStyle(item).whiteSpace) };
    });
    assert(dimensions.left >= 0 && dimensions.right <= width + 1);
    assert.equal(dimensions.overflow, false);
    assert(dimensions.rows.every(value => value === 'nowrap'));
    await page.screenshot({ path: `${process.env.TEMP || '.'}/search-suggestions-${width}.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.tt-search-backdrop').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => window.scrollY), alignedScroll);
    await input.click();
    await waitItems(5);
    await popup.getByRole('button', { name: 'Đóng gợi ý tìm kiếm' }).click();
    await popup.waitFor({ state: 'detached' });
    await input.click();
    await waitItems(5);
    await input.fill('no-such-product-7q8z');
    await popup.getByText('Không có kết quả phù hợp.', { exact: true }).waitFor();
    assert.equal(await popup.locator('.tt-search-suggestions__all').count(), 0);
    await input.fill('');
    await popup.locator('.tt-search-suggestions__keyword').first().waitFor();
    await page.mouse.click(4, 300);
    await popup.waitFor({ state: 'detached' });
    assert.equal(await input.evaluate(el => document.activeElement === el), false, 'An outside click must blur the search field');
    await input.click();
    await input.fill('a');
    await waitItems(5);
    for (let index = 0; index <= await popup.locator('.tt-search-suggestions__keyword').count(); index++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(url => url.pathname === matches.items[0].href);
    assert.equal(await popup.count(), 0);

    await page.goto(`${base}/phu-kien-o-to`, { waitUntil: 'domcontentloaded' });
    const accessoryInput = page.locator('input[data-product-search]');
    await accessoryInput.click();
    await popup.locator('.tt-search-suggestions__keyword').first().waitFor();
    await popup.locator('.tt-search-suggestions__keyword').first().click();
    assert.equal(await accessoryInput.inputValue(), featured.keywords[0]);
    await page.keyboard.press('Escape');
    await page.locator('.tt-accessory-filters__search button[type="submit"]').click();
    await page.waitForURL(url => url.searchParams.get('search') === featured.keywords[0]);
    await accessoryInput.click();
    await accessoryInput.fill(accessory.name);
    await popup.locator(`a[href="/phu-kien-o-to/${accessory.id}"]`).waitFor();
    await popup.locator(`a[href="/phu-kien-o-to/${accessory.id}"]`).click();
    await page.waitForURL(url => url.pathname === `/phu-kien-o-to/${accessory.id}`);

    await page.goto(`${base}/tim-kiem?keyword=a`, { waitUntil: 'domcontentloaded' });
    const result = await get('/search?q=a&limit=12');
    assert.equal(await page.locator('.tt-search-results__item').count(), result.data.length);
    if (result.meta.totalPages > 1) {
      await page.waitForFunction(() => {
        const button = document.querySelector('.tt-search-results .car-load-more__button');
        return button && Object.keys(button).some(key => key.startsWith('__reactProps') && typeof button[key]?.onClick === 'function');
      });
      await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('.tt-search-results__item').length > count, result.data.length);
    }
    await page.locator('input[data-product-search]').fill('no-such-product-7q8z');
    await page.locator('.tt-search-page__form button[type="submit"]').click();
    await page.waitForURL(url => url.searchParams.get('keyword') === 'no-such-product-7q8z');
    await page.getByText('Không có kết quả phù hợp.', { exact: true }).waitFor();
    await page.goto(`${base}/`);
    await page.locator('#keyword').click();
    await popup.locator('.tt-search-suggestions__keyword').first().waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS live search at ${width}px: focus, keywords, 5 results, keyboard, close, empty, detail links, controlled accessory input, all results`);
    await page.close();
  }
  // Late results and temporary API failures must never overwrite the current query.
  const page = await browser.newPage();
  await page.addInitScript(() => sessionStorage.setItem('tt-site-intro-seen', '1'));
  let failed = true;
  await page.route('**/api/v1/search/suggestions?*', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'retry' && failed) { failed = false; await route.fulfill({ status: 503, json: {} }); return; }
    if (q === 'old') await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: { keywords: ['Keyword'], total: 1, items: q ? [{ id: q, kind: 'car', name: q, href: `/test-${q}`, imageUrl: null, price: 1 }] : [] } }).catch(() => {});
  });
  await page.goto(`${base}/tim-kiem`);
  const input = page.locator('input[data-product-search]');
  await input.click();
  await input.fill('old');
  await page.waitForRequest(request => request.url().includes('suggestions?q=old'));
  await input.fill('new');
  await page.locator('.tt-search-suggestions__product', { hasText: 'new' }).waitFor();
  await page.waitForTimeout(800);
  assert.deepEqual(await page.locator('.tt-search-suggestions__product>span').allTextContents(), ['new']);
  await input.fill('retry');
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.locator('.tt-search-suggestions__product', { hasText: 'retry' }).waitFor();
  const requests = [];
  page.on('request', request => { if (request.url().includes('/search/suggestions')) requests.push(request.url()); });
  await input.evaluate(el => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'compose');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await page.waitForTimeout(300);
  assert.equal(requests.length, 0);
  await input.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.locator('.tt-search-suggestions__product', { hasText: 'compose' }).waitFor();
  // Small viewports keep the suggestions scrollable while the page stays locked.
  await page.route('**/api/v1/search/suggestions?*', async route => {
    await route.fulfill({ json: { keywords: Array.from({ length: 12 }, (_, index) => `Featured car ${index}`), items: [], total: 0 } });
  });
  await page.setViewportSize({ width: 390, height: 480 });
  await input.fill('');
  await page.locator('.tt-search-suggestions__keyword').nth(7).waitFor({ state: 'attached' });
  const options = page.locator('.tt-search-suggestions__options');
  await options.hover();
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(() => document.querySelector('.tt-search-suggestions__options').scrollTop > 0);
  assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
  await page.locator('.tt-search-backdrop').click({ position: { x: 5, y: 5 } });
  await page.locator('#tt-product-search-popup').waitFor({ state: 'detached' });
  assert.equal(await input.evaluate(el => document.activeElement === el), false);
  assert.equal(await page.evaluate(() => document.body.style.position), '');
  assert.equal(await page.locator('.tt-search-backdrop').count(), 0);
  console.log('PASS stale response cancellation, retry and IME input');
  console.log('PASS backdrop, header alignment, page scroll lock, scrollable suggestions and cleanup');
  await page.close();
} finally { await browser.close(); }
