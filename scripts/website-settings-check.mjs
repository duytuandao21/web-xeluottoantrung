import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const snapshot = JSON.parse(await readFile('../api-xeluottoantrung/src/database/seed/website-settings.json', 'utf8'));
const api = async path => {
  const response = await fetch(`http://localhost:4000/api/v1${path}`);
  assert(response.ok, path);
  return response.json();
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /unique.*key|hydration|render/i.test(message.text())) errors.push(message.text()); });
  await page.goto('http://localhost:3001');
  const branding = Object.fromEntries((await api('/site-settings/thiet-lap-logo')).map(row => [row.key, row.value]));
  assert.equal(await page.locator('.wap_header [data-header-logo]').getAttribute('src'), branding.logo);
  assert.equal(await page.locator('.tt-footer-brand > a img').getAttribute('src'), branding.logoDark);
  const favicon = (await api('/site-settings/thiet-lap-favicon')).find(row => row.key === 'favicon').value;
  assert.equal(await page.locator('link[rel="icon"]').last().getAttribute('href'), favicon);
  const socials = await api('/content?group=thiet-lap-mang-xa-hoi');
  assert.equal(await page.locator('.tt-footer-social > a').count(), socials.length);
  for (const social of socials) assert.equal(await page.locator(`.tt-footer-social a[aria-label="${social.title}"]`).getAttribute('href'), social.link);
  const banners = await api('/content?group=thiet-lap-banner-dong-xe');
  assert.deepEqual(await page.locator('.home-buy-banner img').evaluateAll(images => images.map(image => image.getAttribute('src'))), banners.map(banner => banner.imageUrl));
  for (const route of ['/ban-xe', '/len-doi']) {
    const values = Object.fromEntries((await api('/site-settings/thiet-lap-text-' + route.slice(1))).map(row => [row.key, row.value]));
    await page.goto('http://localhost:3001' + route);
    assert.equal((await page.locator('.lendoi_l .ten').innerText()).trim(), values.title);
    assert.equal((await page.locator('.lendoi_r .title-main span').innerText()).trim(), values.subtitle);
    assert.equal(await page.locator('.lendoi_l .img img').getAttribute('src'), values.image);
    assert.equal(await page.locator('.lendoi_l .lienhe_ct').count(), route === '/ban-xe' ? 1 : 0);
    const loaded = await page.locator('.lendoi_l .img img').evaluate(image => image.complete && image.naturalWidth > 0);
    assert(loaded, route + ' image loads');
    const banner = (await api('/site-settings/thiet-lap-anh-vi-sao-chon')).find(row => row.key === 'image').value;
    assert.equal(await page.locator('.wap_visao .visao_r img').count(), 1);
    assert.equal(await page.locator('.wap_visao .visao_r img').getAttribute('src'), banner);
    const reasons = await api('/content?group=thiet-lap-tai-sao-chon');
    assert.deepEqual(await page.locator('.wap_visao .visao_l .img_post img').evaluateAll(images => images.map(image => image.getAttribute('src'))), reasons.filter(reason => reason.imageUrl).map(reason => reason.imageUrl));
  }
  const cars = await api('/cars?limit=1');
  await page.goto('http://localhost:3001/' + cars.data[0].slug);
  assert.match(await page.locator('.installment-copy').innerText(), /Lưu ý quan trọng/);
  assert.equal(await page.locator('.installment-copy a').getAttribute('href'), 'https://www.vpbank.com.vn/ca-nhan/vay');
  assert.equal(await page.locator('.vehicle-installment #giaxe').count(), 1);
  assert.equal(await page.locator('.vehicle-installment .c_tragop').count(), 1);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('http://localhost:3001/len-doi');
  assert.equal(await page.locator('.menu_mobi [data-header-logo]').getAttribute('src'), branding.logoMobile);
  assert.deepEqual(errors, []);
  console.log('Passed public branding, favicon, banners, social links, landing texts/images, retained contacts/calculator and mobile logo.');

  // All admin writes below are mocked; this check never changes database records.
  const adminEnv = await readFile('../admin-xeluottoantrung/.env', 'utf8');
  const authUrl = adminEnv.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  assert(authUrl);
  const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
  const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: expires, role: 'authenticated' })}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } };
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await admin.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
  const settings = structuredClone(snapshot.settings);
  const writes = [];
  await admin.route('**/api/v1/admin/**', async route => {
    const request = route.request(), url = new URL(request.url());
    let result;
    if (url.pathname.endsWith('/admin/me')) result = { profile: { id, fullName: 'Admin fixture', status: 'active' }, roles: ['admin'], permissions: ['content.read', 'content.create', 'content.update', 'content.delete', 'settings.read', 'settings.update'] };
    else if (url.pathname.includes('/admin/site-settings/')) {
      const [group, key] = url.pathname.split('/admin/site-settings/')[1].split('/');
      if (request.method() === 'PUT') { const body = request.postDataJSON(); settings[group][key] = body.value; writes.push({ group, key, body }); result = body; }
      else result = Object.entries(settings[group] || {}).map(([key, value]) => ({ key, value }));
    } else if (url.pathname.endsWith('/admin/media/assets/presign')) result = { storageKey: 'fixture.png', uploadUrl: 'http://localhost:3000/mock-banner-upload', headers: {}, publicUrl: '/upload/photo/favicon-3815.png' };
    else if (url.pathname.endsWith('/admin/leads')) result = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    else throw new Error(`Unexpected admin request ${request.method()} ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await admin.route('**/mock-banner-upload', route => route.fulfill({ status: 200, body: '' }));
  for (const kind of ['ban-xe', 'len-doi', 'tra-gop']) {
    await admin.goto('http://localhost:3000/thiet-lap/text-' + kind);
    await admin.locator('[contenteditable="true"]').waitFor();
    if (kind !== 'tra-gop') assert.equal(await admin.locator('input[name="title"]').inputValue(), settings['thiet-lap-text-' + kind].title);
    else assert.match(await admin.locator('[contenteditable="true"]').innerText(), /Lưu ý quan trọng/);
    await admin.locator('[contenteditable="true"]').fill('Nội dung cập nhật từ admin');
    await admin.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await admin.getByText('Đã lưu thay đổi.', { exact: true }).waitFor();
    assert(writes.some(write => write.group === 'thiet-lap-text-' + kind && write.key === 'content' && write.body.value.includes('Nội dung cập nhật')));
  }
  await admin.goto('http://localhost:3000/thiet-lap/banner-len-doi');
  await admin.locator('input[name="title"]').waitFor();
  assert.equal(await admin.locator('input[name="title"]').inputValue(), settings['thiet-lap-text-len-doi'].title);
  await admin.locator('input[name="title"]').fill('Tiêu đề lên đời mới');
  await admin.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await admin.getByText('Đã lưu thay đổi.', { exact: true }).waitFor();
  await admin.goto('http://localhost:3000/thiet-lap/text-len-doi');
  await admin.locator('input[name="title"]').waitFor();
  assert.equal(await admin.locator('input[name="title"]').inputValue(), 'Tiêu đề lên đời mới');
  await admin.goto('http://localhost:3000/thiet-lap/anh-vi-sao-chon');
  await admin.locator('input[type="file"][name="image"]').waitFor({ state: 'attached' });
  assert.equal(await admin.locator('input[type="file"]').count(), 1);
  assert.equal(await admin.locator('input[type="file"]').getAttribute('multiple'), null);
  assert.equal(await admin.getByAltText('Ảnh hiện tại', { exact: true }).getAttribute('src'), settings['thiet-lap-anh-vi-sao-chon'].image);
  await admin.locator('input[type="file"]').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X0AAAAASUVORK5CYII=', 'base64') });
  await admin.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await admin.getByText('Đã lưu thay đổi.', { exact: true }).waitFor();
  assert.equal(writes.filter(write => write.group === 'thiet-lap-anh-vi-sao-chon').length, 1);
  assert.equal(writes.find(write => write.group === 'thiet-lap-anh-vi-sao-chon').body.value, '/upload/photo/favicon-3815.png');
  await admin.reload();
  await admin.getByAltText('Ảnh hiện tại', { exact: true }).waitFor();
  assert.equal(await admin.getByAltText('Ảnh hiện tại', { exact: true }).getAttribute('src'), '/upload/photo/favicon-3815.png');
  await admin.getByRole('button', { name: 'Bỏ ảnh hiện tại 1', exact: true }).click();
  await admin.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await admin.getByText('Đã lưu thay đổi.', { exact: true }).waitFor();
  assert.equal(writes.filter(write => write.group === 'thiet-lap-anh-vi-sao-chon').at(-1).body.value, '');
  assert.equal(await admin.locator('a[href="/thiet-lap/lien-he"],a[href="/thiet-lap/anh-chi-nhanh"]').count(), 0);
  console.log('Passed admin text loading/saving, shared trade-in banner data, single why-choose banner upload/reload/removal and removed sidebar entries.');
} finally { await browser.close(); }
