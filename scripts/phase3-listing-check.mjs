import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const b = await chromium.launch({ channel: 'chrome', headless: true }), records = [];
try {
  for (const width of [1440, 390]) {
    const p = await b.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 }), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const r = await p.goto(base + '/san-pham', { waitUntil: 'networkidle', timeout: 120000 });
    assert.equal(r.status(), 200); assert.equal(await p.locator('.vehicle-results > .item').count(), 6);
    const html = await r.text(); assert(html.includes('car-load-more__button'), 'Listing controls must exist in SSR HTML');
    await p.locator('#vehicle-sort').selectOption('gia asc');
    await p.waitForURL(u => u.searchParams.get('gia') === 'gia asc');
    await p.locator('.vehicle-filter-panel[aria-busy="false"]').waitFor();
    await p.locator('.car-load-more__button').click();
    await p.waitForFunction(() => document.querySelectorAll('.vehicle-results > .item').length === 12, null, { timeout: 60000 });
    assert.deepEqual(errors, []);
    records.push({ width, ssr: 'PASS', sort: 'PASS', loadMore: '6 -> 12', errors });
    console.log(`PASS listing ${width}: SSR controls, sort navigation, 6 -> 12 cars`); await p.close();
  }
} finally { fs.writeFileSync('../toi-uu-hieu-suat-website/phase-3/listing-check.json', JSON.stringify(records, null, 2)); await b.close(); }
