// Production-build browser regression. All authentication and sale responses are fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { api as fixture, listen } from './css-fixture.mjs';

const env = await readFile('.env.local', 'utf8');
const authUrl = env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(authUrl, 'Use the configured auth origin only to mock requests, never contact it');
const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: expires, role: 'authenticated' })}.fixture`,
  refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
  user: { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } };
let child, browser;
try {
  await listen(fixture);
  const reservation = createServer(); await listen(reservation);
  const port = reservation.address().port; await new Promise(done => reservation.close(done));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${fixture.address().port}`, PERF_DIAGNOSTICS: 'false' },
  });
  for (let attempt = 0; ; attempt++) {
    try { const response = await fetch(base); await response.text(); if (response.ok) break; } catch {}
    if (attempt > 100 || child.exitCode !== null) throw Error('Production server did not start');
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    const page = await context.newPage();
    const errors = [];
    let logoutRequests = 0;
    let plateChecks = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(authUrl).origin) {
        if (url.pathname === '/auth/v1/logout') {
          assert.equal(request.method(), 'POST'); logoutRequests++;
          await new Promise(done => setTimeout(done, 300));
          return route.fulfill({ status: 204, body: '' });
        }
        throw Error('Unexpected auth request; never contact real authentication');
      }
      if (url.pathname === '/api/v1/sale/cars/license-plates') {
        plateChecks++;
        assert.match(request.headers().authorization || '', /^Bearer /);
        const slugs = (url.searchParams.get('slugs') || '').split(',').filter(Boolean);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.fromEntries(slugs.map(slug => [slug, '51A12345']))) });
      }
      if (request.method() !== 'GET' || url.origin !== base) return route.abort();
      return route.continue();
    });

    // The original logged-out icon still opens the login popup.
    await page.goto(base);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const login = page.getByRole('dialog', { name: 'Đăng nhập', exact: true });
    await login.waitFor();
    await login.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(logoutRequests, 0);

    // Synthetic session in this browser context only; no real account is changed.
    await page.addInitScript(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
    await page.reload();
    const opener = page.getByRole('button', { name: 'Đăng xuất', exact: true });
    try { await opener.waitFor({ timeout: 15000 }); }
    catch (failure) {
      console.log(JSON.stringify({ width, plateChecks, errors, authState: await page.evaluate(key => {
        const stored = JSON.parse(localStorage.getItem(key) || 'null');
        return { stored: Boolean(stored), hasToken: Boolean(stored?.access_token), hasUser: Boolean(stored?.user), icons: [...document.querySelectorAll('.sale-header-button')].map(button => button.getAttribute('aria-label')) };
      }, authKey) }));
      throw failure;
    }
    await page.waitForFunction(() => document.querySelectorAll('.car-license-plate').length === 6);

    for (const cancelMethod of ['button', 'escape', 'backdrop']) {
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Xác nhận đăng xuất', exact: true });
      await dialog.waitFor();
      assert.equal(logoutRequests, 0, 'Opening the popup must not sign out');
      assert.equal(await page.locator('.car-license-plate').count(), 6);
      assert.equal(await dialog.getByRole('button', { name: 'Hủy', exact: true }).evaluate(button => document.activeElement === button), true);
      const rect = await dialog.boundingBox();
      assert(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= 900, 'Popup fits viewport');
      if (cancelMethod === 'button') await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
      else if (cancelMethod === 'escape') await page.keyboard.press('Escape');
      else await page.mouse.click(2, 2);
      await dialog.waitFor({ state: 'detached' });
      assert.equal(logoutRequests, 0, `${cancelMethod} must preserve the session`);
      assert.equal(await page.evaluate(key => Boolean(localStorage.getItem(key)), authKey), true);
      assert.equal(await page.locator('.car-license-plate').count(), 6);
      assert.equal(await opener.evaluate(button => document.activeElement === button), true, 'Focus returns to the icon');
    }

    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đăng xuất', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Đăng xuất', exact: true }).evaluate(button => { button.click(); button.click(); });
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(logoutRequests, 1, 'Confirm sends exactly one mocked logout request');
    assert.equal(await page.locator('.car-license-plate').count(), 0, 'Sale-only data is hidden after logout');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), authKey), null);
    assert.deepEqual(errors, [], 'No hydration or page errors');
    await context.close();
    console.log(`PASS ${width}px: login, confirmation, cancel/Escape/backdrop, focus, bounds, single logout and plate privacy`);
  }
} finally {
  await browser?.close();
  child?.kill();
  await new Promise(done => fixture.close(done));
}
