// Production Web/Admin UI against the real promotions API and disposable PGlite DB.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const webRoot = process.cwd(), apiRoot = resolve('../api-xeluottoantrung'), adminRoot = resolve('../admin-xeluottoantrung');
const { promotionsFixture } = await import(pathToFileURL(resolve(apiRoot, '.test-dist/test/fixtures/promotions.js')).href);
process.chdir(apiRoot); const f = await promotionsFixture(); process.chdir(webRoot);
let browser; const children = [], artifacts = resolve('artifacts/promotions'); await mkdir(artifacts, { recursive: true });
const listen = server => new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e20000"/><rect x="40" y="40" width="720" height="520" rx="24" fill="#fff1ce"/><text x="400" y="240" text-anchor="middle" font-size="56" fill="#b90000">AUTO TOÀN TRUNG</text><text x="400" y="350" text-anchor="middle" font-size="42" fill="#14213a">Ưu đãi đặc biệt</text></svg>`;
const fixtureApi = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.test');
    if(url.pathname === '/poster.svg') { response.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return response.end(poster); }
    if(url.pathname.startsWith('/api/v1/promotions')) { const result = await f.server.inject({ method: request.method, url: url.pathname + url.search }); response.writeHead(result.statusCode, { 'Content-Type': 'application/json' }); return response.end(result.body); }
    let data = { data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } }, status = 200;
    if(url.pathname === '/api/v1/content' || url.pathname === '/api/v1/brands' || url.pathname.startsWith('/api/v1/site-settings/')) data = [];
    else if(url.pathname === '/api/v1/slides') data = { data: [{ id:'fixture-hero',title:'Hero kiểm thử',imageUrl:'/poster.svg',link:'/san-pham' }], meta:{page:1,limit:100,total:1,totalPages:1} };
    else if(url.pathname === '/api/v1/seo' || /^\/api\/v1\/(pages|articles|services|faqs)\//.test(url.pathname)) { status = 404; data = { message: 'No fixture' }; }
    response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data));
  } catch(error) { response.writeHead(500); response.end(String(error)); }
});
async function start(root, apiUrl) {
  const reservation = createServer(); await listen(reservation); const port = reservation.address().port; await new Promise(done => reservation.close(done));
  const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'start', '--port', String(port)], { cwd: root, windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: apiUrl } }); children.push(child);
  for(let attempt = 0; ; attempt++) { if(child.exitCode !== null) throw new Error(`Next exited ${child.exitCode}`); try { if((await fetch(`http://127.0.0.1:${port}/khuyen-mai`, { signal: AbortSignal.timeout(2500) })).status < 500) break; } catch {} if(attempt > 50) throw new Error('Next unavailable'); await new Promise(done => setTimeout(done, 250)); }
  return `http://127.0.0.1:${port}`;
}
async function adminRequest(method, path, payload) {
  const response = await f.server.inject({ method, url: `/api/v1/admin/promotions${path}`, headers: { authorization: 'Bearer promotion-admin' }, ...(payload ? { payload } : {}) });
  assert(response.statusCode < 300, response.body); return response.body ? response.json() : null;
}
try {
  await listen(fixtureApi); const apiUrl = `http://127.0.0.1:${fixtureApi.address().port}`;
  const now = Date.now(), day = 86400000, date = offset => new Date(now + 7*3600000 + offset*day).toISOString().slice(0,10), rows = [];
  for(let i = 0; i < 8; i++) rows.push(await adminRequest('POST', '', { title: `Ưu đãi kiểm thử ${i + 1}`, imageUrl: '/poster.svg', content: `<script>window.promotionUnsafe=true</script><p onclick="alert(1)">Thông tin chương trình.</p>${'<p>Chi tiết ưu đãi, điều kiện áp dụng và cách tham gia.</p>'.repeat(55)}`, startsAt: date(i < 3 ? -1 : i < 6 ? 1 : -3), endsAt: date(i < 6 ? 2 : -1) }));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  if(!process.argv.includes('--admin-only')) {
  const base = await start(webRoot, apiUrl);
  async function routeWeb(page) {
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if(u.pathname === '/poster.svg') return route.fulfill({ contentType: 'image/svg+xml', body: poster });
      if(u.pathname.startsWith('/api/v1/')) { const response = await fetch(`${apiUrl}${u.pathname}${u.search}`); return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }); }
      return ['127.0.0.1', 'localhost'].includes(u.hostname) ? route.continue() : route.abort();
    });
  }
  for(const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); await routeWeb(page);
    await page.goto(`${base}/khuyen-mai`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.tt-promotion-card').count(), 6);
    assert.equal(await page.locator('.tt-promo-status').first().textContent(), 'Đang diễn ra');
    assert.equal(await page.locator('.tt-promotions-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 960 ? 3 : 1);
    await page.screenshot({ path: `${artifacts}/web-${width}.png`, fullPage: true });
    const card = page.locator('.tt-promotion-card__trigger').first(); await card.click(); await page.locator('.tt-promo-detail__body').waitFor();
    assert.equal(await page.evaluate(() => window.promotionUnsafe), undefined);
    assert.equal(await page.locator('.tt-promo-detail__body [onclick],.tt-promo-detail__body script').count(), 0);
    const image = page.locator('.tt-promo-detail__image'), imageBefore = await image.boundingBox();
    await page.locator('.tt-promo-detail__content').evaluate(el => el.scrollTop = 500);
    assert((await page.locator('.tt-promo-detail__content').evaluate(el => el.scrollTop)) > 0);
    const imageAfter = await image.boundingBox(); assert(Math.abs(imageBefore.y - imageAfter.y) < 1, 'Image stays fixed while content scrolls');
    if(width > 960) assert(Math.abs(imageAfter.height - (await page.locator('.tt-promo-detail__content').boundingBox()).height) < 1);
    await page.screenshot({ path: `${artifacts}/detail-${width}.png` }); await page.keyboard.press('Escape'); await page.locator('.tt-promo-detail').waitFor({ state: 'detached' }); assert(await card.evaluate(el => document.activeElement === el));
    await page.getByRole('link', { name: 'Trang 2', exact: true }).click(); await page.waitForURL('**/khuyen-mai?page=2'); await page.waitForFunction(() => document.querySelectorAll('.tt-promotion-card').length === 2);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []); await page.close(); console.log(`Web ${width}px: cards, paging, sanitized detail, fixed image, focus passed.`);
  }
  for(const width of [1440,390]) {
    const p = await browser.newPage({viewport:{width,height:900}}); await routeWeb(p); await p.goto(`${base}/`,{waitUntil:'networkidle'});
    const hero=await p.locator('.slider').first().boundingBox(), frame=await p.locator('.tt-home-buy-sell').boundingBox(); assert(hero&&frame); assert(frame.y>=hero.y+hero.height+10,'Buy/sell frame has a gap below hero');
    if(width<960) {
      await p.getByRole('button',{name:'Mở menu',exact:true}).click(); const menu=p.locator('.tt-mobile-menu'); await menu.getByRole('button',{name:'Khám phá',exact:true}).click(); await menu.getByRole('button',{name:'Dịch vụ',exact:true}).click();
      await menu.getByRole('link',{name:'Sửa chữa ô tô',exact:true}).waitFor(); await menu.getByRole('link',{name:'Tuyển dụng',exact:true}).waitFor(); await p.screenshot({path:`${artifacts}/mobile-menu.png`});
    }
    await p.close(); console.log(`Homepage/header ${width}px: hero gap and navigation passed.`);
  }
  await adminRequest('PATCH', `/${rows[0].id}/popup`, { enabled: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await routeWeb(page);
  await page.goto(`${base}/khuyen-mai`, { waitUntil: 'load' }); const loadedAt = Date.now();
  await page.waitForTimeout(1600); assert.equal(await page.locator('.tt-promo-ad[open]').count(), 0, 'No early ad');
  await page.locator('.tt-promo-ad[open]').waitFor(); assert(Date.now() - loadedAt >= 2900); const adBounds = await page.locator('.tt-promo-ad').boundingBox(); assert(adBounds.width <= 520 && adBounds.height <= 680);
  await page.screenshot({ path: `${artifacts}/advertisement.png` }); await page.getByRole('button', { name: 'Đóng quảng cáo' }).click();
  await page.evaluate(() => window.navigationMarker = 'same-document');
  await page.getByRole('link', { name: 'Trang 2', exact: true }).click(); await page.waitForURL('**?page=2');
  await page.locator('.hidden_m .menu').getByRole('link', { name: 'Khuyến mãi/Sự kiện', exact: true }).click(); await page.waitForURL(`${base}/khuyen-mai`); assert.equal(await page.evaluate(() => window.navigationMarker), 'same-document');
  await page.waitForTimeout(3300); assert.equal(await page.locator('.tt-promo-ad[open]').count(), 0);
  // A legacy full document navigation also preserves dismissal; explicit reload resets it.
  await page.goto(`${base}/khuyen-mai?page=2`,{waitUntil:'load'}); await page.waitForTimeout(3400); assert.equal(await page.locator('.tt-promo-ad').count(),0);
  await page.reload({ waitUntil: 'load' }); await page.locator('.tt-promo-ad[open]').waitFor(); await page.getByRole('button', { name: 'Đóng quảng cáo' }).click();
  await page.setViewportSize({width:390,height:900}); await page.reload({waitUntil:'load'}); await page.locator('.tt-promo-ad[open]').waitFor(); assert((await page.locator('.tt-promo-ad').boundingBox()).width<=342); await page.screenshot({path:`${artifacts}/advertisement-mobile.png`}); await page.getByRole('button',{name:'Đóng quảng cáo'}).click();
  await page.reload({ waitUntil: 'load' }); await page.locator('.tt-promotion-card__trigger').first().click(); await page.locator('.tt-promo-detail__body').waitFor(); await page.waitForTimeout(3400);
  assert.equal(await page.locator('.tt-promo-ad[open]').count(), 0, 'Ad waits for current detail'); await page.getByRole('button', { name: 'Đóng chương trình' }).click(); await page.locator('.tt-promo-ad[open]').waitFor(); await page.getByRole('button', { name: 'Đóng quảng cáo' }).click();
  await adminRequest('PATCH', `/${rows[0].id}/popup`, { enabled: false }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3400); assert.equal(await page.locator('.tt-promo-ad').count(), 0); await page.close();
  const expiring = await adminRequest('POST','',{title:'Popup hết hạn',imageUrl:'/poster.svg',startsAt:date(0),endsAt:date(0),popupEnabled:true});
  const expirePage=await browser.newPage(); await routeWeb(expirePage); await expirePage.clock.install({time:new Date(`${date(0)}T23:59:50+07:00`)});
  await expirePage.goto(`${base}/khuyen-mai`,{waitUntil:'load'}); await expirePage.clock.runFor(3500); await expirePage.locator('.tt-promo-ad[open]').waitFor(); await expirePage.clock.runFor(10000); await expirePage.locator('.tt-promo-ad').waitFor({state:'detached'}); await expirePage.close(); await adminRequest('DELETE',`/${expiring.id}`);
  console.log('Advertisement: delayed, compact, single document, reload, queued dialog and no selection passed.');
  }

  let authUrl = ''; async function findAuth(dir) { for(const item of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, item.name); if(item.isDirectory()) await findAuth(path); else if(item.name.endsWith('.js') && !authUrl) authUrl = (await readFile(path, 'utf8')).match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0] || ''; } }
  await findAuth(resolve(adminRoot, '.next/static/chunks')); assert(authUrl);
  const storageKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`, userId = crypto.randomUUID(), exp = Math.floor(Date.now()/1000)+3600, enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const session = { access_token: `${enc({alg:'HS256'})}.${enc({sub:userId,exp,role:'authenticated'})}.fixture`, refresh_token:'fixture', expires_at:exp, expires_in:3600, token_type:'bearer', user:{id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}} };
  const adminBase = await start(adminRoot, apiUrl);
  for(const width of [1440,390]) {
    const p = await browser.newPage({ viewport: { width, height: 950 } }); const errors = []; let mode = 'admin', uploaded = 0; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.dismiss());
    await p.addInitScript(({storageKey,session}) => { localStorage.setItem(storageKey,JSON.stringify(session));localStorage.setItem('admin-sidebar','false'); }, {storageKey,session});
    await p.route('**/*', async route => {
      const request = route.request(), u = new URL(request.url());
      if(u.pathname === '/poster.svg') return route.fulfill({ contentType:'image/svg+xml',body:poster });
      if(u.pathname === '/fixture-upload') { uploaded++; return route.fulfill({status:200,body:''}); }
      if(u.pathname.endsWith('/admin/me')) return route.fulfill({contentType:'application/json',body:JSON.stringify({profile:{id:userId,fullName:'Admin kiểm thử',status:'active'},roles:['ADMIN'],permissions:mode==='admin'?['content.read','content.create','content.update','content.delete','media.create']:['content.read']})});
      if(u.pathname.endsWith('/admin/media/assets/presign')) return route.fulfill({contentType:'application/json',body:JSON.stringify({storageKey:'fixture',uploadUrl:`${adminBase}/fixture-upload`,headers:{},publicUrl:'/poster.svg'})});
      if(u.pathname.startsWith('/api/v1/admin/promotions')) { const response = await f.server.inject({method:request.method(),url:u.pathname+u.search,headers:{authorization:`Bearer promotion-${mode}`,...(request.postData()?{'content-type':'application/json'}:{})},...(request.postData()?{payload:request.postData()}:{})});return route.fulfill({status:response.statusCode,contentType:'application/json',body:response.body}); }
      if(u.pathname.startsWith('/api/v1/')) return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[],meta:{page:1,limit:20,total:0,totalPages:0},notifications:[]})});
      return ['localhost','127.0.0.1'].includes(u.hostname)?route.continue():route.abort();
    });
    await p.goto(`${adminBase}/quan-ly/khuyen-mai`, {waitUntil:'networkidle'}); await p.getByText(rows[0].title,{exact:true}).first().waitFor(); await p.screenshot({path:`${artifacts}/admin-${width}.png`,fullPage:true});
    await p.getByRole('button',{name:'Thêm chương trình',exact:true}).click();
    const description = `Mô tả chi tiết khi tạo mới ${width}. Điều kiện áp dụng ưu đãi.`;
    const editor = p.locator('[contenteditable=true]');
    await editor.fill(description); // Type before other fields to exercise parent rerenders.
    await p.locator('[name=title]').fill(`Chương trình từ UI ${width}`);
    await p.locator('[name=startsAt]').fill('01012026'); assert.equal(await p.locator('[name=startsAt]').inputValue(),'01/01/2026');
    await p.locator('[name=endsAt]').fill('31/02/2030');
    await p.locator('[name=image]').setInputFiles({name:'promotion.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO00AAAAASUVORK5CYII=','base64')});
    await p.getByRole('button',{name:'Lưu chương trình',exact:true}).click(); await p.getByText('Ngày không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy.',{exact:true}).first().waitFor(); assert.equal(uploaded,0,'Invalid calendar date is rejected before upload');
    await p.locator('[name=endsAt]').fill('31/12/2030');
    await p.locator('[name=popupEnabled]').check(); await p.screenshot({path:`${artifacts}/admin-form-${width}.png`,fullPage:true});
    await p.getByRole('button',{name:'Quay lại',exact:true}).click(); assert.equal(await p.locator('[name=title]').inputValue(),`Chương trình từ UI ${width}`,'Cancel dirty navigation preserves form');
    await p.getByRole('button',{name:'Lưu chương trình',exact:true}).click(); await p.getByRole('heading',{name:'Sự kiện / Khuyến mãi',exact:true}).waitFor(); assert.equal(uploaded,1);
    const created = (await adminRequest('GET','')).data.find(row=>row.title===`Chương trình từ UI ${width}`); assert(created?.popupEnabled); assert.equal(created.startsAt,'2026-01-01'); assert.equal(created.endsAt,'2030-12-31');
    const createdRow = p.locator('tr').filter({hasText:`Chương trình từ UI ${width}`}); await createdRow.getByText('Từ 01/01/2026',{exact:true}).waitFor(); await createdRow.getByText('Đến 31/12/2030',{exact:true}).waitFor(); assert.equal(await p.locator('input[type=datetime-local]').count(),0);
    assert((await adminRequest('GET',`/${created.id}`)).content.includes(description),'Creating must persist the typed rich description');
    assert((await f.server.inject(`/api/v1/promotions/${created.id}`)).json().content.includes(description),'Public detail must contain the created description');
    await p.reload({waitUntil:'networkidle'});
    await p.locator('tr').filter({hasText:`Chương trình từ UI ${width}`}).getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
    await editor.waitFor(); assert((await editor.innerText()).includes(description),'Reopening must restore the saved description');
    const editedDescription = `Mô tả đã cập nhật ${width}. Nội dung mới khi chỉnh sửa.`;
    assert.equal(await p.locator('[name=startsAt]').inputValue(),'01/01/2026'); assert.equal(await p.locator('[name=endsAt]').inputValue(),'31/12/2030');
    await editor.fill(editedDescription); await p.locator('[name=endsAt]').fill('30/12/2030');
    await p.getByRole('button',{name:'Lưu chương trình',exact:true}).click(); await p.getByRole('heading',{name:'Sự kiện / Khuyến mãi',exact:true}).waitFor();
    assert((await adminRequest('GET',`/${created.id}`)).content.includes(editedDescription),'Editing must persist the replacement description'); assert.equal(uploaded,1,'Editing with the existing image does not upload it again');
    await p.getByRole('button',{name:`Bật popup: ${rows[1].title}`,exact:true}).click(); await p.getByRole('button',{name:`Tắt popup: ${rows[1].title}`,exact:true}).waitFor();
    assert.equal((await adminRequest('GET','')).data.filter(row=>row.popupEnabled).length,1);
    await p.getByRole('button',{name:`Tắt popup: ${rows[1].title}`,exact:true}).click(); await p.getByRole('button',{name:`Bật popup: ${rows[1].title}`,exact:true}).waitFor();
    assert(await p.getByRole('button',{name:`Bật popup: ${rows[6].title}`,exact:true}).isDisabled());
    mode='reader'; await p.reload({waitUntil:'networkidle'}); await p.getByRole('heading',{name:'Sự kiện / Khuyến mãi',exact:true}).waitFor(); assert.equal(await p.getByRole('button',{name:'Thêm chương trình',exact:true}).count(),0); assert.equal(await p.locator('button[aria-pressed]').count(),0);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); assert.deepEqual(errors,[]); await p.close(); console.log(`Admin ${width}px: date-only dd/mm/yyyy input/list, invalid dates, create/edit descriptions, upload, dirty form, single ad switch, expiration and permissions passed.`);
  }
} finally { await browser?.close(); for(const child of children) child.kill(); await new Promise(done=>fixtureApi.close(done)); await f.close(); }
