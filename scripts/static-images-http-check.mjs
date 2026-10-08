// Measure served static HTTP bodies, not just files on disk. No CDN transforms.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
const dir = process.env.STATIC_IMAGE_REPORT_DIR || '../toi-uu-hieu-suat-website/phase-2c';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const manifest = JSON.parse(fs.readFileSync(`${dir}/static-assets.json`, 'utf8'));
const records = [];
async function inspect(file, expectedHash) {
  const url = `${base}${file.replace(/^public/, '')}`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, url);
  const body = Buffer.from(await response.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  assert.equal(sha256, expectedHash, 'HTTP image body differs from validated asset.');
  const metadata = await sharp(body).metadata();
  return { url, status: response.status, bodyBytes: body.length,
    headers: Object.fromEntries(['content-type', 'content-length', 'content-encoding', 'cache-control', 'etag'].map(key => [key, response.headers.get(key)])),
    sha256, format: metadata.format, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha };
}
for (const asset of manifest.assets) {
  const original = await inspect(asset.original, asset.originalSha256);
  const variant = await inspect(asset.variant, asset.variantSha256);
  assert.equal(variant.headers['content-type'], 'image/webp');
  assert.equal(original.width, variant.width);
  assert.equal(original.height, variant.height);
  assert(variant.bodyBytes < original.bodyBytes);
  records.push({ original, variant, existingLogo: Boolean(asset.existing) });
}
const total = group => ({
  originalBytes: group.reduce((sum, item) => sum + item.original.bodyBytes, 0),
  variantBytes: group.reduce((sum, item) => sum + item.variant.bodyBytes, 0),
});
const report = { checkedAt: new Date().toISOString(), scope: 'Static HTTP body bytes, not full-page Lighthouse or wire/header transfer.',
  homepageSixAssets: total(records.filter(item => !item.existingLogo)), allSevenPairs: total(records), records };
fs.writeFileSync(`${dir}/http-static-assets.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ homepageSixAssets: report.homepageSixAssets, allSevenPairs: report.allSevenPairs }, null, 2));
console.log('PASS: 14 static HTTP responses, matching SHA-256/dimensions and smaller WebP payloads.');
