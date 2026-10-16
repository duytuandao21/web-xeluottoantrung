import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve('../docs/artifacts/hero-lcp-fix-2026-10-16');
const before = JSON.parse(await readFile(resolve(root, 'before/result.json'), 'utf8'));
const after = JSON.parse(await readFile(resolve(root, 'after/result.json'), 'utf8'));
const overlay = JSON.parse(await readFile(resolve(root, 'overlay-check/after/result.json'), 'utf8')).cases[0].final.externalOverlayBoxes;
assert(overlay.every(box => box.outsideHero && box.selector === '.tt-chat-launcher'));
// The raw exact-pixel comparison is retained separately. One 8-bit channel
// level covers observed compositor rounding. Only the measured external portal
// is excluded for SSR-vs-hydrated comparisons, where app JS adds that portal.
const result = { passed: false, failures: [], visual: [], timings: [], channelTolerance: 1, externalOverlayEvidence: 'overlay-check/after/result.json' };
const check = (name, fn) => { try { fn(); } catch (e) { result.failures.push({ name, reason: e.message }); } };
check('nine cases per build', () => { assert.equal(before.cases.length, 9); assert.equal(after.cases.length, 9); assert.equal(before.failures.length, 0); assert.equal(after.failures.length, 0); });
check('source stable during runs', () => assert(before.sourceUnchangedDuringTests && after.sourceUnchangedDuringTests));
check('only hero class and scoped SSR CSS sources changed', () => assert.deepEqual(Object.keys(before.sourceHashes).filter(key => before.sourceHashes[key] !== after.sourceHashes[key]), ['components/common/Carousel.tsx', 'app/globals.css']));
check('business SSR HTML and SEO unchanged except hero class', () => assert.equal(before.ssr.normalizedBusinessHash, after.ssr.normalizedBusinessHash));
check('image URLs/srcset/sizes/priority/ratio unchanged', () => assert.deepEqual(before.ssr.imageAttributes, after.ssr.imageAttributes));
check('all image preloads unchanged', () => assert.deepEqual(before.ssr.preloads, after.ssr.preloads));
check('other SSR carousel DOM unchanged', () => assert.deepEqual(before.ssr.otherCarousels, after.ssr.otherCarousels));
async function pixels(name, left, right, excludeExternalPortal = false) {
  const a = await sharp(resolve(root, left)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(resolve(root, right)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let differentPixels = 0, maximumChannelDifference = 0, differentHeroPixelsAboveTolerance = 0, maximumHeroChannelDifference = 0, externalPortalPixels = 0;
  const sameDimensions = a.info.width === b.info.width && a.info.height === b.info.height;
  if (sameDimensions) for (let offset = 0; offset < a.data.length; offset += 4) {
    let different = false, pixelDifference = 0;
    for (let channel = 0; channel < 4; channel++) { const diff = Math.abs(a.data[offset + channel] - b.data[offset + channel]); if (diff) different = true; maximumChannelDifference = Math.max(maximumChannelDifference, diff); pixelDifference = Math.max(pixelDifference, diff); }
    if (different) differentPixels++;
    const x = offset / 4 % a.info.width, y = Math.floor(offset / 4 / a.info.width);
    const external = excludeExternalPortal && overlay.some(box => x >= box.x - box.shadowPadding && x < box.x + box.width + box.shadowPadding && y >= box.y - box.shadowPadding && y < box.y + box.height + box.shadowPadding);
    if (external) externalPortalPixels++;
    else { maximumHeroChannelDifference = Math.max(maximumHeroChannelDifference, pixelDifference); if (pixelDifference > result.channelTolerance) differentHeroPixelsAboveTolerance++; }
  }
  const row = { name, left, right, width: a.info.width, height: a.info.height, sameDimensions, differentPixels, maximumChannelDifference, excludeExternalPortal, externalPortalPixels, differentHeroPixelsAboveTolerance, maximumHeroChannelDifference };
  result.visual.push(row);
  check(name, () => { assert(sameDimensions); assert.equal(differentHeroPixelsAboveTolerance, 0); });
}
for (const candidate of after.cases) {
  const baseline = before.cases.find(row => row.config.name === candidate.config.name), name = candidate.config.name;
  check(`${name}: no page/hydration errors`, () => { assert.equal(candidate.pageErrors, 0); assert.equal(candidate.hydrationErrors, 0); });
  check(`${name}: dimensions unchanged`, () => { assert.equal(candidate.final.width, baseline.final.width); assert.equal(candidate.final.height, baseline.final.height); assert.equal(candidate.final.dots, baseline.final.dots); });
  check(`${name}: other hydrated carousels unchanged`, () => assert.deepEqual(candidate.final.otherCarousels, baseline.final.otherCarousels));
  check(`${name}: requests/priority unchanged`, () => assert.deepEqual(candidate.requests, baseline.requests));
  if (candidate.config.mode === 'normal') check(`${name}: interactions preserved`, () => { assert(candidate.autoplay && baseline.autoplay); assert(candidate.config.device === 'mobile' ? candidate.touchSwipe && baseline.touchSwipe : candidate.dotNavigation && baseline.dotNavigation); });
  result.timings.push({ name, before: baseline.timing, after: candidate.timing });
  if (candidate.config.mode !== 'no-js') await pixels(`${name}: hydrated screenshot`, `before/${name}-hydrated.png`, `after/${name}-hydrated.png`);
}
for (const device of ['mobile', 'desktop']) {
  await pixels(`${device}: SSR without app JS equals previous hydrated visual`, `before/${device}-delayed-js-hydrated.png`, `after/${device}-no-js-ssr.png`, device === 'desktop');
  await pixels(`${device}: delayed JS SSR equals hydrated visual`, `after/${device}-delayed-js-ssr.png`, `after/${device}-delayed-js-hydrated.png`, device === 'desktop');
}
result.passed = result.failures.length === 0;
await writeFile(resolve(root, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: result.passed, failures: result.failures, visual: result.visual, timings: result.timings }, null, 2));
assert(result.passed, 'Comparison failed; all evidence retained');
