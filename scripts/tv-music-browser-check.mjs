// Production /TV with an isolated loopback mock API. Browser media methods are
// simulated; this tests integration/lifecycle, not a speaker or MP3 decoder.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const tracks = [1, 2].map(index => { const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return { id, name: `Bài ${index}`, url: `https://media.test/tv/music/${id}.mp3`, sizeBytes: 3 }; });
const config = { logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Liên hệ nhận giá tốt', carIntervalSeconds: 5,
  hotlineIntervalSeconds: 5, syncSalesContacts: false, hotlines: [{ name: 'Dummy', phone: '0777393913' }], theme: 'anniversary-4',
  music: { enabled: true, volume: 30, revision: 1, tracks },
  anniversary: { slideEnabled: true, slideSeconds: 5, pagesBetweenSlides: 1, gratitude: true, messages: ['Tri ân khách hàng'], messageSeconds: 9,
    confetti: false, silk: false, sparkles: false, slides: [{ id: 'dummy', enabled: true, imageUrl: 'https://media.test/showroom.jpg', title: '4 năm đồng hành', highlight: 'Tri ân khách hàng', body: 'Dữ liệu giả lập cho kiểm thử.' }] } };
const cars = Array.from({ length: 12 }, (_, index) => ({ slug: `dummy-car-${index}`, name: `TOYOTA XE THỬ ${index + 1}`, year: 2022,
  price: 500_000_000, status: 'active', fuel: 'Xăng', mileage: 10000, cover: `https://media.test/car-${index}.png`, coverWidth: 1, coverHeight: 1,
  brand: { slug: 'toyota', name: 'Toyota' }, model: { slug: 'dummy', name: 'Dummy' } }));
let reads = 0, child, browser;
const api = createServer((request, response) => {
  reads++; const path = new URL(request.url, 'http://fixture.test').pathname;
  const data = path.endsWith('/cars') ? { data: cars, meta: { page: 1, limit: 100, total: 12, totalPages: 1, tvBrands: [{ slug: 'toyota', name: 'Toyota', imageUrl: null }] } }
    : path.endsWith('/site-settings/tv-display') ? [{ key: 'config', value: JSON.stringify(config) }]
    : path.endsWith('/site-settings/thiet-lap-thong-tin') ? [{ key: 'siteName', value: 'Xe Lướt Toàn Trung' }, { key: 'phone', value: '0777393913' }] : [];
  response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data));
});
try {
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(4019, '127.0.0.1', resolve); });
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--port', '3006'], {
    cwd: process.cwd(), windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: 'http://127.0.0.1:4019',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4019', NEXT_TELEMETRY_DISABLED: '1' },
  });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch('http://127.0.0.1:3006/TV')).ok) break; } catch {}
    if (attempt > 40) throw new Error('Local TV fixture unavailable'); await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const paused = new WeakMap(); window.__tvAudio = { plays: 0, loads: 0, allowed: false };
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return paused.get(this) !== false; } });
    HTMLMediaElement.prototype.pause = function () { paused.set(this, true); };
    HTMLMediaElement.prototype.load = function () { window.__tvAudio.loads++; };
    HTMLMediaElement.prototype.play = function () {
      window.__tvAudio.plays++;
      if (!window.__tvAudio.allowed) return Promise.reject(new DOMException('Dummy autoplay block', 'NotAllowedError'));
      paused.set(this, false); return Promise.resolve();
    };
  });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1xkAAAAASUVORK5CYII=', 'base64');
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: pixel });
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort(); return route.continue();
  });
  await page.goto('http://127.0.0.1:3006/TV', { waitUntil: 'networkidle' });
  await page.locator('.tv-stage[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.tv-board--active [data-tv-card]').count(), 6);
  await page.getByRole('button', { name: 'Chạm để bật nhạc' }).waitFor();
  const before = await page.locator('.tv-stage').boundingBox();
  await page.evaluate(() => { window.__tvAudio.allowed = true; });
  await page.getByRole('button', { name: 'Chạm để bật nhạc' }).click();
  await page.getByRole('button', { name: 'Chạm để bật nhạc' }).waitFor({ state: 'hidden' });
  const after = await page.locator('.tv-stage').boundingBox(); assert.deepEqual(after, before, 'The audio hint does not resize the vehicle stage');
  assert.equal(await page.locator('audio').count(), 1); assert.equal(await page.locator('audio[controls]').count(), 0);
  const initial = await page.evaluate(() => ({ ...window.__tvAudio })); const requests = reads;
  await page.locator('.tv-anniversary-slide[data-visible="true"]').waitFor();
  await page.locator('.tv-anniversary-slide[data-visible="false"]').waitFor();
  const final = await page.evaluate(() => ({ ...window.__tvAudio }));
  assert.equal(final.loads, initial.loads, 'Interlude and vehicle transitions keep the same music source');
  assert.equal(final.plays, initial.plays, 'Interlude does not restart music');
  assert.equal(reads, requests, 'No extra backend requests for music or vehicle page transitions');
  await mkdir('artifacts/tv-music', { recursive: true });
  await page.screenshot({ path: 'artifacts/tv-music/tv-1920.png' });
  assert.deepEqual(errors, []); console.log('PASS: production /TV, 6 cars/page, autoplay hint, stable layout and audio across anniversary/vehicle transitions; no extra backend requests.');
} finally { await browser?.close(); child?.kill(); await new Promise(resolve => api.close(resolve)); }
