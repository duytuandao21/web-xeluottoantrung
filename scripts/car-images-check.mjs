import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const web = process.env.WEB_URL || 'http://localhost:3001';
const api = process.env.API_URL || 'http://localhost:4000';
async function get(path) {
  const response = await fetch(`${api}/api/v1${path}`);
  assert.equal(response.status, 200, path);
  return response.json();
}
const list = await get('/cars?limit=100');
assert(list.data.length > 1, 'Use a development catalog with multiple published cars.');
const galleries = new Map();
for (const car of list.data) {
  const detail = await get(`/cars/${car.slug}`);
  galleries.set(car.slug, detail.media.map(image => image.url));
  if (car.cover) assert(galleries.get(car.slug).includes(car.cover), `${car.slug}: cover belongs to its gallery`);
}
const descending = (await get('/cars?limit=12&sort=price_desc')).data;
const candidate = list.data.slice(0, 12).find(car => galleries.get(car.slug).length > 1 && descending.some(row => row.slug === car.slug));
assert(candidate, 'Need one car with multiple photos present on both sort pages.');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  // Finish SSR image downloads before allowing React to hydrate. The load
  // event has already fired, so visibility must recover from img.complete.
  const earlyPage = await browser.newPage();
  const earlyUrls = new Set([...galleries.values()].flat());
  let releaseScripts;
  const scriptGate = new Promise(resolve => { releaseScripts = resolve; });
  await earlyPage.route('**/*', async route => {
    if (route.request().resourceType() === 'script') await scriptGate;
    if (earlyUrls.has(route.request().url())) {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ddd"/></svg>' });
    }
    return route.continue();
  });
  await earlyPage.goto(`${web}/san-pham`, { waitUntil: 'commit' });
  try {
    await earlyPage.waitForFunction(() => {
      const images = [...document.querySelectorAll('.slick-slide[data-current="true"] img')];
      return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0);
    });
  } finally { releaseScripts(); }
  await earlyPage.waitForFunction(() => {
    const images = [...document.querySelectorAll('.slick-slide[data-current="true"] img')];
    return images.length > 0 && images.every(img => getComputedStyle(img).visibility === 'visible');
  });
  await earlyPage.reload({ waitUntil: 'networkidle' });
  await earlyPage.waitForFunction(() => [...document.querySelectorAll('.slick-slide[data-current="true"] img')].every(img => img.complete && img.naturalWidth > 0 && getComputedStyle(img).visibility === 'visible'));
  await earlyPage.close();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let releaseInitial;
  const initialGate = new Promise(resolve => { releaseInitial = resolve; });
  let holdInitial = true;
  let delayedUrl;
  const failedUrl = galleries.get(candidate.slug)[2];
  let releaseNext;
  const nextGate = new Promise(resolve => { releaseNext = resolve; });
  // Deterministic image transport: URLs stay real, while fixture bytes let this
  // check exercise slow downloads/decoding without depending on the CDN.
  const imageUrls = new Set([...galleries.values()].flat());
  await page.route('**/*', async route => {
    if (!imageUrls.has(route.request().url())) return route.continue();
    if (route.request().url() === failedUrl) return route.abort();
    if (holdInitial) await initialGate;
    if (route.request().url() === delayedUrl) await nextGate;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ddd"/></svg>' }).catch(() => {});
  });
  await page.goto(`${web}/san-pham`, { waitUntil: 'domcontentloaded' });
  await page.locator('#ngansach-range .ui-slider-handle').first().waitFor({ state: 'attached' });
  const card = () => page.locator(`[data-car-id="${candidate.slug}"]`).first();
  const current = () => card().locator('.slick-slide[data-current="true"] img');
  assert.equal(await current().evaluate(img => getComputedStyle(img).visibility), 'hidden');
  holdInitial = false; releaseInitial();
  await current().waitFor({ state: 'visible' });
  delayedUrl = galleries.get(candidate.slug)[1];
  await card().locator('.slick-next').click();
  await page.waitForFunction(slug => document.querySelector(`[data-car-id="${slug}"] .car-card-gallery`)?.getAttribute('aria-busy') === 'true', candidate.slug);
  assert.equal(await current().getAttribute('src'), candidate.cover);
  await page.locator('#vehicle-sort').selectOption('gia desc');
  await page.waitForURL(url => url.searchParams.get('gia') === 'gia desc');
  await page.waitForFunction(() => document.querySelector('.quick-filters')?.getAttribute('aria-busy') === 'false');
  releaseNext();
  // A route may remount the listing and cancel the pending gallery request.
  // In that case it must show its own cover, and a fresh click must still work.
  await page.waitForTimeout(750);
  if (await current().getAttribute('src') !== delayedUrl) {
    assert.equal(await current().getAttribute('src'), candidate.cover);
    await card().locator('.slick-next').click();
  }
  await page.waitForFunction(({ slug, url }) => document.querySelector(`[data-car-id="${slug}"] .slick-slide[data-current="true"] img`)?.getAttribute('src') === url, { slug: candidate.slug, url: delayedUrl });
  await current().waitFor({ state: 'visible' });
  for (const row of await page.locator('.wap_item > [data-car-id]').evaluateAll(cards => cards.map(card => ({
    id: card.dataset.carId, src: card.querySelector('.slick-slide[data-current="true"] img')?.getAttribute('src'),
    name: card.querySelector('h3')?.textContent,
  })))) {
    const expected = list.data.find(car => car.slug === row.id);
    assert.equal(row.name, expected.name);
    assert(galleries.get(row.id).includes(row.src), `${row.id}: photo stays with its car after sorting`);
  }
  if (galleries.get(candidate.slug).length > 2) {
    await card().locator('.slick-next').click();
    await card().locator('.car-card-gallery__error').waitFor({ state: 'visible' });
    assert.equal(await current().getAttribute('src'), delayedUrl, 'A failed next photo keeps the correct current image');
  }
  console.log(`Checked ${list.data.length} API cover/gallery mappings; pre-hydration images, reload, slow loading and reordering pass.`);
} finally { await browser.close(); }
