import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Read-only browser regression: use a local frontend, preferably with fixture data.
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local frontend');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const state = page => page.locator('.tt-home-services').evaluate(el => ({
  tab: el.querySelector('[role="tab"][aria-selected="true"]').id,
  step: Number(el.dataset.activeStep),
}));
const stagger = page => page.locator('.tt-home-services .dichvu:not([hidden]) .tt-home-service-step').evaluateAll(items =>
  items.flatMap(item => item.getAnimations().map(animation => animation.effect.getTiming().delay)));
const waitState = (page, tab, step, timeout = 3200) => page.waitForFunction(({ tab, step }) => {
  const el = document.querySelector('.tt-home-services');
  return el?.querySelector('[role="tab"][aria-selected="true"]')?.id === `tab-${tab}` &&
    (step === undefined || Number(el.dataset.activeStep) === step);
}, { tab, step }, { timeout });
const create = async (width, reducedMotion = 'no-preference') => {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 640, isMobile: width <= 640, reducedMotion });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.serviceEntrances = [];
    document.addEventListener('tt-home-services-enter', event => {
      if (event.target.closest('.dichvu')?.hidden) return;
      window.serviceEntrances.push([...event.target.querySelectorAll('.tt-home-service-step')]
        .flatMap(card => card.getAnimations().map(animation => animation.effect.getTiming().delay)));
    });
  });
  const errors = [], apiCalls = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url()); });
  await page.route('**/*', r => !['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.abort() : r.continue());
  assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 })).status(), 200);
  await page.locator('.tt-home-services').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.tt-home-services')?.dataset.activeStep !== undefined);
  return { context, page, errors, apiCalls };
};
try {
  const desktop = await create(1440);
  const { page } = desktop;
  await page.waitForFunction(() => window.serviceEntrances.some(delays => delays.length === 4));
  assert.deepEqual(await page.evaluate(() => window.serviceEntrances.find(delays => delays.length === 4)), [0, 90, 180, 270]);
  console.log('PASS desktop: scroll entrance reveals steps in order, staggered by 90ms');
  const visual = await page.locator('.tt-home-services').evaluate(el => ({
    heading: getComputedStyle(el.querySelector('h2')).fontSize,
    otherHeading: getComputedStyle(document.querySelector('.tt-accessories__heading h2')).fontSize,
    tabLine: getComputedStyle(el.querySelector('.cap1 .active'), '::after').content,
    font: getComputedStyle(el.querySelector('.xemtatca a')).fontSize,
    ctaHeight: el.querySelector('.xemtatca a').getBoundingClientRect().height,
    ctaArrows: el.querySelectorAll('.xemtatca svg').length,
    iconBacking: getComputedStyle(el.querySelector('.tt-home-service-step__icon--exchange img')).backgroundColor,
  }));
  assert.equal(visual.heading, visual.otherHeading);
  assert.equal(visual.tabLine, 'none');
  assert.equal(visual.font, '16px');
  assert.equal(visual.ctaHeight, 44);
  assert.equal(visual.ctaArrows, 0);
  assert.equal(visual.iconBacking, 'rgb(255, 255, 255)');
  const height = await page.locator('.tt-home-services').evaluate(el => el.getBoundingClientRect().height);
  await waitState(page, 'ban-xe');
  assert.equal(await page.locator('.tt-home-services').evaluate(el => el.getBoundingClientRect().height), height, 'No height jump when tabs change');
  console.log('PASS desktop: compact style, white arrow backing, automatic tab after 3s, stable section height');
  await page.getByRole('tab', { name: 'Mua xe', exact: true }).click();
  await page.waitForTimeout(30);
  assert.deepEqual(await stagger(page), [0, 90, 180, 270], 'New tab reveals each step in order');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow during panel animation');
  await page.waitForTimeout(4400);
  assert.equal((await state(page)).tab, 'tab-mua-xe', 'Manual selection pauses for 5s');
  await waitState(page, 'ban-xe', undefined, 1800);
  console.log('PASS desktop: manual selection pauses 5s then resumes');
  for (const key of ['mua-xe', 'len-doi', 'ban-xe']) await page.locator(`#tab-${key}`).click();
  assert.deepEqual(await stagger(page), [0, 90, 180, 270]);
  assert.equal(await page.locator('.tt-home-services .dichvu[hidden] .tt-home-service-step').evaluateAll(items =>
    items.flatMap(item => item.getAnimations()).length), 0, 'Rapid tab selection cancels outgoing card animations');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const offscreen = await state(page);
  await page.waitForTimeout(3400);
  assert.deepEqual(await state(page), offscreen, 'Offscreen autoplay stops');
  await page.locator('.tt-home-services').scrollIntoViewIfNeeded();
  await waitState(page, 'len-doi');
  console.log('PASS desktop: offscreen pause and resume');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const background = await state(page);
  await page.waitForTimeout(3400);
  assert.deepEqual(await state(page), background, 'Hidden-document event pauses autoplay');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitState(page, 'mua-xe');
  assert.deepEqual(desktop.errors, []);
  assert.equal(desktop.apiCalls.length, 0, 'Autoplay makes no browser API requests');
  console.log('PASS desktop: simulated visibilitychange, no API calls or runtime errors');
  await desktop.context.close();

  const phone = await create(390);
  await waitState(phone.page, 'mua-xe', 1);
  assert.deepEqual(await stagger(phone.page), [], 'Mobile keeps its existing motion');
  const list = phone.page.locator('#service-mua-xe .tt-home-service-steps');
  await list.scrollIntoViewIfNeeded();
  const box = await list.boundingBox();
  const cdp = await phone.context.newCDPSession(phone.page);
  const start = box.x + box.width * .18, end = box.x + box.width * .82, y = Math.min(box.y + 170, 750);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end - start) * i / 12, y }] });
    await phone.page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.page.waitForTimeout(650);
  assert.equal((await state(phone.page)).step, 0, 'Native swipe returns to the previous step');
  await phone.page.waitForTimeout(3700);
  assert.deepEqual(await state(phone.page), { tab: 'tab-mua-xe', step: 0 }, 'Swiped step is held for 5s');
  await waitState(phone.page, 'mua-xe', 1, 1800);
  console.log('PASS mobile: 2s step autoplay, native swipe back, 5s hold after inertia then resume');
  const count = await list.locator('.tt-home-service-step').count();
  await waitState(phone.page, 'mua-xe', count - 1, count * 2300);
  await waitState(phone.page, 'ban-xe', 0);
  console.log('PASS mobile: end of steps advances to the next service and starts at step 1');
  await phone.page.getByRole('tab', { name: 'Lên đời', exact: true }).click();
  await phone.page.waitForTimeout(4400);
  assert.deepEqual(await state(phone.page), { tab: 'tab-len-doi', step: 0 }, 'Mobile manual tab holds 5s');
  await waitState(phone.page, 'len-doi', 1, 1800);
  await phone.page.setViewportSize({ width: 1440, height: 1000 });
  await waitState(phone.page, 'mua-xe', 0, 4200);
  assert.deepEqual(phone.errors, []);
  assert.equal(phone.apiCalls.length, 0);
  console.log('PASS mobile: manual tab hold, breakpoint switch, no API calls or runtime errors');
  await phone.context.close();

  const reduced = await create(390, 'reduce');
  await reduced.page.waitForTimeout(3400);
  assert.deepEqual(await state(reduced.page), { tab: 'tab-mua-xe', step: 0 }, 'Reduced motion disables autoplay');
  const sellTab = reduced.page.getByRole('tab', { name: 'Bán xe', exact: true });
  await sellTab.focus();
  await reduced.page.keyboard.press('Enter');
  await waitState(reduced.page, 'ban-xe', 0);
  assert.deepEqual(await stagger(reduced.page), [], 'Reduced motion disables card staggering');
  await reduced.page.waitForTimeout(3400);
  assert.deepEqual(await state(reduced.page), { tab: 'tab-ban-xe', step: 0 });
  await reduced.page.keyboard.press('ArrowRight');
  await waitState(reduced.page, 'len-doi', 0);
  assert.deepEqual(reduced.errors, []);
  console.log('PASS reduced motion: no autoplay, keyboard Enter and arrow navigation work');
  await reduced.context.close();
} finally { await browser.close(); }
