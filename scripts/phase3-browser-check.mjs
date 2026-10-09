import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const stage = process.argv.includes('--compare') ? 'after' : 'before';
const out = '../toi-uu-hieu-suat-website/phase-3', base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
fs.mkdirSync(`${out}/screenshots/${stage}`, { recursive: true });
const old = stage === 'after' ? JSON.parse(fs.readFileSync(`${out}/browser-before.json`, 'utf8')) : null;
const result = { stage, buildId: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(), cases: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1920, 1440, 768, 430, 390, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width <= 430 ? 3 : 2, hasTouch: width <= 430 });
    const page = await context.newPage(), requests = new Map(), errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { url: e.request.url, type: e.type, priority: e.request.initialPriority }));
    cdp.on('Network.responseReceived', e => Object.assign(requests.get(e.requestId) || {}, { status: e.response.status }));
    cdp.on('Network.loadingFinished', e => Object.assign(requests.get(e.requestId) || {}, { bytes: e.encodedDataLength }));
    await page.addInitScript(() => { window.__phase3CLS = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__phase3CLS += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 }); assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(12000);
    const initial = [...requests.values()].map(r => ({ ...r }));
    const metadata = await page.evaluate(() => ({ title: document.title, description: document.querySelector('meta[name="description"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href, overflow: document.documentElement.scrollWidth > innerWidth,
      links: [...document.querySelectorAll('.wapper a[href]')].map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() })),
      headings: [...document.querySelectorAll('.wapper h1,.wapper h2,.wapper h3,.wapper h4')].map(e => ({ tag: e.tagName, text: e.textContent.trim() })) }));
    assert(!metadata.overflow); const visuals = [];
    for (const selector of ['[data-header-logo]', '.wap_sanpham .td_kp', '.tt-home-cars .item .mota', '.tt-accessories__heading', '.tt-home-section-heading', '#tt-footer']) {
      const element = page.locator(selector).filter({ visible: true }).first(); assert(await element.count(), selector);
      await element.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
      const geometry = await element.evaluate(e => { const r = e.getBoundingClientRect(); return { width: r.width, height: r.height }; });
      const name = selector.replace(/[^a-z0-9]+/gi, '-'); await element.screenshot({ path: `${out}/screenshots/${stage}/${width}-${name}.png`, animations: 'disabled', scale: 'css' });
      visuals.push({ selector, geometry });
    }
    for (const tab of await page.locator('.wap_dichvu .cap1 li[data-id]').all()) {
      await tab.click(); assert.equal(await tab.getAttribute('aria-selected'), 'true');
      await page.locator(`#${await tab.getAttribute('aria-controls')}`).waitFor({ state: 'visible' });
    }
    await page.locator('.tt-chat-launcher').click(); await page.locator('#tt-chat-panel').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape'); await page.locator('#tt-chat-panel').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
    const record = { width, metadata, visuals, initial, final: [...requests.values()], errors, consoleErrors, cls: await page.evaluate(() => window.__phase3CLS) };
    if (old) {
      const before = old.cases.find(r => r.width === width); assert.deepEqual(metadata, before.metadata, `SEO, links, headings ${width}`);
      for (const visual of visuals) {
        const a = before.visuals.find(v => v.selector === visual.selector).geometry;
        for (const axis of ['width', 'height']) assert(Math.abs(a[axis] - visual.geometry[axis]) <= 1 / 16, `${width} ${visual.selector} ${axis}`);
      }
    }
    result.cases.push(record); fs.writeFileSync(`${out}/browser-${stage}.json`, JSON.stringify(result, null, 2));
    console.log(`PASS ${stage} ${width}: geometry, SEO, links, service tabs, chatbot, console`); await context.close();
  }
} finally { fs.writeFileSync(`${out}/browser-${stage}.json`, JSON.stringify(result, null, 2)); await browser.close(); }
