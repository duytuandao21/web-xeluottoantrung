import { writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const web = process.env.TEST_BASE_URL || 'http://localhost:3001';
const api = process.env.TEST_API_URL || 'http://localhost:4000/api/v1';
async function list(path, params = {}) {
  const fetchPage = async page => {
    const response = await fetch(`${api}${path}?${new URLSearchParams({ ...params, limit: 100, page })}`);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  };
  const first = await fetchPage(1);
  if (Array.isArray(first)) return first;
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, i) => fetchPage(i + 2)));
  return [...first.data, ...rest.flatMap(page => page.data)];
}
const routes = new Set(['/', '/san-pham', '/ban-xe', '/len-doi', '/cam-nhan', '/bai-viet', '/cau-hoi',
  '/phu-kien-o-to', '/ve-chung-toi', '/dich-vu', '/dich-vu-khac', '/tuyen-dung', '/cam-ket',
  '/chinh-sach-quyen-rieng-tu', '/dieu-khoan-su-dung', '/dieu-khoan-dieu-kien-niem-yet',
  '/tien-ich/mua-xe-theo-nhu-cau', '/tien-ich/dinh-gia-xe', '/tien-ich/tra-cuu-phat-nguoi',
  '/tien-ich/xem-ngay-mua-xe', '/tien-ich/xem-gia-xang-dau']);
const sources = await Promise.all([
  list('/cars'), list('/brands'), list('/lookups/body-styles'), list('/lookups/branches'),
  list('/articles'), list('/driving-experiences'), list('/faqs'), list('/accessories'), list('/services'), list('/recruitments'),
]);
sources.forEach((items, index) => items.forEach(item => {
  const prefix = ['', '', '', '', '', '/kinh-nghiem-su-dung-xe', '/cau-hoi', '/phu-kien-o-to', '/dich-vu', '/tuyen-dung'][index];
  routes.add(`${prefix}/${index === 7 ? item.id : item.slug}`);
  if (index === 0) routes.add(`/${item.model.slug}`);
}));
let records = [];
const skipped = [], failed = [];
const destination = '../api-xeluottoantrung/src/database/seed/seo-website.json';
if (process.argv.includes('--resume')) {
  const { readFile } = await import('node:fs/promises');
  try { records = JSON.parse(await readFile(destination, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const queue = [...routes].filter(route => !records.some(row => row.routePath === route)).sort();
const persist = () => writeFile(destination, JSON.stringify([...records].sort((a, b) => a.routePath.localeCompare(b.routePath)), null, 2) + '\n');
async function captureRoute(routePath) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`${web}${routePath}`, { headers: { 'User-Agent': 'Twitterbot' } });
      if (response.status < 500) break;
      const errorBody = await response.text();
      const rateLimited = /Public API.*?429/.test(errorBody);
      await new Promise(resolve => setTimeout(resolve, rateLimited ? 35000 : 1000));
    }
    if (response.status === 404) { skipped.push(routePath); return true; }
    if (!response.ok) { console.log(`Unable to capture ${routePath}: ${response.status}`); return false; }
    if (new URL(response.url).pathname !== routePath) { skipped.push(routePath); return true; }
    const $ = load(await response.text());
    const meta = selector => $(selector).last().attr('content')?.trim() || null;
    let metaTitle = $('title').last().text().trim();
    if (!metaTitle) throw new Error(`Missing website title: ${routePath}`);
    // Remove the duplicate site suffix in the old sell/trade-in metadata.
    metaTitle = metaTitle.replace(/\s*\|\s*OTO TOAN TRUNG.*?(?=\s*\|\s*OTO TOAN TRUNG)/, '');
    if (routePath === '/san-pham') metaTitle = metaTitle.replace(/^San Pham(?=\s*\|)/, 'Mua xe');
    const robots = meta('meta[name="robots"]') || '';
    records.push({ routePath, metaTitle: metaTitle.slice(0, 160),
      metaDescription: (meta('meta[name="description"]') || meta('meta[property="og:description"]'))?.slice(0, 320) || null,
      keywords: meta('meta[name="keywords"]')?.slice(0, 500) || null,
      ogTitle: meta('meta[property="og:title"]')?.slice(0, 160) || metaTitle.slice(0, 160),
      ogDescription: meta('meta[property="og:description"]')?.slice(0, 320) || null,
      ogImageUrl: meta('meta[property="og:image"]'),
      canonicalUrl: $('link[rel="canonical"]').last().attr('href') || `https://xeluottoantrung.com${routePath}`,
      robotsIndex: !/\bnoindex\b/.test(robots), robotsFollow: !/\bnofollow\b/.test(robots) });
    if (records.length % 10 === 0) console.log(`Captured ${records.length} pages.`);
    await persist();
    return true;
}
await Promise.all(Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const routePath = queue.shift();
    const started = Date.now();
    if (!await captureRoute(routePath)) failed.push(routePath);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 3500 - (Date.now() - started))));
  }
}));
const unresolved = [];
for (const routePath of failed) if (!await captureRoute(routePath)) unresolved.push(routePath);
records.sort((a, b) => a.routePath.localeCompare(b.routePath));
await persist();
console.log(`Captured metadata for ${records.length} public pages. Skipped unavailable/redirected pages: ${skipped.join(', ') || 'none'}.`);
if (unresolved.length) throw new Error(`Unable to capture: ${unresolved.join(', ')}`);
