// Production-build regression. Synthetic sessions only; no real auth/API mutations.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { api as fixture, listen } from './css-fixture.mjs';

const env = await readFile('.env.local', 'utf8');
const authUrl = env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(authUrl);
const authOrigin = new URL(authUrl).origin;
const authKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const id = 'edb1c10d-f5f8-490d-95b5-7d5e648d45ae';
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, iat: expires - 3600, exp: expires, role: 'authenticated' })}.fixture`,
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
    if (attempt > 100 || child.exitCode !== null) throw Error('Production fixture did not start');
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    const page = await context.newPage();
    const errors = [], probes = [];
    let status = 200, statuses = [], probeDelay = 0, plateStatus = 200, retryAfter = '', logoutRequests = 0, networkFailures = 0;
    await page.addInitScript(() => { window.__saleTestDoc = crypto.randomUUID(); });
    page.on('pageerror', error => errors.push(error.name));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === authOrigin) {
        if (url.pathname === '/auth/v1/token') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
        if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) });
        if (url.pathname === '/auth/v1/logout') { logoutRequests++; return route.fulfill({ status: 204, body: '' }); }
        throw Error('Unexpected auth endpoint; real authentication must not be contacted');
      }
      if (url.pathname === '/api/v1/sale/cars/license-plates') {
        assert.match(request.headers().authorization || '', /^Bearer /);
        const slugs = (url.searchParams.get('slugs') || '').split(',').filter(Boolean);
        if (slugs.length) return route.fulfill({ status: plateStatus, contentType: 'application/json', body: JSON.stringify(Object.fromEntries(slugs.map(slug => [slug, '51A12345']))) });
        const currentStatus = statuses.shift() ?? status;
        probes.push({ time: Date.now(), status: currentStatus });
        if (networkFailures) { networkFailures--; return route.abort(); }
        if (probeDelay) await new Promise(done => setTimeout(done, probeDelay));
        return route.fulfill({ status: currentStatus, headers: retryAfter ? { 'Retry-After': retryAfter } : {}, contentType: 'application/json', body: '{}' });
      }
      if (request.method() !== 'GET' || url.origin !== base) return route.abort();
      return route.continue();
    });
    const authorized = () => page.locator('.sale-header-button.is-authenticated:visible').count();
    const ready = async () => {
      await page.waitForFunction(() => Boolean(document.querySelector('.sale-header-button.is-authenticated')) && document.querySelectorAll('.car-license-plate').length === 6);
    };
    const stored = () => page.evaluate(key => Boolean(localStorage.getItem(key)), authKey);
    const foreground = () => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    const restored = () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    const waitProbes = async count => {
      for (let i = 0; probes.length < count; i++) { assert(i < 100, 'Expected access check'); await page.waitForTimeout(50); }
    };

    await page.goto(base);
    await page.locator('.sale-header-button:visible').click();
    await page.locator('.sale-login-dialog input[autocomplete="username"]').fill('fixture_sale');
    await page.locator('.sale-login-dialog input[type="password"]').fill('fixture-password');
    await page.locator('.sale-login-dialog button[type="submit"]').click();
    await ready();
    const initialCount = probes.length;
    await foreground(); await waitProbes(initialCount + 1); await page.waitForTimeout(250);
    assert.equal(await authorized(), 1, 'Same-token SIGNED_IN must not clear access');
    assert.equal(await page.locator('.car-license-plate').count(), 6);
    assert.equal(probes.length, initialCount + 1, 'A foreground event does not fan out duplicate checks');

    for (let i = 0; i < 4; i++) { await page.reload(); await ready(); await page.waitForTimeout(150); assert.equal(await authorized(), 1, 'Instant API responses must not race INITIAL_SESSION'); }
    console.log(`PASS ${width}px: password login, same-token foreground, four instant session restores`);

    await page.goto(base + '/san-pham'); await ready();
    const documentId = await page.evaluate(() => window.__saleTestDoc);
    await page.locator(width < 768 ? '.menu_mobi .logo' : '.wap_header .header .logo').click();
    await page.waitForURL(base + '/'); await ready();
    assert.equal(await page.evaluate(() => window.__saleTestDoc), documentId, 'Next Link retains the provider');
    await page.goBack({ waitUntil: 'domcontentloaded' }); await ready();
    await page.goto(base + '/'); await ready();
    await page.goto(base + '/ban-xe');
    await page.waitForFunction(() => Boolean(document.querySelector('.sale-header-button.is-authenticated')));
    await page.goBack({ waitUntil: 'domcontentloaded' }); await ready();
    await restored(); await page.waitForTimeout(200); await ready();
    assert.equal(await stored(), true);
    console.log(`PASS ${width}px: SPA/full navigation, Back and persisted-pageshow recovery`);

    let start = probes.length;
    statuses = [503, 200]; await page.reload(); await ready();
    assert.deepEqual(probes.slice(start).map(row => row.status), [503, 200]);
    networkFailures = 1; start = probes.length; await foreground(); await waitProbes(start + 2); await ready();
    assert.equal(await authorized(), 1);
    start = probes.length; statuses = [429, 200]; retryAfter = '1';
    await page.reload(); await ready();
    assert.deepEqual(probes.slice(start).map(row => row.status), [429, 200]);
    assert(probes[start + 1].time - probes[start].time >= 980, 'Retry-After is respected');
    retryAfter = '';
    console.log(`PASS ${width}px: bounded 503/network retries and Retry-After`);

    start = probes.length; status = 503;
    await page.reload(); await waitProbes(start + 3); await page.waitForTimeout(600);
    assert.equal(probes.length, start + 3, 'No retry storm or polling');
    assert.equal(await authorized(), 0); assert.equal(await page.locator('.car-license-plate').count(), 0);
    assert.equal(await stored(), true, 'Temporary API failure must not delete the session');
    status = 200;
    await page.evaluate(({ authKey, session }) => {
      const channel = new BroadcastChannel(authKey);
      channel.postMessage({ event: 'SIGNED_IN', session }); channel.close();
    }, { authKey, session });
    await ready();

    for (const denied of [401, 403]) {
      start = probes.length; status = denied;
      await page.reload(); await waitProbes(start + 1); await page.waitForTimeout(500);
      assert.equal(probes.length, start + 1, 'Access denials must not retry');
      assert.equal(await authorized(), 0); assert.equal(await page.locator('.car-license-plate').count(), 0);
      status = 200;
      if (denied === 401) await page.evaluate(() => window.dispatchEvent(new Event('online')));
      else await restored();
      await ready();
    }
    // Even a previously successful authorization cannot override a protected-read denial.
    plateStatus = 403;
    const deniedPlate = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/sale/cars/license-plates' && url.searchParams.has('slugs') && response.status() === 403;
    });
    await page.goto(base + '/san-pham'); await deniedPlate;
    await page.waitForFunction(() => !document.querySelector('.sale-header-button.is-authenticated'));
    assert.equal(await authorized(), 0); assert.equal(await page.locator('.car-license-plate').count(), 0);
    plateStatus = 200; await restored(); await ready();
    console.log(`PASS ${width}px: exhausted retry recovery, 401/403 and protected-read revocation`);

    const refreshed = { ...session, expires_at: expires + 600,
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, iat: expires - 3000, exp: expires + 600, role: 'authenticated' })}.refreshed` };
    start = probes.length;
    await page.evaluate(({ authKey, session }) => {
      localStorage.setItem(authKey, JSON.stringify(session));
      const channel = new BroadcastChannel(authKey);
      channel.postMessage({ event: 'TOKEN_REFRESHED', session }); channel.close();
    }, { authKey, session: refreshed });
    await waitProbes(start + 1); await ready();
    assert.equal(probes.length, start + 1);
    console.log(`PASS ${width}px: refreshed token is revalidated without reloading`);

    // Restored pages must reconcile a logout performed in another tab while frozen.
    await page.evaluate(key => localStorage.removeItem(key), authKey);
    await restored();
    await page.waitForFunction(() => !document.querySelector('.sale-header-button.is-authenticated'));
    assert.equal(await page.locator('.car-license-plate').count(), 0);
    assert.equal(logoutRequests, 0, 'Session synchronization does not call logout');
    await page.evaluate(({ authKey, session }) => localStorage.setItem(authKey, JSON.stringify(session)), { authKey, session });
    await restored(); await ready();

    // A response from the previous session must never restore access after logout.
    probeDelay = 800; start = probes.length;
    await foreground(); await waitProbes(start + 1);
    await page.locator('.sale-header-button:visible').click();
    await page.locator('.sale-logout-dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.sale-logout-dialog'));
    await page.waitForTimeout(1000);
    assert.equal(await authorized(), 0); assert.equal(await page.locator('.car-license-plate').count(), 0);
    assert.equal(await stored(), false); assert.equal(logoutRequests, 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px: cross-tab logout reconciliation and stale-response privacy`);
  }
} finally {
  await browser?.close(); child?.kill(); await new Promise(done => fixture.close(done));
}
