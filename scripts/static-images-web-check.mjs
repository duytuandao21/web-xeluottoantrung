import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

// A production page check scoped to the static images changed in 2C.
// --baseline records old markup; --compare checks the new markup against it.
const compare = process.argv.includes('--compare');
assert(compare || process.argv.includes('--baseline'), 'Choose --baseline or --compare.');
const output = path.resolve(process.env.STATIC_IMAGE_REPORT_DIR || '../toi-uu-hieu-suat-website/phase-2c');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const stage = compare ? 'after' : 'before';
fs.mkdirSync(`${output}/screenshots/${stage}`, { recursive: true });
const before = compare ? JSON.parse(fs.readFileSync(`${output}/browser-before.json`, 'utf8')) : [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const details = [
  ['/tien-ich/dinh-gia-xe', '.tt-valuation-hero', 'valuation'],
  ['/tien-ich/mua-xe-theo-nhu-cau', '.tt-needs-hero', 'needs'],
  ['/tien-ich/xem-ngay-mua-xe', '.tt-date-hero', 'dates'],
];
try {
  for (const width of [1920, 1440, 768, 430, 390, 375]) {
    const dpr = width <= 430 ? 3 : 2;
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = { width, dpr, errors, captures: [], statuses: [] };
    const capture = async (selector, label) => {
      const scope = page.locator(selector).first();
      await scope.waitFor({ state: 'visible', timeout: 30000 });
      await scope.scrollIntoViewIfNeeded();
      await scope.evaluate(async element => {
        await document.fonts.ready;
        await Promise.all([...element.querySelectorAll('img'), ...(element.matches('img') ? [element] : [])].map(image => image.decode()));
      });
      // HomeScrollReveal uses a 600ms transition with up to 225ms stagger.
      // Wait for the live reveal to settle before reading geometry.
      await page.mouse.move(0, 0);
      await page.waitForTimeout(950);
      const images = await scope.evaluate(element => [...element.querySelectorAll('img'), ...(element.matches('img') ? [element] : [])].map(image => {
        const rect = image.getBoundingClientRect(), style = getComputedStyle(image);
        return { src: image.getAttribute('src'), alt: image.alt, width: +rect.width.toFixed(2), height: +rect.height.toFixed(2),
          x: +rect.x.toFixed(2), y: +(rect.y + scrollY).toFixed(2), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
          fit: style.objectFit, position: style.objectPosition, loading: image.getAttribute('loading'),
          decoding: image.getAttribute('decoding'), priority: image.getAttribute('fetchpriority'),
          attrWidth: image.getAttribute('width'), attrHeight: image.getAttribute('height') };
      }));
      const screenshot = `screenshots/${stage}/${label}-${width}-dpr${dpr}.png`;
      await scope.screenshot({ path: `${output}/${screenshot}`, animations: 'disabled' });
      const old = before.find(item => item.width === width)?.captures.find(item => item.label === label);
      let difference;
      if (compare) {
        assert(old, `Missing baseline for ${label} ${width}`);
        assert.equal(await scope.innerText(), old.text, `${label}: text changed`);
        assert.equal(images.length, old.images.length);
        for (let i = 0; i < images.length; i++) {
          const { src, x, y, ...attributes } = images[i], { src: oldSrc, x: oldX, y: oldY, ...oldAttributes } = old.images[i];
          assert.deepEqual(attributes, oldAttributes, `${label} ${width}: image layout/hints/dimensions changed`);
          // The initial baseline measured utility Y before the stagger ended.
          // Check X against that baseline; validate settled X/Y for original
          // and variant in the same DOM below rather than masking that motion.
          assert(Math.abs(x - oldX) <= 0.25 && (label === 'home-utilities' || Math.abs(y - oldY) <= 0.25),
            `${label} ${width}: image position changed ${JSON.stringify({ x, oldX, y, oldY })}`);
          const expected = oldSrc.endsWith('.png') ? oldSrc.replace(/\.png$/, '.lossless-v1.webp') : oldSrc;
          assert.equal(src, expected, `${label}: image variant not used`);
        }
        // The live page has scroll animations and remote content. Pair original
        // and variant in the same rendered DOM to isolate image encoding from
        // unrelated fractional positions across two server/browser runs.
        const setSources = async sources => scope.evaluate(async (element, sources) => {
          const nodes = [...element.querySelectorAll('img'), ...(element.matches('img') ? [element] : [])];
          nodes.forEach((node, index) => { node.src = sources[index]; });
          await Promise.all(nodes.map(node => node.decode()));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, sources);
        const pairedOriginal = `screenshots/after/${label}-${width}-dpr${dpr}-paired-original.png`;
        await setSources(old.images.map(image => image.src));
        const originalPositions = await scope.evaluate(element => [...element.querySelectorAll('img'), ...(element.matches('img') ? [element] : [])].map(image => {
          const rect = image.getBoundingClientRect();
          return { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height };
        }));
        for (let i = 0; i < images.length; i++) for (const key of ['x', 'y', 'width', 'height']) {
          assert(Math.abs(originalPositions[i][key] - images[i][key]) <= 0.25, `${label}: variant altered ${key}`);
        }
        await scope.screenshot({ path: `${output}/${pairedOriginal}`, animations: 'disabled' });
        await setSources(images.map(image => image.src));
        await scope.screenshot({ path: `${output}/${screenshot}`, animations: 'disabled' });
        const a = await sharp(`${output}/${pairedOriginal}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const b = await sharp(`${output}/${screenshot}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual(a.info, b.info, 'Screenshot dimensions changed');
        let sum = 0, max = 0, comparedChannels = 0;
        // The rectangular launcher screenshot includes the live hero outside
        // its circular boundary. Compare the button, not a different autoplay
        // frame behind its corners. Raw screenshots remain intact as evidence.
        const density = a.info.width / (await scope.boundingBox()).width;
        for (let i = 0; i < a.data.length; i += 4) {
          const x = (i / 4) % a.info.width + 0.5, y = Math.floor(i / 4 / a.info.width) + 0.5;
          if (label === 'chatbot-launcher' && Math.hypot(x - a.info.width / 2, y - a.info.height / 2) > a.info.width / 2 - 1.5 * density) continue;
          for (let c = 0; c < 4; c++) { const delta = Math.abs(a.data[i+c] - b.data[i+c]); sum += delta; max = Math.max(max, delta); comparedChannels++; }
        }
        difference = { pairedOriginal, meanAbsoluteRGBA: sum / comparedChannels, maxRGBA: max, comparedPixels: comparedChannels / 4 };
        assert(difference.meanAbsoluteRGBA < 0.15 && max <= 3, `${label} ${width}: unexpected screenshot difference ${JSON.stringify(difference)}`);
      }
      record.captures.push({ label, screenshot, text: await scope.innerText(), images, difference });
    };
    const home = await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
    record.statuses.push({ route: '/', status: home.status() });
    assert.equal(home.status(), 200);
    await capture('.tt-chat-launcher', 'chatbot-launcher');
    await capture('.tt-home-utilities', 'home-utilities');
    await page.locator('.tt-chat-launcher').click();
    await capture('#tt-chat-panel', 'chatbot-panel');
    assert.equal(await page.locator('#tt-chat-input').evaluate(element => document.activeElement === element), false);
    await page.locator('#tt-chat-panel').getByRole('button', { name: 'Đóng trợ lý AI', exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#tt-chat-panel').isVisible(), false);
    for (const [route, selector, label] of details) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
      record.statuses.push({ route, status: response.status() });
      assert.equal(response.status(), 200);
      await capture(selector, label);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}: horizontal overflow`);
    }
    assert.deepEqual(errors, []);
    results.push(record);
    fs.writeFileSync(`${output}/browser-${stage}.json`, `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify({ stage, width, dpr, captures: record.captures.length, errors }));
    await context.close();
  }
} finally { await browser.close(); }
console.log(`PASS: ${stage}, six viewports, static-image layout/screenshots, chatbot open/close and no autofocus.`);
