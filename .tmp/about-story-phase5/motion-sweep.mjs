import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.route(/https:\/\/cdn\.toantrungxeluot\.io\.vn\/.*ea9236a66bd8731eff71456b3663688d059e8a35eca1b31bdb38dfe544aa0f27\.jpg/, route =>
  route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:3111/ve-chung-toi', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tt-story__story-viewport')?.getAttribute('data-pinned') === 'true');
  const start = await page.evaluate(() => {
    const spacer = document.querySelector('.tt-story__story-viewport')?.parentElement;
    return spacer.getBoundingClientRect().top + scrollY - 80;
  });
  const samples = [];
  for (const delta of [0, 350, 800, 1200, 350, 0]) {
    await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), start + delta);
    await page.waitForTimeout(180);
    if (delta === 800) await page.screenshot({ path: '.tmp/about-story-phase5/desktop-gallery.png' });
    samples.push(await page.evaluate(() => ({
      scrollY, x: new DOMMatrix(getComputedStyle(document.querySelector('.tt-story__story-grid')).transform).m41,
      active: document.querySelectorAll('.tt-story__milestone--active').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
    })));
  }
  assert.ok(samples[2].x < samples[1].x - 100, 'horizontal sequence advances');
  assert.ok(samples[4].x > samples[3].x + 100, 'reverse scroll restores sequence');
  assert.ok(samples.every(row => row.overflow <= 1), 'no horizontal overflow while pinned');
  await page.locator('.tt-story__story-card article').last().focus();
  await page.waitForTimeout(200);
  const focusScroll = await page.evaluate(() => scrollY);
  assert.ok(focusScroll > start + 400, 'keyboard focus advances to last story');
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(300);
  const afterResize = await page.evaluate(() => ({ pinned: document.querySelector('.tt-story__story-viewport')?.getAttribute('data-pinned'), overflow: document.documentElement.scrollWidth - innerWidth }));
  assert.equal(afterResize.pinned, null, 'short viewport falls back to native horizontal scroll');
  assert.ok(afterResize.overflow <= 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.tt-story').getAttribute('data-motion'), null, 'reduced motion reverts enhancements');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('.tt-story')?.getAttribute('data-motion') === 'on');
  await page.goto('http://127.0.0.1:3111/ve-chung-toi?phase5=1', { waitUntil: 'domcontentloaded' });
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tt-story')?.getAttribute('data-motion') === 'on');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ start, samples, focusScroll, afterResize, backNavigation: 'pass', reducedMotionToggle: 'pass', errors }, null, 2));
} finally { await browser.close(); }
