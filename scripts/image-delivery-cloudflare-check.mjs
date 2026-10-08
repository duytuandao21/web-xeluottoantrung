// Explicit network check: one object, one width/quality on CDN; old R2 original.
// Not part of a default test/build; running it may consume Cloudflare quota.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';

const output = process.argv[2];
assert(output, 'Provide an evidence JSON output path.');
const code = ts.transpileModule(fs.readFileSync('lib/image-delivery.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports, URL, require: filename => ({ default: JSON.parse(fs.readFileSync(`lib/${filename}`, 'utf8')) }), process: { env: {} } });
const origin = 'https://cdn.toantrungxeluot.io.vn';
const r2Origin = 'https://pub-edb90463be404b1d8b79b79517518131.r2.dev';
const src = `${origin}/assets/bebe3d0e-91a9-417a-b089-851a6d68631a.jpg`;
const delivery = exports.createImageDelivery({ mode: 'cloudflare', cloudflareOrigin: origin, sourceOrigins: origin });
const transformed = delivery({ src, width: 640, quality: 85, kind: 'hero' });
assert.notEqual(src, transformed);
async function inspect(url, accept = 'image/webp,image/jpeg;q=0.9') {
  const start = performance.now();
  const response = await fetch(url, {
    headers: { Accept: accept },
    redirect: 'error', signal: AbortSignal.timeout(45000),
  });
  const body = Buffer.from(await response.arrayBuffer());
  const headers = Object.fromEntries(['content-type', 'content-length', 'cache-control', 'age',
    'cf-cache-status', 'cf-resized', 'etag', 'vary'].map(key => [key, response.headers.get(key)]));
  let metadata;
  try {
    const decoded = await sharp(body).metadata();
    metadata = { format: decoded.format, width: decoded.width, height: decoded.height, hasAlpha: decoded.hasAlpha };
  } catch { /* Record non-image error responses too. */ }
  return { url, status: response.status, headers, bytes: body.length, metadata,
    sha256: crypto.createHash('sha256').update(body).digest('hex'), elapsedMs: Math.round(performance.now() - start) };
}
const original = await inspect(src);
const first = await inspect(transformed);
const repeated = await inspect(transformed);
const jpeg = await inspect(transformed, 'image/jpeg');
const oldSource = src.replace(origin, r2Origin);
const oldR2Delivery = delivery({ src: oldSource, width: 640, quality: 85, kind: 'hero' });
assert.equal(oldR2Delivery, oldSource, 'Unapproved R2 transform source must stay original.');
const oldR2 = await inspect(oldR2Delivery);
const evidence = { checkedAt: new Date().toISOString(), original, first, repeated, jpeg, oldR2,
  scope: 'One public hero object, one width/quality on CDN, WebP/JPEG negotiation, old R2 served original. Not a full visual, billing or performance audit.' };
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
assert.equal(original.status, 200);
for (const result of [first, repeated, jpeg]) {
  assert.equal(result.status, 200, 'Transform endpoint must return an image.');
  assert.equal(result.metadata?.width, 640, 'Must actually resize rather than return the original.');
  const proportionalHeight = original.metadata.height * 640 / original.metadata.width;
  assert(Math.abs(result.metadata?.height - proportionalHeight) <= 1,
    'Integer output dimensions must preserve the aspect ratio within one rounding pixel.');
  assert.match(result.headers['content-type'], /^image\/(webp|jpeg)$/);
  assert(result.bytes < original.bytes, 'Sample variant must be smaller than original.');
}
assert.equal(first.sha256, repeated.sha256);
assert.equal(jpeg.headers['content-type'], 'image/jpeg');
assert.equal(oldR2.status, 200);
assert.equal(oldR2.sha256, original.sha256, 'Old R2 original must remain available and unchanged.');
console.log('PASS: live Cloudflare adapter sample, actual pixels/content type/bytes and repeat consistency.');
