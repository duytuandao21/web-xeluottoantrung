const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const variant of [
    { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height },
      deviceScaleFactor: variant.deviceScaleFactor, isMobile: variant.isMobile, hasTouch: variant.hasTouch,
      serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:3000/ve-chung-toi', { waitUntil: 'domcontentloaded' });
    await page.locator('.tt-story__hero-picture img').waitFor();
    await page.waitForTimeout(1800);
    const data = await page.evaluate(() => {
      const img = document.querySelector('.tt-story__hero-picture img');
      return { title: document.querySelector('h1')?.textContent, chapters: document.querySelectorAll('.tt-story > section').length,
        milestones: document.querySelectorAll('.tt-story__milestone').length,
        imageLoaded: img?.complete && img.naturalWidth > 0, imageNatural: [img?.naturalWidth, img?.naturalHeight],
        overflow: document.documentElement.scrollWidth > innerWidth,
        heroBox: document.querySelector('.tt-story__hero')?.getBoundingClientRect().toJSON(),
        viewport: [innerWidth, innerHeight] };
    });
    await page.screenshot({ path: path.join(__dirname, `about-published-${variant.name}.png`) });
    console.log(JSON.stringify({ variant: variant.name, ...data, errors }));
    await context.close();
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exitCode = 1; });
