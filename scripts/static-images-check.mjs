// --write only recreates a missing, hash-identical version; default verifies.
// Published versions, originals and the existing WebP logo are never overwritten.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const assets = [
  { original: 'public/images/chatbot/chatbot-icon.png', variant: 'public/images/chatbot/chatbot-icon.lossless-v1.webp' },
  ...['mua-xe-theo-nhu-cau', 'dinh-gia-xe-cu', 'tra-cuu-phat-nguoi', 'xem-ngay-mua-xe', 'xem-gia-xang-dau']
    .map(name => ({ original: `public/images/utilities/test-icon-tien-ich/${name}.png`, variant: `public/images/utilities/test-icon-tien-ich/${name}.lossless-v1.webp` })),
  { original: 'public/upload/photo/logo-tt-gold-6981.png', variant: 'public/upload/photo/logo-tt-gold-6981.webp', existing: true },
];
const records = [];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const versionedImages = JSON.parse(fs.readFileSync('config/versioned-images.json', 'utf8'));
for (const asset of assets) {
  const originalHash = hash(asset.original);
  const version = versionedImages.find(image => `public${image.src}` === asset.variant);
  assert(asset.existing || version, `Missing immutable image hash: ${asset.variant}`);
  if (process.argv.includes('--write') && !asset.existing && !fs.existsSync(asset.variant)) {
    const encoded = await sharp(asset.original).keepIccProfile().webp({ lossless: true, effort: 6 }).toBuffer();
    assert.equal(crypto.createHash('sha256').update(encoded).digest('hex'), version.sha256,
      `Encoder output changed: create a NEW image version, do not replace ${asset.variant}`);
    fs.writeFileSync(asset.variant, encoded, { flag: 'wx' });
  }
  assert(fs.existsSync(asset.variant), `Missing static variant: ${asset.variant}`);
  if (version) assert.equal(hash(asset.variant), version.sha256, `Published image version changed: ${asset.variant}`);
  const a = await sharp(asset.original).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(asset.variant).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const originalMetadata = await sharp(asset.original).metadata();
  const variantMetadata = await sharp(asset.variant).metadata();
  assert.equal(variantMetadata.format, 'webp');
  assert.equal(a.info.width, b.info.width);
  assert.equal(a.info.height, b.info.height);
  assert.equal(originalMetadata.hasAlpha, variantMetadata.hasAlpha);
  assert(!originalMetadata.hasProfile || variantMetadata.hasProfile, 'Source color profile was stripped.');
  assert.equal(a.data.length, b.data.length);
  let hiddenRgbDifferences = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    assert.equal(b.data[i + 3], a.data[i + 3], `Alpha changed at pixel ${i / 4}: ${asset.variant}`);
    for (let channel = 0; channel < 3; channel++) {
      if (a.data[i + 3]) assert.equal(b.data[i + channel], a.data[i + channel], `Visible RGB changed at pixel ${i / 4}: ${asset.variant}`);
      else if (a.data[i + channel] !== b.data[i + channel]) hiddenRgbDifferences++;
    }
  }
  assert.equal(hash(asset.original), originalHash, 'Source image was modified.');
  const beforeBytes = fs.statSync(asset.original).size, afterBytes = fs.statSync(asset.variant).size;
  assert(afterBytes < beforeBytes, `Variant is not smaller: ${asset.variant}`);
  records.push({ ...asset, originalSha256: originalHash, variantSha256: hash(asset.variant),
    beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes,
    width: a.info.width, height: a.info.height, alpha: variantMetadata.hasAlpha,
    sourceProfilePreserved: !originalMetadata.hasProfile || variantMetadata.hasProfile,
    visibleRgbMaxDifference: 0, alphaMaxDifference: 0, hiddenRgbDifferences });
}
const outputIndex = process.argv.indexOf('--report');
if (outputIndex >= 0) {
  assert(process.argv[outputIndex + 1], 'Provide the report JSON path.');
  const output = process.argv[outputIndex + 1];
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ encoder: sharp.versions, assets: records }, null, 2)}\n`);
}
console.log(JSON.stringify(records, null, 2));
console.log('PASS: seven original/variant pairs; unchanged dimensions/visible RGB/alpha, preserved sources, smaller bytes.');
