import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { articleHubHref, articlePageNumber, articlePageLinks } from '../lib/article-pagination.ts';

assert.equal(articleHubHref({ 'tin-tuc-page': 2, 'cau-hoi-page': 3 }, 'tin-tuc-page', 4), '/bai-viet?tin-tuc-page=4&cau-hoi-page=3#muc-tin-tuc');
assert.equal(articleHubHref({ 'tin-tuc-page': 2, 'cau-hoi-page': 3 }, 'cau-hoi-page', 1), '/bai-viet?tin-tuc-page=2#muc-cau-hoi');
assert.equal(articleHubHref({ 'tin-tuc-page': 1, 'cau-hoi-page': 1 }, 'tin-tuc-page', 1), '/bai-viet#muc-tin-tuc');
assert.equal(articleHubHref({ 'tin-tuc-page': 2, 'cau-hoi-page': 3, 'kinh-nghiem-page': 2 }, 'tin-tuc-page', 1), '/bai-viet?cau-hoi-page=3&kinh-nghiem-page=2#muc-tin-tuc');
assert.equal(articleHubHref({ 'tin-tuc-page': 2, 'cau-hoi-page': 3, 'kinh-nghiem-page': 2 }, 'kinh-nghiem-page', 4), '/bai-viet?tin-tuc-page=2&cau-hoi-page=3&kinh-nghiem-page=4#muc-kinh-nghiem');
assert.deepEqual(articlePageLinks(50, 100), [1, 49, 50, 51, 100]);
assert.deepEqual(articlePageLinks(1, 3), [1, 2, 3]);
assert.deepEqual(articlePageLinks(3, 3), [1, 2, 3]);
for (const invalid of ['0', '-1', 'NaN', '999999999999999999999']) assert.equal(articlePageNumber(invalid), 1);
assert.equal(articlePageNumber(['3', '4']), 3);
console.log('Passed independent pagination, page boundaries and invalid input');

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const response = await page.goto(`${base}/tin-tuc`);
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/bai-viet');
    assert.equal(await page.locator('.tt-article-hub > .title-main').count(), 0);
    assert.deepEqual(await page.locator('.tt-article-hub__section > h2').allTextContents(), ['Tin tức', 'Câu hỏi thường gặp', 'Kinh nghiệm sử dụng xe ô tô']);
    const menu = page.locator(width === 1440 ? '.wap_header a[href="/bai-viet"]' : '.menu_mobi_add a[href="/bai-viet"]');
    assert.equal(await menu.innerText(), 'Bài viết');
    assert.match(await menu.getAttribute('class'), /active/);
    assert(await page.locator('.tt-article-hub').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
    for (const [section, endpoint] of [['muc-tin-tuc', 'articles'], ['muc-cau-hoi', 'faqs'], ['muc-kinh-nghiem', 'driving-experiences']]) {
      const result = await page.request.get(`${base}/api/v1/${endpoint}?page=1&limit=4`).then(response => response.json());
      assert.equal(await page.locator(`#${section} .tt-article-preview`).count(), result.data.length);
      assert.equal(await page.locator(`#${section} .tt-section-pagination`).count(), result.meta.totalPages > 1 ? 1 : 0);
      if (result.meta.totalPages > 1) assert.equal(await page.locator(`#${section} .tt-section-pagination`).evaluate(element => getComputedStyle(element).justifyContent), 'flex-end');
    }
    const firstArticle = page.locator('#muc-tin-tuc h3 a').first();
    if (await firstArticle.count()) {
      await firstArticle.click();
      await page.locator('.tt-article').waitFor();
      assert.equal(await page.locator('.tt-article__meta a').first().getAttribute('href'), '/bai-viet#muc-tin-tuc');
    }
    await page.goto(`${base}/`);
    assert.equal(await page.locator('.tt-home-news .tt-home-news-all').getAttribute('href'), '/bai-viet');
    console.log(`Passed ${width}px: old URL redirect, header, sections, data, article return link and homepage button`);
    await page.close();
  }
} finally { await browser.close(); }
