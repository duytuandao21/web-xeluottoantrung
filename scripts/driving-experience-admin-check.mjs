import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Mock authentication and every admin API request; this check never writes to the database.
const adminEnv = await readFile('../admin-xeluottoantrung/.env', 'utf8');
const authUrl = adminEnv.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(authUrl, 'Public Supabase URL is required for the browser session fixture');
const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: expires, role: 'authenticated' })}.fixture`;
const session = { access_token: accessToken, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
  user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
  let rows = [];
  let saved;
  const categoryId = '9e74a5cd-0683-450d-b289-990b21374c86';
  await page.route('**/api/v1/admin/**', async route => {
    const request = route.request(), url = new URL(request.url());
    let result;
    if (url.pathname.endsWith('/admin/me')) result = { profile: { id, fullName: 'Admin fixture', status: 'active' }, roles: ['admin'], permissions: ['content.read', 'content.create', 'content.update', 'content.delete'] };
    else if (url.pathname.endsWith('/article-categories')) result = { data: [{ id: categoryId, name: 'Kinh nghiệm' }], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } };
    else if (url.pathname.includes('/driving-experiences')) {
      if (request.method() === 'POST' || request.method() === 'PATCH') {
        saved = request.postDataJSON();
        const item = { ...rows[0], ...saved, id, createdAt: '2026-10-01T00:00:00Z' };
        rows = [item]; result = item;
      } else result = { data: rows, meta: { page: 1, limit: 10, total: rows.length, totalPages: rows.length ? 1 : 0 } };
    } else if (url.pathname.endsWith('/articles') || url.pathname.endsWith('/leads')) result = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    else throw new Error(`Unexpected admin API request: ${request.method()} ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('http://localhost:3000/quan-ly/kinh-nghiem-su-dung-xe');
  await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  assert.equal(await page.locator('select[name="category"]').inputValue(), 'Kinh nghiệm');
  await page.locator('input[name="title"]').fill('Kiểm tra xe trước chuyến đi');
  await page.locator('textarea[name="excerpt"]').fill('Tóm tắt bài viết');
  await page.locator('[contenteditable="true"]').fill('Kiểm tra áp suất lốp và các mức chất lỏng trước chuyến đi.');
  await page.locator('select[name="status"]').selectOption('draft');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).waitFor();
  assert.equal(saved.slug, 'kiem-tra-xe-truoc-chuyen-di');
  assert.equal(saved.categoryId, categoryId);
  assert.equal(saved.status, 'draft');
  assert(saved.content.includes('Kiểm tra áp suất lốp'));
  const content = saved.content;
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  assert((await page.locator('[contenteditable="true"]').innerText()).includes('Kiểm tra áp suất lốp'));
  await page.locator('textarea[name="excerpt"]').fill('');
  await page.locator('select[name="status"]').selectOption('published');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).waitFor();
  assert.equal(saved.status, 'published');
  assert.equal(saved.excerpt, '');
  assert.equal(saved.content, content);
  assert.equal(saved.slug, undefined);
  await page.goto('http://localhost:3000/quan-ly/tin-tuc');
  await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  assert.equal(await page.locator('input[name="title"]').count(), 1);
  assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
  console.log('Passed admin create draft, auto slug, category, rich text, edit, publish, clear excerpt and existing news form');
} finally { await browser.close(); }
