import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const web = process.env.TEST_BASE_URL || 'http://localhost:3001';
const api = process.env.TEST_API_URL || 'http://localhost:4000/api/v1';
const list = await fetch(`${api}/cars?limit=100`).then(response => response.json());
const branches = await fetch(`${api}/lookups/branches?limit=100`).then(response => response.json());
const candidate = list.data.find(car => car.branch);
assert(candidate);
const car = await fetch(`${api}/cars/${candidate.slug}`).then(response => response.json());
const branch = branches.data.find(item => item.slug === car.branch.slug);
assert(branch);
assert.equal(car.branch.imageUrl, branch.imageUrl, 'The car endpoint exposes the managed branch image');
assert.equal(car.branch.address, branch.address);
assert.equal(car.branch.phone, branch.phone);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 768 });
    await context.route('**/*', route => route.request().headers()['next-router-prefetch'] === '1' ? route.abort() : route.continue());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await page.goto(`${web}/${car.slug}`);
      if (response.status() === 200) break;
      if (attempt < 2) await page.waitForTimeout(35000);
    }
    assert.equal(response.status(), 200);
    const card = page.locator('.vehicle-detail-sidebar .tt-installation-store--branch');
    await card.waitFor();
    assert.equal(await card.locator('h2').innerText(), branch.name);
    assert.equal(await card.locator('.tt-installation-store__location-row p').innerText(), branch.address);
    assert.equal(await card.locator('a[href^="tel:"]').getAttribute('href'), `tel:${branch.phone.replace(/[^+\d]/g, '')}`);
    assert.equal(await card.getByRole('link', { name: 'Xem vị trí chi nhánh' }).getAttribute('href'), branch.mapUrl);
    if (branch.imageUrl) assert.equal(await card.locator('img.tt-installation-store__cover').getAttribute('src'), branch.imageUrl);
    else assert.equal(await card.locator('.tt-installation-store__cover--empty').count(), 1);
    const sizes = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return { gallery: rect('.vehicle-detail-content > .left-pro-detail').width,
        overview: rect('#tong-quan-ve-xe').width, description: rect('#mo-ta-chi-tiet').width,
        info: rect('.vehicle-detail-sidebar > .right-pro-detail').width,
        card: rect('.tt-installation-store--branch').width,
        pageWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    assert(Math.abs(sizes.gallery - sizes.overview) <= 1);
    assert(Math.abs(sizes.gallery - sizes.description) <= 1);
    assert(Math.abs(sizes.info - sizes.card) <= 1);
    assert(sizes.pageWidth <= sizes.viewport + 1, 'No horizontal overflow');
    if (width > 900) {
      assert.equal(await card.evaluate(element => getComputedStyle(element).position), 'sticky');
      // Exercise a long admin-authored description without changing database content.
      await page.locator('#mo-ta-chi-tiet').evaluate(element => { element.style.minHeight = '2200px'; });
      await card.evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + scrollY + 250));
      await page.waitForTimeout(300);
      assert(Math.abs((await card.boundingBox()).y - 100) < 2, 'Card follows the viewport');
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(300);
      assert(Math.abs((await card.boundingBox()).y - 100) < 2, 'Card remains sticky');
      const end = await page.locator('#mo-ta-chi-tiet').evaluate(element => element.getBoundingClientRect().bottom + scrollY);
      await page.evaluate(end => window.scrollTo(0, end - 180), end);
      await page.waitForTimeout(300);
      const box = await card.boundingBox();
      assert(box.y < 100, 'Card stops following at the end of the description');
      const related = await page.locator('.quantam').boundingBox();
      assert(box.y + box.height <= related.y + 1, 'Card never overlaps related vehicles');
      await page.locator('#mo-ta-chi-tiet').evaluate(element => element.style.removeProperty('min-height'));
    } else {
      assert.equal(await card.evaluate(element => getComputedStyle(element).position), 'static');
      const order = await page.evaluate(() => {
        const top = selector => document.querySelector(selector).getBoundingClientRect().top;
        return [top('.left-pro-detail'), top('.vehicle-detail-sidebar'), top('#tong-quan-ve-xe'), top('#mo-ta-chi-tiet')];
      });
      assert(order.every((top, index) => !index || top >= order[index - 1]), 'Readable mobile section order');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.vehicle-detail-overview__more').click();
    await page.locator('.migrated-dialog #tskt').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.right-pro-detail .c_goilai').click();
    await page.locator('.migrated-dialog #goilai').waitFor();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.next/vehicle-branch-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Passed ${width}px: managed branch data, aligned columns, ${width > 900 ? 'sticky card and description boundary' : 'mobile order and static card'}, specifications and callback dialogs.`);
    await context.close();
  }
} finally { await browser.close(); }
