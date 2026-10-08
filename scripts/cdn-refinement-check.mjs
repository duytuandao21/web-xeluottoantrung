import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const out = '../toi-uu-hieu-suat-website/cdn-rollout';
const previous = JSON.parse(fs.readFileSync(`${out}/browser-after.json`, 'utf8'));
const routes = previous.routes.filter((_, i) => [1, 2, 3, 4].includes(i));
const result = { buildId: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(), records: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const route of routes) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 390 ? 3 : 2, hasTouch: width === 390 });
    const page = await context.newPage(), errors = [], failures = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.request().resourceType() === 'image' && r.status() >= 400) failures.push(r.url()); });
    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
    const selectors = route === '/san-pham' ? '.vehicle-brands img' : route === '/phu-kien-o-to' ? '.tt-accessory-brand img' : '.tt-installation-store__logo img';
    let images = page.locator(selectors);
    // The accessory filter uses a different class from its product cards.
    if (route === '/phu-kien-o-to' && !await images.count()) images = page.locator('img[sizes="78px"]');
    assert(await images.count(), `Expected refined images on ${route}`);
    // Off-screen horizontal filter logos are lazy; trigger each before decode.
    for (let i = 0; i < await images.count(); i++) {
      await images.nth(i).scrollIntoViewIfNeeded();
      await images.nth(i).evaluate(img => Promise.race([
        img.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image decode timeout')), 20000))
      ]));
    }
    const values = await images.evaluateAll(els => els.map(i => {
      const r = i.getBoundingClientRect();
      return { src: i.getAttribute('data-image-original'), currentSrc: i.currentSrc, sizes: i.sizes, width: r.width, height: r.height, naturalWidth: i.naturalWidth };
    }));
    const old = previous.records.find(r => r.route === route && r.width === width);
    for (const value of values) {
      assert(value.currentSrc.startsWith('https://cdn.toantrungxeluot.io.vn/'));
      if (value.currentSrc.includes('/cdn-cgi/image/')) {
        const options = value.currentSrc.split('/cdn-cgi/image/')[1].split('/')[0];
        assert(Number(options.match(/width=(\d+)/)[1]) <= 320, value.currentSrc);
        assert(options.includes('quality=90'), value.currentSrc);
      }
      assert(value.naturalWidth > 0);
      // Header and store identity can share a logo; compare the matching box.
      const before = old.all.filter(i => i.src === value.src)
        .sort((a, b) => Math.abs(a.width - value.width) - Math.abs(b.width - value.width))[0];
      assert(before, value.src);
      if (before.ready && before.width && before.height) {
        for (const axis of ['width', 'height']) assert(Math.abs(before[axis] - value[axis]) <= 1 / 16, `${route} ${axis}`);
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    result.records.push({ route, width, values, errors, failures });
    console.log(`PASS refined image sizes and layout: ${route} ${width}`);
    await context.close();
  }
} finally {
  fs.writeFileSync(`${out}/refinement-check.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
