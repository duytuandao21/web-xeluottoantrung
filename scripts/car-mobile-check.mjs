import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const realImages = process.argv.includes('--real-images');
const catalog = await fetch(`${base}/api/v1/cars?limit=6`).then(response => response.json());
const details = await Promise.all(catalog.data.map(car => fetch(`${base}/api/v1/cars/${car.slug}`).then(response => response.json())));
const candidate = details.find(car => car.media.length > 1);
assert(candidate, 'Need a car with multiple images in the first six results.');
const imageUrls = new Set(details.flatMap(car => car.media.map(image => image.url)));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of realImages ? [390] : [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true, ignoreHTTPSErrors: true });
    if (!realImages) await page.route('**/*', route => imageUrls.has(route.request().url())
      ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ccd3de"/></svg>' }) : route.continue());
    await page.goto(`${base}/san-pham`);
    await page.locator('#ngansach-range .ui-slider-handle').first().waitFor({ state: 'attached' });
    const cards = page.locator('.vehicle-results > .item');
    const sizes = await cards.evaluateAll(items => items.slice(0, 2).map(item => {
      const rect = item.getBoundingClientRect();
      const image = item.querySelector('.slick-slide[data-current="true"] img').getBoundingClientRect();
      return { top: rect.top, width: rect.width, height: rect.height, imageWidth: image.width, imageHeight: image.height,
        title: getComputedStyle(item.querySelector('.name_sp a')).fontSize, price: getComputedStyle(item.querySelector('.gia_sp b')).fontSize };
    }));
    assert.equal(sizes[0].top, sizes[1].top);
    assert.equal(sizes[0].title, '15px');
    assert.equal(sizes[0].price, '18px');
    assert(Math.abs(sizes[0].imageHeight / sizes[0].imageWidth - 0.8) < 0.01);
    assert(sizes[0].height < 350);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.vehicle-results .slick-arrow:visible').count(), 0);

    const card = page.locator(`.vehicle-results [data-car-id="${candidate.slug}"]`);
    const gallery = card.locator('.car-card-gallery__viewport');
    const current = card.locator('.slick-slide[data-current="true"] img');
    await gallery.scrollIntoViewIfNeeded();
    await current.waitFor({ state: 'visible' });
    const original = await current.getAttribute('src');
    const cdp = await page.context().newCDPSession(page);
    async function swipe(direction, vertical = false) {
      const rect = await gallery.boundingBox();
      const x = rect.x + rect.width * (direction === 1 ? 0.85 : 0.15);
      const y = rect.y + rect.height * 0.5;
      const dx = vertical ? 4 : rect.width * 0.7 * -direction;
      const dy = vertical ? -65 : 0;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const url = page.url();
    await swipe(1);
    await page.waitForFunction(({ slug, original }) => {
      const card = document.querySelector(`.vehicle-results [data-car-id="${slug}"]`);
      return card.querySelector('.slick-slide[data-current="true"] img').getAttribute('src') !== original && !card.querySelector('.is-moving');
    }, { slug: candidate.slug, original });
    assert.equal(page.url(), url, 'Swiping must not open the car detail page.');
    await swipe(-1);
    await page.waitForFunction(({ slug, original }) => document.querySelector(`.vehicle-results [data-car-id="${slug}"] .slick-slide[data-current="true"] img`).getAttribute('src') === original, { slug: candidate.slug, original });
    await swipe(1, true);
    assert.equal(await current.getAttribute('src'), original, 'Vertical scrolling must not change the car image.');
    assert.equal(page.url(), url);
    if (realImages && width === 390) {
      await cards.first().evaluate(item => scrollTo({ top: scrollY + item.getBoundingClientRect().top - 125, behavior: 'instant' }));
      await page.screenshot({ path: '.next/car-mobile-readable.png' });
    }
    await page.goto(base);
    const homeTop = await page.locator('.loadthem_sp1 > .item').evaluateAll(items => items.slice(0, 2).map(item => item.getBoundingClientRect().top));
    assert.equal(homeTop[0], homeTop[1]);
    assert.equal(await page.locator('.loadthem_sp1 .slick-arrow:visible').count(), 0);
    console.log(`Passed ${width}px: two columns, larger text/images, no overflow, hidden arrows, swipe both ways and vertical scrolling.`);
    await page.close();
  }
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${base}/san-pham`);
  assert(await desktop.locator('.vehicle-results .slick-arrow:visible').count() > 0);
  console.log('Passed desktop gallery arrows.');
} finally { await browser.close(); }
