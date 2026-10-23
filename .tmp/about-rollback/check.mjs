import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const runs = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1 },
  { name: 'laptop', width: 1024, height: 768, dpr: 1 },
  { name: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'mobile-360', width: 360, height: 780, dpr: 3, mobile: true },
  { name: 'tablet', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'reduced', width: 1440, height: 900, dpr: 1, reduced: true },
  { name: 'no-js', width: 390, height: 844, dpr: 3, noJs: true },
];
const rows = [];
try {
  for (const run of runs) {
    const context = await browser.newContext({ viewport: { width: run.width, height: run.height },
      deviceScaleFactor: run.dpr, isMobile: !!run.mobile, hasTouch: !!run.mobile,
      reducedMotion: run.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: !run.noJs,
      serviceWorkers: 'block' });
    await context.route(/https:\/\/cdn\.toantrungxeluot\.io\.vn\/.*ea9236a66bd8731eff71456b3663688d059e8a35eca1b31bdb38dfe544aa0f27\.jpg/, route =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto('http://127.0.0.1:3111/ve-chung-toi', { waitUntil: 'domcontentloaded' });
    await page.locator('.tt-story__hero').waitFor();
    if (!run.reduced && !run.noJs) await page.waitForFunction(() => document.querySelector('.tt-story')?.getAttribute('data-motion') === 'on');
    await page.waitForTimeout(1500);
    await page.screenshot({path: `.tmp/about-rollback/${run.name}-hero.png`});
    assert.equal(await page.locator('.tt-story__chapter-nav, .tt-story__hero-photo, .tt-story canvas').count(), 0);
    assert.equal(await page.locator('.tt-story__hero-shade').count(), 1);
    await page.locator('#tt-story-history').scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    const history = await page.evaluate(() => ({
      motion: document.querySelector('.tt-story')?.getAttribute('data-motion'),
      h1: document.querySelectorAll('.tt-story h1').length,
      milestones: document.querySelectorAll('.tt-story__milestone').length,
      progress: document.querySelector('.tt-story__timeline')?.style.getPropertyValue('--story-progress'),
      overflow: document.documentElement.scrollWidth - innerWidth,
      storyCards: document.querySelectorAll('.tt-story__story-card').length,
    }));
    if (!run.reduced && !run.noJs) {
      await page.evaluate(() => {
        const milestone = document.querySelector('.tt-story__milestone');
        scrollTo({ top: milestone.getBoundingClientRect().top + scrollY - innerHeight * 0.5, behavior: 'instant' });
      });
      await page.waitForTimeout(250);
      history.activeMilestones = await page.locator('.tt-story__milestone--active').count();
      await page.locator('.tt-story__stories').scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
    }
    await page.screenshot({path: `.tmp/about-rollback/${run.name}-stories.png`});
    const story = await page.evaluate(() => ({
      pinned: document.querySelector('.tt-story__story-viewport')?.getAttribute('data-pinned'),
      scrollWidth: document.querySelector('.tt-story__story-grid')?.scrollWidth,
      clientWidth: document.querySelector('.tt-story__story-grid')?.clientWidth,
      sectionHeight: document.querySelector('.tt-story__stories')?.getBoundingClientRect().height,
      gridHeight: document.querySelector('.tt-story__story-grid')?.getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.equal(response?.status(), 200, run.name);
    assert.equal(history.h1, 1, run.name);
    assert.equal(history.milestones, 12, run.name);
    assert.equal(history.storyCards, 3, run.name);
    assert.ok(history.overflow <= 1 && story.overflow <= 1, `${run.name} horizontal overflow`);
    assert.equal(history.motion, run.reduced || run.noJs ? null : 'on', run.name);
    if (!run.noJs && !run.reduced) assert.ok(history.progress !== '', `${run.name} timeline progress`);
    if (!run.noJs && !run.reduced) assert.ok(history.activeMilestones >= 1, `${run.name} active milestone`);
    if (run.mobile) assert.equal(story.pinned, null, 'mobile does not pin stories');
    if (run.name === 'desktop' || run.name === 'laptop') assert.equal(story.pinned, 'true', `${run.name} pins gallery`);
    assert.deepEqual(errors, [], run.name);
    rows.push({ name: run.name, history, story, errors });
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(rows, null, 2));
