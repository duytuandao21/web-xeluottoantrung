import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rows = [];
for (const hash of ['', '#tt-story-stories-title']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver(list => list.getEntries().forEach(entry => {
      if (!entry.hadRecentInput) window.__shifts.push({ value: entry.value, time: entry.startTime,
        sources: entry.sources?.map(source => source.node?.className || source.node?.nodeName) });
    })).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:3111/ve-chung-toi${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tt-story')?.getAttribute('data-motion') === 'on');
  await page.waitForTimeout(700);
  rows.push({ hash, result: await page.evaluate(() => ({ scrollY, shifts: window.__shifts,
    pinned: document.querySelector('.tt-story__story-viewport')?.getAttribute('data-pinned'),
    cls: window.__shifts.reduce((sum, item) => sum + item.value, 0) })) });
  await context.close();
}
await browser.close();
console.log(JSON.stringify(rows, null, 2));
assert.ok(rows[1].result.cls < 0.01, 'deep link must not shift the story section when motion loads');
assert.equal(rows[1].result.pinned, null, 'deep link uses native horizontal gallery');
