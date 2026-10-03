import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { load } from 'cheerio';

const source = (await readFile(new URL('../lib/page-metadata.ts', import.meta.url), 'utf8'))
  .replace(/^import .*?;\r?\n/gm, '');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
let fixture = null;
globalThis.optionalPublicApi = async (path, query) => { assert.equal(path, '/seo'); assert(query.route.startsWith('/')); return fixture; };
globalThis.getSiteName = async () => 'Toàn Trung';
const { routeMetadata, pageMetadata } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const defaults = { title: 'Tên nội dung', description: 'Mô tả nội dung', alternates: { canonical: '/san-pham' }, openGraph: { images: ['/cover.png'] } };
let result = await routeMetadata('/san-pham', defaults);
assert.equal(result.title, defaults.title);
assert.equal(result.description, defaults.description);
assert.deepEqual(result.openGraph.images, ['/cover.png']);
fixture = { metaTitle: 'SEO riêng', metaDescription: 'Mô tả SEO', keywords: 'xe, phụ kiện',
  ogTitle: 'Tiêu đề chia sẻ', ogDescription: 'Mô tả chia sẻ', ogImageUrl: 'https://example.test/image.png',
  canonicalUrl: 'https://xeluottoantrung.com/san-pham', robotsIndex: false, robotsFollow: false };
result = await routeMetadata('/san-pham', defaults);
assert.deepEqual(result.title, { absolute: fixture.metaTitle });
assert.equal(result.description, fixture.metaDescription);
assert.equal(result.keywords, fixture.keywords);
assert.equal(result.alternates.canonical, fixture.canonicalUrl);
assert.equal(result.openGraph.title, fixture.ogTitle);
assert.equal(result.openGraph.description, fixture.ogDescription);
assert.deepEqual(result.twitter.images, [fixture.ogImageUrl]);
assert.deepEqual(result.robots, { index: false, follow: false });
result = await pageMetadata({ title: 'Trang chủ', description: 'Giới thiệu', openGraphImage: '/home.png' }, '/');
assert.deepEqual(result.title, { absolute: fixture.metaTitle });
fixture = { metaTitle: '', metaDescription: null, ogTitle: '', ogDescription: null, ogImageUrl: '', canonicalUrl: null, robotsIndex: true, robotsFollow: true };
result = await pageMetadata({ title: 'Mẫu xe', description: 'Giới thiệu xe', openGraphImage: '/car.png' }, '/xe-moi');
assert.equal(result.description, 'Giới thiệu xe');
assert.deepEqual(result.openGraph.images, ['/car.png']);
delete globalThis.optionalPublicApi;
delete globalThis.getSiteName;
console.log('Passed metadata overrides, homepage title, keywords, sharing, canonical, robots and content fallbacks.');

if (process.argv.includes('--live')) {
  const snapshot = JSON.parse(await readFile(new URL('../../api-xeluottoantrung/src/database/seed/seo-website.json', import.meta.url), 'utf8'));
  const main = ['/', '/san-pham', '/ban-xe', '/bai-viet', '/phu-kien-o-to', '/ve-chung-toi', '/dich-vu', '/tuyen-dung'];
  const detail = ['/phu-kien-o-to/', '/dich-vu/', '/cau-hoi/', '/kinh-nghiem-su-dung-xe/', '/tuyen-dung/'];
  const cars = await fetch('http://localhost:4000/api/v1/cars?limit=1').then(response => response.json());
  const articles = await fetch('http://localhost:4000/api/v1/articles?limit=1').then(response => response.json());
  if (cars.data[0]) main.push(`/${cars.data[0].slug}`);
  if (articles.data[0]) main.push(`/${articles.data[0].slug}`);
  for (const prefix of detail) {
    const record = snapshot.find(row => row.routePath.startsWith(prefix));
    if (record) main.push(record.routePath);
  }
  for (const route of main) {
    const response = await fetch(`http://localhost:3001${route}`, { headers: { 'User-Agent': 'Twitterbot' } });
    assert.equal(response.status, 200, route);
    const seoResponse = await fetch(`http://localhost:4000/api/v1/seo?${new URLSearchParams({ route })}`);
    assert.equal(seoResponse.status, 200, `Seeded ${route}`);
    const seo = await seoResponse.json(), $ = load(await response.text());
    assert.equal($('title').last().text(), seo.metaTitle, `${route} title`);
    if (seo.metaDescription) assert.equal($('meta[name="description"]').last().attr('content'), seo.metaDescription, `${route} description`);
    assert.equal($('link[rel="canonical"]').last().attr('href'), seo.canonicalUrl, `${route} canonical`);
    if (seo.ogTitle) assert.equal($('meta[property="og:title"]').last().attr('content'), seo.ogTitle, `${route} OG title`);
    if (seo.ogImageUrl) assert.equal($('meta[property="og:image"]').last().attr('content'), seo.ogImageUrl, `${route} OG image`);
    assert.equal($('meta[name="robots"]').last().attr('content').includes('noindex'), !seo.robotsIndex, `${route} robots`);
    console.log(`Passed live database → website: ${route}`);
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
}
