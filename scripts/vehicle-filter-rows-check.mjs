import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const get = async (path, query = {}) => {
  const response = await fetch(`${base}/api/v1${path}?${new URLSearchParams(query)}`);
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
};
const models = await get('/brands/mitsubishi/models');
const model = models.find(item => item.slug === 'outlander');
assert(model, 'Outlander fixture must exist');
const versions = (await get('/lookups/car-versions', { modelId: model.id, limit: 100 })).data;
const cars = (await get('/cars', { brand: 'mitsubishi', model: model.slug, limit: 100 })).data;
const years = [...new Set(cars.map(car => car.year))].sort((a, b) => b - a);
assert(years.length > 1, 'Fixture must contain multiple production years');
assert(versions.length, 'Fixture must contain a version');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 760, isMobile: width < 760 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /unique.*key|hydration|cannot update/i.test(message.text())) errors.push(message.text());
    });
    await page.addInitScript(() => sessionStorage.setItem('tt-site-intro-seen', '1'));
    const row = name => page.locator(`[data-vehicle-row="${name}"]`);
    const ready = async () => {
      await page.waitForFunction(() => {
        const panel = document.querySelector('.vehicle-filter-panel');
        if (!panel || panel.getAttribute('aria-busy') !== 'false') return false;
        const current = new URL(location.href);
        const rendered = new URL(panel.dataset.filterBase, location.origin);
        return ['hang-xe', 'dong-xe', 'phien-ban', 'nam-san-xuat', 'keyword'].every(key => current.searchParams.get(key) === rendered.searchParams.get(key));
      });
    };
    const choose = async (locator, key, value) => {
      await locator.click();
      await page.waitForURL(url => url.searchParams.get(key) === value);
      await ready();
    };
    await page.goto(`${base}/san-pham?gia=gia%20asc&so-km=0-999999`);
    await ready();
    assert.deepEqual(await page.locator('.vehicle-filter-row').evaluateAll(rows => rows.map(row => row.dataset.vehicleRow)), ['filters', 'brands']);
    assert.equal(await page.locator('.vehicle-smart').count(), 0);
    assert(await page.locator('.vehicle-search-row').evaluate(el => el.nextElementSibling?.dataset.vehicleRow === 'filters'));
    await choose(page.locator('.vehicle-brands__option[href*="hang-xe=mitsubishi"]'), 'hang-xe', 'mitsubishi');
    assert.equal(await row('models').count(), 1);
    assert.equal(await row('versions').count(), 0);
    assert.deepEqual(await row('models').locator('a').allTextContents(), ['Tất cả', ...models.map(item => item.name)]);
    await choose(row('models').locator('a', { hasText: /^Outlander$/ }), 'dong-xe', model.slug);
    assert.deepEqual(await page.locator('.vehicle-filter-row').evaluateAll(rows => rows.map(row => row.dataset.vehicleRow)), ['filters', 'brands', 'models', 'versions', 'years']);
    assert.deepEqual(await row('versions').locator('a').allTextContents(), ['Tất cả', ...versions.map(item => item.name)]);
    assert.deepEqual(await row('years').locator('a').allTextContents(), ['Tất cả', ...years.map(String)]);
    await choose(row('versions').locator('a', { hasText: versions[0].name, exact: true }), 'phien-ban', versions[0].slug);
    const chosenYear = years.at(-1);
    await choose(row('years').locator('a', { hasText: String(chosenYear), exact: true }), 'nam-san-xuat', `${chosenYear}-${chosenYear}`);
    const expected = await get('/cars', { brand: 'mitsubishi', model: model.slug, version: versions[0].slug,
      year_from: chosenYear, year_to: chosenYear, mileage_min: 0, mileage_max: 999999, sort: 'price_asc', limit: 6 });
    assert(expected.data.length, 'Selected year and version must contain cars');
    assert.deepEqual(await page.locator('.vehicle-results > .item').evaluateAll(items => items.map(item => item.dataset.carId)), expected.data.map(car => car.slug));
    assert.deepEqual(await row('years').locator('a').allTextContents(), ['Tất cả', ...years.map(String)], 'Year options must remain available after choosing a year');
    assert.equal(await row('years').locator('a.is-selected').textContent(), String(chosenYear));
    assert(await page.locator('.vehicle-filter-chip.is-selected').filter({ hasText: String(chosenYear) }).count());

    for (const name of ['models', 'versions', 'years']) {
      const layout = await row(name).locator('.vehicle-filter-options').evaluate(track => ({
        rows: [...track.children].map(item => item.offsetTop),
        scrollbar: getComputedStyle(track).scrollbarWidth,
      }));
      assert.equal(new Set(layout.rows).size, 1, `${name} choices must be one row`);
      if (width < 760) assert.equal(layout.scrollbar, 'none');
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    // Quick filters remain usable inside the horizontal row, with an unclipped popover.
    const mileageChip = page.locator('[aria-controls="vehicle-filter-so-km"]');
    await mileageChip.click();
    const popover = page.locator('#vehicle-filter-so-km');
    await popover.waitFor({ state: 'visible' });
    assert(await popover.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && document.elementFromPoint(rect.left + 20, rect.top + 20)?.closest('.vehicle-filter-popover') === el;
    }), 'Quick filter popover must be visible outside the scrolling track');
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden' });

    // Changing a parent clears dependent exact selections and preserves other filters.
    await choose(row('models').locator('a', { hasText: /^Xforce$/ }), 'dong-xe', 'xforce');
    assert.equal(new URL(page.url()).searchParams.has('phien-ban'), false);
    assert.equal(new URL(page.url()).searchParams.has('nam-san-xuat'), false);
    assert.equal(new URL(page.url()).searchParams.get('gia'), 'gia asc');
    assert.equal(new URL(page.url()).searchParams.get('so-km'), '0-999999');
    assert.equal(await row('models').locator('.is-selected').textContent(), 'Xforce');
    const selectedVisibility = await row('models').locator('.is-selected').evaluate(el => {
      const track = el.parentElement.getBoundingClientRect(), rect = el.getBoundingClientRect();
      return rect.left >= track.left - 1 && rect.right <= track.right + 1;
    });
    assert(selectedVisibility, 'Selected model must be scrolled into view');
    await choose(page.locator('.vehicle-brands__option[href*="hang-xe=mazda"]'), 'hang-xe', 'mazda');
    assert.equal(new URL(page.url()).searchParams.has('dong-xe'), false);
    assert.equal(await row('versions').count(), 0);
    assert.equal(await row('years').count(), 0);

    await page.locator('.vehicle-filter-panel__open').click();
    await page.locator('.wap_boloc_active .goiy_hangxe').waitFor({ state: 'visible' });
    await page.locator('.close_boloc').click();
    await page.locator('.vehicle-search__reset').click();
    await page.waitForURL(url => url.pathname === '/san-pham' && !url.search);
    await ready();
    assert.deepEqual(await page.locator('.vehicle-filter-row').evaluateAll(rows => rows.map(row => row.dataset.vehicleRow)), ['filters', 'brands']);
    assert.equal(await page.locator('.vehicle-brands__option.is-selected').count(), 0);

    await page.goto(`${base}/san-pham?hang-xe=mitsubishi&dong-xe=outlander&phien-ban=${versions[0].slug}`);
    await ready();
    assert(await page.locator('.vehicle-brands__option.is-selected').evaluate(el => {
      const track = el.parentElement.getBoundingClientRect(), rect = el.getBoundingClientRect();
      return rect.left >= track.left - 1 && rect.right <= track.right + 1;
    }), 'Selected brand must be scrolled into view on a direct visit');
    await page.locator('.vehicle-filter-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.next/vehicle-filter-rows-${width}.png`, fullPage: false });
    assert.deepEqual(errors, []);
    console.log(`Passed ${width}px: row hierarchy, database models/versions/descending years, real filtered cars, dependency resets, preserved quick filters, visible popovers, modal, reset and responsive layout.`);
    await page.close();
  }
} finally { await browser.close(); }
