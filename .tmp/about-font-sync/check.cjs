const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const { chromium } = require('playwright');

const layoutRules = file => {
  const css = postcss.parse(fs.readFileSync(file, 'utf8'));
  css.walkComments(node => node.remove());
  css.walkDecls(node => {
    if (['font-family', 'font-weight', 'font-synthesis', 'letter-spacing'].includes(node.prop)) node.remove();
  });
  return css.toString().replace(/\s+/g, '');
};
assert.equal(layoutRules('.tmp/about-font-sync/before.css'), layoutRules('app/ve-chung-toi/about-story.css'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const photo = fs.readFileSync('public/upload/photo/img8444-2-7758.jpg');
  try {
    for (const width of [1440, 390, 360]) {
      const context = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 },
        isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: width < 700 ? 3 : 1 });
      await context.route('https://cdn.toantrungxeluot.io.vn/**', route => route.fulfill({ contentType: 'image/jpeg', body: photo }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      assert.equal((await page.goto('http://127.0.0.1:3111/ve-chung-toi')).status(), 200);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      const styles = await page.evaluate(() => {
        const selectors = ['.tt-story', '.tt-story h1', '.tt-story__hero-lead', '.tt-story__hero-body', '.tt-story h2', '.tt-story__year', '.tt-story__cta'];
        return selectors.map(selector => {
          const node = document.querySelector(selector);
          const style = getComputedStyle(node);
          return { selector, family: style.fontFamily, weight: style.fontWeight, spacing: style.letterSpacing, synthesis: style.fontSynthesis };
        });
      });
      for (const item of styles) {
        assert.match(item.family, /body|tieude/);
        assert.equal(item.weight, '400');
        assert.equal(item.synthesis, 'none');
      }
      const session = await context.newCDPSession(page);
      await session.send('DOM.enable');
      await session.send('CSS.enable');
      const { root } = await session.send('DOM.getDocument');
      const fonts = {};
      for (const selector of ['.tt-story h1', '.tt-story__hero-body']) {
        const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        fonts[selector] = (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
        assert.ok(fonts[selector].some(font => font.isCustomFont && /SF.*Display/i.test(font.familyName)));
      }
      await page.screenshot({ path: `.tmp/about-font-sync/${width}.png` });
      for (const selector of ['.tt-story__history', '.tt-story__stories', '.tt-story__people', '.tt-story__future']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, styles, fonts, errors }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
