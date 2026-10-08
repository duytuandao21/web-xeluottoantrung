import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const init = () => {
  window.__documentMarker = crypto.randomUUID();
  window.__articleAnimations = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    if (this.closest('.tt-article-motion')) window.__articleAnimations.push({
      section: this.closest('section').id, body: this.matches('.tt-article-motion__body'), duration: options?.duration,
    });
    return animate.call(this, frames, options);
  };
};

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /unique.*key|Check the render method|hydration/i.test(message.text())) errors.push(message.text());
    });
    await page.addInitScript(init);
    await page.goto(`${base}/bai-viet?cau-hoi-page=2`);
    await page.waitForFunction(() => document.querySelector('#muc-tin-tuc .tt-article-preview')?.dataset.articleReveal === 'visible');
    const marker = await page.evaluate(() => window.__documentMarker);
    const below = page.locator('#muc-kinh-nghiem > h2');
    assert.equal(await below.getAttribute('data-article-reveal'), 'pending');
    await below.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#experience-section-title').dataset.articleReveal === 'visible');
    assert((await page.evaluate(() => window.__articleAnimations)).some(animation => animation.section === 'muc-kinh-nghiem'));
    const next = page.locator('#muc-tin-tuc .tt-section-pagination a[rel="next"]');
    assert(await next.count(), 'News needs a second page for the navigation check');
    const previousTitles = await page.locator('#muc-tin-tuc h3').allTextContents();
    await next.click();
    await page.waitForFunction(() => document.querySelector('#muc-tin-tuc').dataset.articlePage === '2');
    assert.equal(new URL(page.url()).searchParams.get('cau-hoi-page'), '2');
    assert.equal(await page.locator('#muc-cau-hoi').getAttribute('data-article-page'), '2');
    assert.equal(await page.evaluate(() => window.__documentMarker), marker);
    assert.notDeepEqual(await page.locator('#muc-tin-tuc h3').allTextContents(), previousTitles);
    assert.equal(await page.locator('#muc-tin-tuc .is-active[aria-current="page"]').innerText(), '2');
    assert((await page.evaluate(() => window.__articleAnimations)).some(animation => animation.body && animation.section === 'muc-tin-tuc'));
    assert(!(await page.evaluate(() => window.__articleAnimations)).some(animation => animation.body && animation.section !== 'muc-tin-tuc'));
    await page.waitForFunction(() => document.querySelector('#muc-tin-tuc .tt-article-motion__body').style.overflow === '');
    assert.equal(await page.locator('#muc-tin-tuc .tt-article-motion__body').getAttribute('aria-busy'), 'false');
    await page.waitForFunction(() => {
      const top = document.querySelector('#muc-tin-tuc').getBoundingClientRect().top;
      return top >= 0 && top < 170;
    });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'news-section-title');
    assert.equal(await page.locator('#muc-tin-tuc .tt-article-motion__status').innerText(), 'Tin tức: trang 2');
    if (width === 1440) {
      await page.locator('#muc-tin-tuc .tt-article-preview').first().hover();
      await page.waitForFunction(() => {
        const transform = getComputedStyle(document.querySelector('#muc-tin-tuc .tt-article-preview')).transform;
        return transform !== 'none' && new DOMMatrix(transform).m42 < -2;
      });
    }
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#muc-tin-tuc').dataset.articlePage === '1');
    assert.equal(await page.evaluate(() => window.__documentMarker), marker);
    assert.equal(new URL(page.url()).searchParams.get('cau-hoi-page'), '2');
    assert.deepEqual(errors, []);
    console.log(`Passed ${width}px: scroll reveal, pagination fade, client navigation, other-section state, smooth scroll, focus and history`);
    await page.close();
  }

  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 900 } });
  await reduced.addInitScript(init);
  await reduced.goto(`${base}/bai-viet`);
  await reduced.locator('#muc-tin-tuc .tt-section-pagination a[rel="next"]').click();
  await reduced.waitForFunction(() => document.querySelector('#muc-tin-tuc').dataset.articlePage === '2');
  assert.equal(await reduced.evaluate(() => window.__articleAnimations.length), 0);
  assert.equal(await reduced.locator('[data-article-reveal="pending"]').count(), 0);
  await reduced.close();

  const noScript = await browser.newPage({ javaScriptEnabled: false });
  await noScript.goto(`${base}/bai-viet`);
  assert(await noScript.locator('#muc-tin-tuc .tt-article-preview').first().isVisible());
  await noScript.locator('#muc-tin-tuc .tt-section-pagination a[rel="next"]').click();
  assert.equal(await noScript.locator('#muc-tin-tuc').getAttribute('data-article-page'), '2');
  assert(await noScript.locator('#muc-tin-tuc .tt-article-preview').first().isVisible());
  await noScript.close();
  console.log('Passed reduced motion and navigation without JavaScript');
} finally { await browser.close(); }
