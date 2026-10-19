import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const pageResult = data => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const submissions = [];
const selling = process.argv.includes('--sell');
const service = selling ? 'ban-xe' : 'len-doi';
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.test'), path = url.pathname;
  let data = pageResult([]), status = 200;
  if (path === '/api/v1/brands') data = [{ id: 'toyota', name: 'Toyota', slug: 'toyota', stockCount: 1 }];
  else if (path === '/api/v1/brands/toyota/models') data = [{ id: 'vios', name: 'Vios', slug: 'vios' }];
  else if (path === '/api/v1/lookups/car-versions') data = pageResult([{ id: 'e-at', name: 'E AT' }]);
  else if (['/api/v1/site-settings/thiet-lap-text-len-doi', '/api/v1/site-settings/thiet-lap-text-ban-xe'].includes(path)) data = [{ key: 'subtitle', value: 'Nhập thông tin chi tiết xe của bạn' }];
  else if (path === '/api/v1/content' || path.startsWith('/api/v1/site-settings/')) data = [];
  else if (path === '/api/v1/promotions/popup') data = null;
  else if (path === '/api/v1/leads' && request.method === 'POST') {
    let body = ''; for await (const chunk of request) body += chunk;
    submissions.push(JSON.parse(body)); data = { accepted: true }; status = 201;
  } else if (path === '/api/v1/seo' || /^\/api\/v1\/(pages|articles|services|faqs)\//.test(path)) { status = 404; data = {}; }
  response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data));
});
const listen = instance => new Promise(done => instance.listen(0, '127.0.0.1', done));
let child, browser;
try {
  await listen(server); const apiUrl = `http://127.0.0.1:${server.address().port}`;
  const reservation = createServer(); await listen(reservation); const port = reservation.address().port;
  await new Promise(done => reservation.close(done)); const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', String(port)], { windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: apiUrl } });
  for (let i = 0; ; i++) { try { if ((await fetch(`${base}/len-doi`)).ok) break; } catch {} if (i > 50 || child.exitCode !== null) throw Error('Next unavailable'); await new Promise(done => setTimeout(done, 250)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true }); await mkdir('artifacts/trade-in-form', { recursive: true });
  const localImages = JSON.parse(await readFile('config/cdn-local-images.json', 'utf8'));
  const fixtureAssets = new Map();
  for (const file of ['/assets/images/socho.png', '/assets/images/bienso.png', '/assets/images/km.png', '/assets/images/phone.svg']) {
    const contentType = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    fixtureAssets.set(localImages[file]?.key || file.slice(1), { body: await readFile(`public${file}`), contentType });
  }
  const appearanceOnly = process.argv.includes('--appearance-only');
  for (const width of appearanceOnly || process.argv.includes('--input-only') ? [1440, 390] : [1440, 768, 502, 390, 360, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith('/api/v1/')) {
        const response = await fetch(`${apiUrl}${url.pathname}${url.search}`, { method: request.method(), ...(request.postData() ? { headers: { 'Content-Type': 'application/json' }, body: request.postData() } : {}) });
        return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      }
      for (const [key, asset] of fixtureAssets) if (url.pathname.endsWith(key)) return route.fulfill(asset);
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
    });
    if(selling&&!appearanceOnly){
      const previousSubmissions=submissions.length;
      if(width>960){
      await page.goto(`${base}/`,{waitUntil:'networkidle'});
      const quickForm=page.locator('.banxe form');
      await quickForm.locator('select[name="hangxe_lendoi"]').selectOption('toyota');
      await quickForm.locator('select[name="dongxe_lendoi"] option[value="vios"]').waitFor({state:'attached'});
      await quickForm.locator('select[name="dongxe_lendoi"]').selectOption('vios');
      await quickForm.locator('[type="submit"]').click();
      await page.waitForURL(url=>url.pathname==='/ban-xe'&&url.searchParams.get('hang-xe')==='toyota'&&url.searchParams.get('dong-xe')==='vios');
      }else{
        // The existing responsive layout hides the home quick form on mobile.
        // Verify that its generated destination also restores selections there.
        await page.goto(`${base}/ban-xe?hang-xe=toyota&dong-xe=vios`,{waitUntil:'networkidle'});
      }
      await page.waitForFunction(()=>document.querySelector('.tt-trade-in-form select[name="dongxe_lendoi"]')?.value==='vios');
      assert.equal(await page.locator('.tt-trade-in-form select[name="hangxe_lendoi"]').inputValue(),'toyota');
      await page.locator('.tt-trade-in-form select[name="phienban_lendoi"] option[value="e-at"]').waitFor({state:'attached'});
      assert.equal(submissions.length,previousSubmissions,'The home form only navigates; it must not send an incomplete lead');
    }else await page.goto(`${base}/${service}`, { waitUntil: 'networkidle' });
    const panel = page.locator('.tt-trade-in-form'), form = panel.locator('form'); await panel.scrollIntoViewIfNeeded();
    assert.equal(await panel.locator('h2').textContent(), 'Nhập thông tin chi tiết xe của bạn');
    assert.equal(await panel.locator('.tt-trade-in-form__eyebrow').innerText(), selling ? 'Bán xe' : 'Lên đời');
    assert.equal(await panel.locator('.tt-trade-in-form__symbol > svg').count(), 1);
    assert.equal(await panel.locator('.tt-trade-in-form__symbol > svg').evaluate(el => el.getBoundingClientRect().width), 32);
    assert.equal(await form.locator('.tt-trade-in-form__next').count(), 0);
    assert.equal(await form.locator('.tt-trade-in-form__control').count(), selling ? 6 : 8);
    assert.equal(await form.locator('label').count(), selling ? 6 : 8);
    assert.equal(await form.locator('select[required],input[required]').count(),selling?6:8);
    assert.equal(await form.getAttribute('novalidate'),null);
    assert.equal(await form.locator('.thanhtrai,input[type="submit"]').count(), 0);
    assert.equal(await form.locator('input[type="hidden"][name="submit-laithu"]').count(), 1);
    const layout = await form.evaluate(el => ({ columns: getComputedStyle(el.querySelector('.row')).gridTemplateColumns.split(' ').length, controls: [...el.querySelectorAll('.form-control')].map(input => ({ height: input.getBoundingClientRect().height, padding: parseFloat(getComputedStyle(input).paddingLeft) })), overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
    assert.equal(layout.columns, width <= 375 ? 1 : 2); assert.equal(layout.overflow, false);
    assert(layout.controls.every(control => control.height >= 44 && control.padding >= 30));
    await panel.screenshot({ path: `artifacts/trade-in-form/${service}-${width}.png` });
    if (!appearanceOnly && (width === 1440 || width === 390)) {
      const before = submissions.length;
      await form.getByRole('button', { name: 'Gửi thông tin', exact: true }).click();
      assert.equal(submissions.length, before, 'Required fields block an empty submission');
      await form.getByLabel('Hãng xe', { exact: true }).selectOption('toyota');
      await form.locator('select[name="dongxe_lendoi"] option[value="vios"]').waitFor({ state: 'attached' });
      await form.getByLabel('Dòng xe', { exact: true }).selectOption('vios');
      await form.locator('select[name="phienban_lendoi"] option[value="e-at"]').waitFor({ state: 'attached' });
      await form.getByLabel('Phiên bản', { exact: true }).selectOption('e-at');
      await form.getByLabel('Năm sản xuất', { exact: true }).selectOption('2024');
      const mileage = form.getByLabel('Số km đã đi', { exact: true });
      await mileage.fill('1000000'); assert.equal(await mileage.inputValue(), '1.000.000');
      await mileage.fill('1.234.567'); assert.equal(await mileage.inputValue(), '1.234.567');
      await mileage.fill('1234'); assert.equal(await mileage.inputValue(), '1.234');
      await mileage.evaluate(el => el.setSelectionRange(2, 2)); await mileage.press('Backspace');
      assert.equal(await mileage.inputValue(), '234', 'Backspace at a separator removes the adjacent digit');
      await mileage.fill('1234567'); await mileage.evaluate(el => el.setSelectionRange(3, 3)); await mileage.press('9');
      assert.equal(await mileage.inputValue(), '12.934.567');
      assert.equal(await mileage.evaluate(el => el.selectionStart), 4, 'Editing preserves the caret among the same digits');
      await mileage.fill('1.5'); assert.equal(await mileage.evaluate(el => el.checkValidity()), false);
      await mileage.fill(''); assert.equal(await mileage.inputValue(), '');
      await mileage.pressSequentially('1000000'); assert.equal(await mileage.inputValue(), '1.000.000');
      await form.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
      if (!selling) {
        await form.getByLabel('Hãng xe mong muốn', { exact: true }).selectOption('toyota');
        await form.locator('select[name="dongxe_lendoimm"] option[value="vios"]').waitFor({ state: 'attached' });
        await form.getByLabel('Dòng xe mong muốn', { exact: true }).selectOption('vios');
      }
      const requiredFields=['hangxe_lendoi','dongxe_lendoi','phienban_lendoi','nsx_lendoi','km','dienthoai',...(!selling?['hangxe_lendoimm','dongxe_lendoimm']:[])];
      for(const name of requiredFields){
        const control=form.locator(`[name="${name}"]`),value=await control.inputValue();
        await control.evaluate(el=>{el.value='';});
        await form.getByRole('button',{name:'Gửi thông tin',exact:true}).click();
        assert.equal(submissions.length,before,`Missing ${name} must block submission`);
        await control.evaluate((el,value)=>{el.value=value;},value);
      }
      await form.getByLabel('Số điện thoại',{exact:true}).fill('abcdefghi');
      await form.getByRole('button',{name:'Gửi thông tin',exact:true}).click();
      await page.getByText('Vui lòng nhập số điện thoại Việt Nam hợp lệ.',{exact:true}).waitFor();
      assert.equal(submissions.length,before);
      await page.getByRole('button',{name:'Đóng',exact:true}).click();
      await form.getByLabel('Số điện thoại',{exact:true}).fill('0901234567');
      await form.getByRole('button', { name: 'Gửi thông tin', exact: true }).click();
      await page.getByText('Đã gửi yêu cầu. Nhân viên Toàn Trung sẽ liên hệ với bạn.', { exact: true }).waitFor();
      assert.deepEqual(submissions.at(-1), { type: selling ? 'sell' : 'trade_in', phone: '0901234567', offeredBrand: 'Toyota', offeredModel: 'Vios', offeredYear: '2024', offeredVersion: 'E AT', offeredMileage: '1000000', ...(!selling ? { desiredCar: 'Toyota Vios' } : {}) });
      assert.equal(await form.locator('button[type="submit"]').isEnabled(), true);
    }
    assert.deepEqual(errors, []); await page.close(); console.log(`${service} ${width}px: form layout, labels, icons and overflow passed.`);
  }
  const page = await browser.newPage(); await page.goto(`${base}/${selling ? 'len-doi' : 'ban-xe'}`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.tt-trade-in-form').count(), 1);
  assert.equal(await page.locator('.tt-trade-in-form__control').count(), selling ? 8 : 6); await page.close();
  console.log(appearanceOnly ? 'Shared appearance and service-specific fields passed with external assets blocked.' : 'Desktop/mobile validation, dependent catalogs and mocked lead submission passed for the selected service.');
} finally { await browser?.close(); child?.kill(); await new Promise(done => server.close(done)); }
