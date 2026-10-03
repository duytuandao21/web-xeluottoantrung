import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// All admin traffic is mocked: no database writes or uploaded assets.
const env = await readFile('../admin-xeluottoantrung/.env', 'utf8');
const authUrl = env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(authUrl);
const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: expires, role: 'authenticated' })}.fixture`,
  refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
  user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
    const defaults = { metaTitle: 'Mua xe tại Toàn Trung', metaDescription: 'Mô tả đã lấy từ website.', keywords: 'ô tô, Toàn Trung',
      ogTitle: 'Chia sẻ xe', ogDescription: 'Nội dung chia sẻ', ogImageUrl: '/upload/photo/logo-tt-gold-6981.png', canonicalUrl: 'https://xeluottoantrung.com/san-pham',
      robotsIndex: true, robotsFollow: true, updatedAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-02T00:00:00Z', updatedBy: null, structuredData: null };
    let rows = [{ ...defaults, id, routePath: '/san-pham' }], saved;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/admin/**', async route => {
      const request = route.request(), url = new URL(request.url());
      let result;
      if (url.pathname.endsWith('/admin/me')) result = { profile: { id, fullName: 'SEO fixture', status: 'active' }, roles: ['admin'], permissions: ['seo.read', 'seo.update'] };
      else if (url.pathname.endsWith('/admin/seo')) {
        if (request.method() === 'PUT') {
          saved = request.postDataJSON();
          result = { ...saved, id };
          rows = [...rows.filter(row => row.routePath !== saved.routePath), result];
        } else if (request.method() === 'DELETE') {
          rows = rows.filter(row => row.routePath !== url.searchParams.get('route'));
          await route.fulfill({ status: 204 }); return;
        } else result = rows;
      } else result = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto('http://localhost:3000/seo/mua-xe');
    await page.locator('input[name="metaTitle"]').waitFor();
    assert.equal(await page.locator('input[name="routePath"]').inputValue(), '/san-pham');
    assert.equal(await page.locator('textarea[name="metaDescription"]').inputValue(), defaults.metaDescription);
    await page.screenshot({ path: `.next/seo-admin-${width}.png`, fullPage: true });
    await page.locator('input[name="metaTitle"]').fill('Tiêu đề đã chỉnh');
    await page.locator('textarea[name="keywords"]').fill('xe cũ, phụ kiện');
    await page.locator('input[name="ogTitle"]').fill('Chia sẻ mới');
    await page.locator('select[name="robotsIndex"]').selectOption('false');
    await page.locator('button[form="seo-form"]').click();
    await page.getByRole('heading', { name: 'Quản lý SEO', exact: true }).waitFor();
    assert.equal(saved.routePath, '/san-pham');
    assert.equal(saved.metaTitle, 'Tiêu đề đã chỉnh');
    assert.equal(saved.robotsIndex, false);
    assert.equal(saved.robotsFollow, true);
    assert.equal(saved.ogImageUrl, defaults.ogImageUrl);
    assert.deepEqual(Object.keys(saved).sort(), ['routePath', 'metaTitle', 'metaDescription', 'keywords', 'ogTitle', 'ogDescription', 'ogImageUrl', 'canonicalUrl', 'robotsIndex', 'robotsFollow'].sort());
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    assert.equal(await page.locator('input[name="metaTitle"]').inputValue(), 'Tiêu đề đã chỉnh');
    await page.locator('input[name="metaTitle"]').fill('');
    await page.locator('textarea[name="metaDescription"]').fill('');
    await page.locator('button[form="seo-form"]').click();
    await page.getByRole('heading', { name: 'Quản lý SEO', exact: true }).waitFor();
    assert.equal(saved.metaTitle, null);
    assert.equal(saved.metaDescription, null);
    await page.getByRole('button', { name: 'Thêm đường dẫn', exact: true }).click();
    await page.locator('input[name="routePath"]').fill('/invalid?query=1');
    assert.equal(await page.locator('input[name="routePath"]').evaluate(input => input.checkValidity()), false);
    await page.locator('input[name="routePath"]').fill('/phu-kien-o-to');
    await page.locator('input[name="metaTitle"]').fill('Phụ kiện ô tô chính hãng');
    await page.locator('button[form="seo-form"]').click();
    await page.getByRole('heading', { name: 'Quản lý SEO', exact: true }).waitFor();
    assert.equal(saved.routePath, '/phu-kien-o-to');
    assert.equal(rows.length, 2);
    await page.goto('http://localhost:3000/seo/phu-kien-o-to');
    assert.equal(await page.locator('input[name="routePath"]').inputValue(), '/phu-kien-o-to');
    assert.equal(await page.locator('input[name="metaTitle"]').inputValue(), 'Phụ kiện ô tô chính hãng');
    await page.getByRole('button', { name: 'Danh sách SEO', exact: true }).click();
    await page.getByPlaceholder('Tìm theo trang, tên xe, phụ kiện hoặc bài viết...').fill('/phu-kien');
    assert.equal(await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await page.getByRole('heading', { name: 'Xóa cấu hình SEO?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xóa', exact: true }).last().click();
    await page.getByText('Chưa có cấu hình SEO. Thêm đường dẫn để bắt đầu.', { exact: true }).waitFor();
    assert.equal(rows.length, 1);
    assert.deepEqual(errors, []);
    console.log(`Passed ${width}px: existing values, corrected route, save/reload, robots, keywords, OG, clean API payload, clear fields, create custom route, search and new SEO menu page.`);
    await page.close();
  }
} finally { await browser.close(); }
