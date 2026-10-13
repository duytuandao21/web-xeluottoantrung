import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local frontend');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  for (const width of [320, 390, 768, 960, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const launcher = page.locator('.tt-chat-launcher');
    const dismiss = page.locator('.tt-chat-dismiss');
    await launcher.waitFor({ state: 'visible' });
    if (width > 960) {
      await dismiss.waitFor({ state: 'hidden' });
      console.log(`PASS ${width}px: desktop launcher has no dismiss button`);
      continue;
    }
    await dismiss.waitFor({ state: 'visible' });
    const rect = await dismiss.boundingBox();
    assert(rect.width >= 32 && rect.height >= 32 && rect.x >= 0 && rect.x + rect.width <= width);
    await dismiss.click();
    await launcher.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#tt-chat-panel:visible').count(), 0, 'Dismiss must not open chat');
    await page.setViewportSize({ width: 1440, height: 900 });
    await launcher.waitFor({ state: 'visible' });
    await page.setViewportSize({ width, height: 900 });
    await launcher.waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await launcher.waitFor({ state: 'visible' });
    await dismiss.waitFor({ state: 'visible' });
    console.log(`PASS ${width}px: dismiss, desktop resize, and reload reset`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${base}/san-pham`, { waitUntil: 'domcontentloaded' });
  const launcher = page.locator('.tt-chat-launcher');
  const dismiss = page.locator('.tt-chat-dismiss');
  await launcher.waitFor({ state: 'visible' });
  await launcher.click();
  await page.locator('#tt-chat-panel').waitFor({ state: 'visible' });
  await dismiss.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await launcher.waitFor({ state: 'visible' });
  await dismiss.waitFor({ state: 'visible' });
  await dismiss.click();
  await launcher.waitFor({ state: 'hidden' });
  await page.evaluate(() => { window.chatDismissNavigationMarker = true; });
  const links = page.locator('.vehicle-filter-panel a[data-filter-link]');
  let navigated = false;
  for (const link of await links.all()) {
    if (!await link.isVisible()) continue;
    const previous = page.url();
    await link.click();
    await page.waitForURL(url => url.href !== previous);
    navigated = true;
    break;
  }
  assert(navigated, 'A real client navigation must be checked');
  assert(await page.evaluate(() => window.chatDismissNavigationMarker), 'Client navigation must preserve the document');
  await launcher.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await launcher.waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('PASS normal chat open/close, dismissed through client navigation, visible again after reload');
} finally {
  await browser.close();
}
