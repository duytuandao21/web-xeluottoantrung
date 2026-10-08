import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync('lib/image-delivery.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(env = {}, browser = false) {
  const exports = {};
  vm.runInNewContext(source, { exports, URL, require: filename => ({ default: JSON.parse(fs.readFileSync(`lib/${filename}`, 'utf8')) }), process: { env }, ...(browser ? { window: {} } : {}) });
  return exports;
}
const { createImageDelivery, getImageDeliveryUrl } = load({NEXT_PUBLIC_IMAGE_DELIVERY_MODE:'original'});
const cdn = 'https://cdn.toantrungxeluot.io.vn';
const r2 = 'https://pub-edb90463be404b1d8b79b79517518131.r2.dev';
const originals = [
  '', '/upload/photo/logo.webp', '//example.test/image.jpg',
  `${r2}/cars/a%20b/%E1%BA%A3nh.jpg?rev=1%2F2&x=a+b#part`,
  `${cdn}/assets/logo.png?x=%25&x=%2B`,
  ' https://example.test/image.jpg ', 'data:image/png;base64,AA==',
  'http://example.test/a.jpg', 'not a URL',
];
for (const src of originals) {
  assert.equal(getImageDeliveryUrl({ src, width: 640 }), src);
  assert.equal(createImageDelivery({ mode: 'original', cloudflareOrigin: cdn, sourceOrigins: cdn })({ src, width: 640 }), src);
}
const valid = { mode: 'cloudflare', cloudflareOrigin: cdn, sourceOrigins: `${cdn},${r2}` };
const optimized = createImageDelivery(valid);
const raw = `${cdn}/cars/a%20b/%E1%BA%A3nh.jpg?rev=1%2F2&x=a+b`;
const result = optimized({ src: raw, width: 640, kind: 'card' });
assert.equal(result, `${cdn}/cdn-cgi/image/width=640,quality=85,fit=scale-down,format=auto/${raw}`);
assert.notEqual(optimized({ src: raw, width: 480 }), result);
assert.equal(optimized({ src: `${r2}/assets/a.jpg`, width: 640 }).endsWith(`${r2}/assets/a.jpg`), true);

// Config errors and attempted external/credential/internal sources must remain original.
for (const configuration of [
  {}, { mode: 'cloudflare' }, { ...valid, mode: 'unknown' },
  { ...valid, cloudflareOrigin: 'https://localhost' },
  { ...valid, cloudflareOrigin: `${cdn}/path` },
  { ...valid, cloudflareOrigin: `${cdn}?key=secret` },
  { ...valid, sourceOrigins: '' }, { ...valid, sourceOrigins: `${cdn},*` },
  { ...valid, sourceOrigins: 'https://127.0.0.1' },
]) assert.equal(createImageDelivery(configuration)({ src: raw, width: 640 }), raw);
for (const src of [
  `${cdn}.evil.test/a.jpg`, 'https://evil.test/a.jpg',
  'https://cdn.toantrungxeluot.io.vn@evil.test/a.jpg',
  'https://user:password@cdn.toantrungxeluot.io.vn/a.jpg',
  'https://cdn.toantrungxeluot.io.vn:8443/a.jpg',
  'https://cdn.toantrungxeluot.io.vn./a.jpg',
  `${cdn}\\@evil.test/a.jpg`, `${cdn}/a.jpg\n`,
  `${cdn}/cdn-cgi/image/width=640/a.jpg`, `${cdn}/a.jpg#part`,
  `${cdn}/a.jpg?X-Amz-Signature=secret`, `${cdn}/a.jpg?token=secret`,
  `${cdn}/a.svg`, `${cdn}/a.gif`, 'https://127.0.0.1/a.jpg',
  'javascript:alert(1)', '/local.jpg', '//cdn.toantrungxeluot.io.vn/a.jpg',
]) assert.equal(optimized({ src, width: 640 }), src, src);
for (const request of [
  { src: raw }, { src: raw, width: 641 }, { src: raw, width: '640' },
  { src: raw, width: 640, quality: 84 }, { src: raw, width: 640, quality: '85' },
  { src: raw, width: 1920, kind: 'thumbnail' },
  { src: raw, width: 640, kind: 'lightbox' },
  { src: raw, width: 640, kind: 'toString' },
]) assert.equal(optimized(request), raw);

// The actual default export must be deterministic in SSR and browser contexts.
for (const env of [ {}, {
  NEXT_PUBLIC_IMAGE_DELIVERY_MODE: 'cloudflare',
  NEXT_PUBLIC_IMAGE_CLOUDFLARE_ORIGIN: cdn,
  NEXT_PUBLIC_IMAGE_SOURCE_ORIGINS: `${cdn},${r2}`,
} ]) {
  for (const src of [...originals, raw]) assert.equal(
    load(env).getImageDeliveryUrl({ src, width: 640 }),
    load(env, true).getImageDeliveryUrl({ src, width: 640 }),
  );
}
console.log('PASS: original URL compatibility, finite variants, config/source validation, lightbox originals, SSR/browser parity.');
const live=load();
const mappedSource=`${r2}/assets/logo.png`;
assert.equal(live.getImageOriginalUrl(mappedSource),`${cdn}/assets/logo.png`);
assert(live.getImageDeliveryUrl({src:mappedSource,width:640}).endsWith(`${cdn}/assets/logo.png`));
assert.equal(live.getImageDeliveryUrl({src:mappedSource,kind:'lightbox'}),`${cdn}/assets/logo.png`);
assert.equal(live.getImageOriginalUrl('https://pub-unapproved.r2.dev/a.jpg'),'https://pub-unapproved.r2.dev/a.jpg');
assert.equal(live.getImageOriginalUrl(`${r2}/a.jpg?X-Amz-Signature=secret`),`${r2}/a.jpg?X-Amz-Signature=secret`);
const locals=JSON.parse(fs.readFileSync('config/cdn-local-images.json'));
for(const [src,record] of Object.entries(locals))assert.equal(live.getImageOriginalUrl(src),record.url);
const known=Object.keys(JSON.parse(fs.readFileSync('config/cdn-image-dimensions.json'))).find(src=>src.endsWith('.jpg'));
const responsive=live.responsiveImage(known,'card');assert(responsive.srcSet);assert(!responsive.srcSet.includes('.r2.dev/'));
const descriptors=responsive.srcSet.split(', ').map(v=>Number(v.match(/(\d+)w$/)[1]));assert.equal(new Set(descriptors).size,descriptors.length);
assert(descriptors.every(w=>w<=live.imageDimensions(known).width));
console.log('PASS: approved bucket mapping, signed/unapproved URLs preserved, local hash manifest, actual/deduplicated srcset widths.');
