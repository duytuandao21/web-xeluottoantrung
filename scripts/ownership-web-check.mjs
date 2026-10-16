// Production UI + real ownership API + isolated PostgreSQL. Never writes a live DB.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const webRoot = process.cwd(), apiRoot = resolve('../api-xeluottoantrung');
const noticeOnly = process.env.OWNERSHIP_NOTICE_ONLY === 'true';
const { ownershipFixture } = await import(pathToFileURL(resolve(apiRoot, '.test-dist/test/fixtures/ownership.js')).href);
process.chdir(apiRoot); const f = await ownershipFixture(undefined, true); process.chdir(webRoot);
let child, browser;
const chunks = [];
async function findChunks(dir) { for (const item of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, item.name); if (item.isDirectory()) await findChunks(path); else if (item.name.endsWith('.js') && (await readFile(path, 'utf8')).includes('/ownership-config')) chunks.push(item.name); } }
try {
  await findChunks('.next/static/chunks'); assert.ok(chunks.length, 'Modal has a separate production JS chunk');
  await f.app.listen(4012, '127.0.0.1');
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', '3003'], { cwd: webRoot, env: { ...process.env, API_URL: 'http://127.0.0.1:4012' }, windowsHide: true, stdio: 'ignore' });
  for (let attempt = 0; ; attempt++) { try { const r = await fetch('http://127.0.0.1:3003/ownership-test'); if (r.ok) break; } catch {} if (attempt > 40) throw new Error('Isolated web server unavailable'); await new Promise(r => setTimeout(r, 500)); }
  await mkdir('artifacts/ownership', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const viewports = noticeOnly ? [{ width: 1440, height: 920 }, { width: 768, height: 920 }, { width: 430, height: 932 }, { width: 390, height: 920 }, { width: 375, height: 812 }, { width: 360, height: 640 }, { width: 320, height: 920 }, { width: 320, height: 480 }, { width: 844, height: 390 }] : [1440, 768, 390, 320].map(width => ({ width, height: 920 }));
  for (const { width, height } of viewports) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    const requests = [], errors = [], posts = []; let failNext = false;
    page.on('request', request => requests.push(request.url())); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000);
    await page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined }); });
    await page.route('**/*', async route => {
      const r = route.request(), url = new URL(r.url());
      if (/^\/api\/v1\/cars\/[^/]+\/ownership-/.test(url.pathname)) {
        if (r.method() === 'POST') { posts.push(r.postDataJSON()); if (failNext) { failNext = false; return route.abort(); } }
        const response = await f.server.inject({ method: r.method(), url: url.pathname + url.search, headers: { 'content-type': 'application/json' }, ...(r.postData() ? { payload: r.postData() } : {}), remoteAddress: `192.0.2.${width % 200 + 1}` });
        return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
      }
      if (url.pathname.startsWith('/api/v1/')) return route.fulfill({ contentType: 'application/json', body: '{}' });
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
      return route.continue();
    });
    await page.goto('http://127.0.0.1:3003/ownership-test', { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: 'Tính toán chi phí sử dụng', exact: true });
    if (!await trigger.count()) { await page.screenshot({ path: `artifacts/ownership/${width}-integration-error.png` }); console.log('Integration diagnostic:', (await page.locator('body').innerText()).slice(-1600)); }
    assert.equal(await trigger.count(), 1);
    assert.equal(await page.getByText('Xem mô tả chi tiết', { exact: true }).count(), 0); assert.ok(await page.locator('#mo-ta-chi-tiet').isVisible());
    assert.equal(requests.filter(url => /\/api\/v1\/cars\/[^/]+\/ownership-/.test(url)).length, 0, 'No ownership config before click');
    assert.equal(requests.filter(url => chunks.some(name => url.endsWith(`/${name}`))).length, 0, 'Modal chunk not downloaded before click');
    const originalUrl = page.url(); await trigger.click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await page.getByText('Chi phí chỉ mang tính ước tính', { exact: true }).waitFor();
    assert.ok((await dialog.boundingBox()).height < 690, 'Notice fits its content without a large empty area');
    assert.equal(requests.filter(url => /\/api\/v1\/cars\/[^/]+\/ownership-/.test(url)).length, 0, 'No config before agreement');
    await page.screenshot({ path: `artifacts/ownership/${width}-notice${noticeOnly ? `-responsive-${height}` : ''}.png` });
    const noticeBounds = await page.locator('.tt-own-body').evaluate(el => ({ height: el.clientHeight, contentHeight: el.scrollHeight, width: el.clientWidth, contentWidth: el.scrollWidth }));
    assert.ok(noticeBounds.height >= 120, 'Notice body must not collapse');
    if (height >= 640) assert.ok(noticeBounds.height >= noticeBounds.contentHeight - 1, `Notice content fits without being collapsed: ${JSON.stringify(noticeBounds)}`);
    assert.ok(noticeBounds.contentWidth <= noticeBounds.width + 1, 'Notice has no horizontal overflow');
    const noticeRect = await dialog.boundingBox();
    assert.ok(noticeRect.x >= 0 && noticeRect.y >= 0 && noticeRect.x + noticeRect.width <= width + 1 && noticeRect.y + noticeRect.height <= height + 1, 'Notice stays within viewport');
    for (const name of ['Hủy', 'Đồng ý']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(bounds.height >= 44 && bounds.y >= 0 && bounds.y + bounds.height <= height, 'Action stays visible and touchable');
    }
    if (height < 600) {
      await page.locator('.tt-own-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const noticeVisible = await page.locator('#tt-own-estimate-notice').evaluate(el => {
        const text = el.getBoundingClientRect(), body = el.closest('.tt-own-body').getBoundingClientRect();
        return text.bottom <= body.bottom + 1 && text.bottom > body.top;
      });
      assert.ok(noticeVisible, 'Estimate notice remains reachable by scrolling');
    }
    await page.getByRole('button', { name: 'Hủy', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    assert.equal(requests.filter(url => /\/api\/v1\/cars\/[^/]+\/ownership-/.test(url)).length, 0, 'Cancel does not fetch or persist');
    if (noticeOnly) {
      await trigger.click(); await dialog.waitFor(); await page.getByRole('button', { name: 'Đóng dự toán', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await trigger.click(); await dialog.waitFor(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.deepEqual(errors, []); console.log(`Ownership notice ${width}px passed: content, cancel/close/Escape, focus, no config request.`);
      await page.close(); continue;
    }
    await trigger.click(); await page.getByRole('button', { name: 'Đồng ý', exact: true }).click(); await page.locator('input[name=monthlyKm]').waitFor();
    assert.equal(page.url(), originalUrl); assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.ok(requests.some(url => chunks.some(name => url.endsWith(`/${name}`))), 'Click fetches modal JS');
    await page.getByRole('button', { name: 'Đóng dự toán' }).focus(); await page.keyboard.press('Shift+Tab'); assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus stays in modal');
    assert.equal(await page.locator('input[name=monthlyKm]').inputValue(), '1.000', 'Default km is grouped');
    assert.match(await page.locator('input[name=energyPrice]').inputValue(), /^\d{1,3}(\.\d{3})+$/, 'Default price is grouped');
    assert.equal(await page.locator('.tt-own-privacy').count(), 0);
    await page.locator('input[name=monthlyKm]').fill('20.001'); await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click(); assert.ok(await page.locator('input[name=monthlyKm]').isVisible(), 'Formatted input still enforces max');
    await page.locator('input[name=monthlyKm]').fill('-1'); await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click(); assert.equal(posts.length, 0); assert.ok(await page.locator('input[name=monthlyKm]').isVisible());
    await page.locator('input[name=energyPrice]').fill('1500'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.type('2');
    assert.equal(await page.locator('input[name=energyPrice]').inputValue(), '12.500', 'Editing inside grouped input works');
    assert.equal(await page.locator('input[name=energyPrice]').evaluate(el => el.selectionStart), 2, 'Caret stays at the edit');
    await page.locator('input[name=energyPrice]').fill('23.000');
    await page.locator('input[name=monthlyKm]').fill('1500'); await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await page.getByRole('button', { name: 'Quay lại', exact: true }).click(); assert.equal(await page.locator('input[name=monthlyKm]').inputValue(), '1.500');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await page.locator('input[name=parking]').fill('1.234.567'); await page.locator('input[name=wash]').fill('150000'); await page.locator('input[name=toll]').fill('120000');
    assert.equal(await page.locator('input[name=wash]').inputValue(), '150.000');
    assert.equal(await page.getByText('Bảo hiểm, phí theo năm và bảo dưỡng lấy từ định mức admin; kết quả sẽ liệt kê rõ.', { exact: true }).count(), 0);
    await page.screenshot({ path: `artifacts/ownership/${width}-formatted-inputs.png` });
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click(); assert.equal(posts.length, 0, 'Only completion persists');
    await page.getByRole('button', { name: 'Trả góp', exact: true }).click(); await page.locator('input[name=years]').fill('1');
    if (width === 1440) { failNext = true; await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click(); await dialog.getByRole('alert').waitFor(); }
    await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click(); await page.getByText('Chi phí vận hành ước tính / tháng', { exact: true }).waitFor();
    if (width === 1440) assert.equal(posts[0].requestId, posts[1].requestId, 'Network retry reuses idempotency key');
    const interaction = posts.at(-1).interactionId;
    assert.equal(posts.at(-1).answers.monthlyKm, 1500); assert.equal(posts.at(-1).answers.energyPrice, 23000);
    assert.equal(posts.at(-1).answers.parking, 1234567); assert.equal(posts.at(-1).answers.wash, 150000); assert.equal(posts.at(-1).answers.toll, 120000);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.tt-own-results')).opacity === '1');
    await page.screenshot({ path: `artifacts/ownership/${width}-result.png` });
    await page.locator('.tt-own-body').evaluate(el => { el.scrollTop = 620; });
    await page.screenshot({ path: `artifacts/ownership/${width}-breakdown.png` });
    const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    const bodyInfo = await page.locator('.tt-own-body').evaluate(el => ({ scroll: el.scrollHeight > el.clientHeight, width: el.scrollWidth <= el.clientWidth + 1 })); assert.ok(bodyInfo.scroll); assert.ok(bodyInfo.width, 'No modal horizontal overflow');
    assert.ok(await page.getByText('Tiền bán ròng sau trả dư nợ', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Chỉnh sửa câu trả lời', exact: true }).click(); assert.equal(await page.locator('input[name=monthlyKm]').inputValue(), '1.500');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click(); await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await page.getByRole('button', { name: 'Thanh toán toàn bộ', exact: true }).click(); await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click(); await page.getByText('Chi phí vận hành ước tính / tháng', { exact: true }).waitFor();
    assert.equal(posts.at(-1).interactionId, interaction); assert.equal(posts.at(-1).expectedRevision, 1); assert.equal(await page.getByText('Khoản vay', { exact: true }).count(), 0);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); assert.equal(await trigger.evaluate(el => document.activeElement === el), true); assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await trigger.click(); await dialog.waitFor(); await page.getByRole('button', { name: 'Đồng ý', exact: true }).click(); await page.getByRole('button', { name: 'Bắt đầu lại', exact: true }).click(); await page.locator('input[name=monthlyKm]').waitFor(); assert.equal(await page.locator('input[name=monthlyKm]').inputValue(), '1.000');
    await page.screenshot({ path: `artifacts/ownership/${width}-survey.png` });
    await page.mouse.click(1, 1); await dialog.waitFor({ state: 'hidden' });
    await trigger.click(); await dialog.waitFor(); await page.getByRole('button', { name: 'Đóng dự toán', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, [], 'No hydration or browser errors'); console.log(`Ownership web ${width}px passed; lazy modal, validation, finance, edits, focus and scroll.`); await page.close();
  }
  if (noticeOnly) process.exitCode = 0;
  else {
  const summary = await f.server.inject({ method: 'GET', url: '/api/v1/admin/ownership/summary', headers: { authorization: 'Bearer ownership-admin' } });
  assert.equal(summary.json().total, 4, 'One compact record per completed interaction despite editing');
  }
} finally { await browser?.close(); if (child) child.kill(); await f.close(); }
