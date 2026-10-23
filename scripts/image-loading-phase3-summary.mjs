// Offline summary only; no API, browser or credentials.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = 'artifacts/image-loading-phase3';
const read = name => readFile(`${root}/${name}.json`, 'utf8').then(JSON.parse);
const [before, after, trial, pilot, comparison, rollback] = await Promise.all([
  read('before'), read('after'), read('trial-b'), read('before-attempt1'), read('comparison'), read('rollback-check'),
]);
assert.equal(before.failures.length, 0);
assert.equal(after.failures.length, 0);
assert(comparison.ssrGolden && comparison.heroUnchanged && comparison.apiUnchanged);
assert(rollback.sourceDiffEmpty && rollback.imagePreloads === before.inventory.preloads.length);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const stats = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) });
function timing(run, width) {
  const cases = run.cases.filter(c => c.name.startsWith('timing-') && c.width === width);
  return {
    n: cases.length,
    samples: cases.map(c => ({ name: c.name, fcpMs: c.metrics.fcp, lcpMs: c.metrics.lcp.time,
      ttfbMs: c.metrics.ttfb, cls: c.metrics.cls, imageRequests: c.requests.length,
      completedImages: c.completedImages, imageBytes: c.imageBytes, failedStatuses: c.requests.filter(i => i.status !== 200).length })),
    fcpMs: stats(cases.map(c => c.metrics.fcp)), lcpMs: stats(cases.map(c => c.metrics.lcp.time)),
    ttfbMs: stats(cases.map(c => c.metrics.ttfb)), cls: stats(cases.map(c => c.metrics.cls)),
    imageRequests: stats(cases.map(c => c.requests.length)), imageBytes: stats(cases.map(c => c.imageBytes)),
  };
}
function preloadGroups(run) {
  const counts = {};
  for (const preload of run.inventory.preloads) {
    const image = run.inventory.images.find(i => preload.imagesrcset ? preload.imagesrcset === i.srcset : preload.href === i.src);
    assert(image, 'Every image preload maps to an SSR image');
    const a = image.ancestors;
    const group = a.includes('tt-footer') ? 'footer' : a.includes('slider_slick') ? 'hero'
      : a.includes('home-buy-banner') ? 'buySellBanner' : a.includes('thuonghieu') ? 'brandsAndBodyStyles'
      : a.includes('car-card-gallery') ? 'carCovers' : a.includes('mota') ? 'carSpecIcons'
      : a.includes('btn-frame') ? 'floatingContacts' : 'headerLogos';
    counts[group] = (counts[group] || 0) + 1;
  }
  return counts;
}
function heroRequests(run) {
  const sourcePaths = run.hero.images.map(i => {
    const tail = i.src.split('/cdn-cgi/image/')[1]?.replace(/^[^/]+\//, '');
    return new URL(tail || i.src).pathname;
  });
  return run.cases.filter(c => c.name.startsWith('timing-')).map(c => ({ name: c.name,
    slides: sourcePaths.map(path => ({ count: c.requests.filter(r => r.url.includes(path)).length,
      priorities: [...new Set(c.requests.filter(r => r.url.includes(path)).map(r => r.priority))] })),
  }));
}
const protectedFiles = ['components/layout/Footer.tsx', 'components/common/Carousel.tsx', 'components/common/ResponsiveImage.tsx', 'components/common/Markup.tsx', 'lib/image-delivery.ts', 'lib/public-pages.ts', 'lib/public-api.ts', 'app/(website)/page.tsx', 'app/(website)/layout.tsx', 'app/globals.css', 'public/assets/css/style.css', 'next.config.ts', 'package.json', 'package-lock.json'];
const protectedSha256 = Object.fromEntries(await Promise.all(protectedFiles.map(async name => [name, createHash('sha256').update(await readFile(name)).digest('hex')])));
const summary = {
  date: '2026-10-19', scope: 'Local production-build trials; application patches rolled back',
  decision: 'ROLLBACK: stable LCP benefit/non-regression not demonstrated',
  versions: { node: process.version, next: '15.5.25', chrome: '155.0.8059.84' },
  buildIds: { before: before.buildId, broaderTrial: trial.buildId, footerOnlyCandidate: after.buildId, restored: rollback.buildId },
  methodology: { windowMs: 12000, coldBrowser: true, publicApiAndImageReplay: true,
    mobile: { width: 390, height: 844, dpr: 3, latencyMs: 150, downloadBytesPerSecond: 200000, cpuRate: 4 },
    desktop: { width: 1440, height: 1000, dpr: 1, latencyMs: 150, downloadBytesPerSecond: 1250000, cpuRate: 1 },
    note: 'Not PSI or a production CDN/TTFB benchmark. All completed timing samples retained, including pilot/outliers.' },
  preloads: { before: before.inventory.preloads.length, broaderTrial: trial.inventory.preloads.length,
    footerOnlyCandidate: after.inventory.preloads.length, restored: rollback.imagePreloads, beforeGroups: preloadGroups(before), candidateGroups: preloadGroups(after) },
  mobile: { pilot: timing(pilot, 390), before: timing(before, 390), broaderTrial: timing(trial, 390), candidate: timing(after, 390) },
  desktop: { pilot: timing(pilot, 1440), before: timing(before, 1440), broaderTrial: timing(trial, 1440), candidate: timing(after, 1440) },
  heroRequests: { before: heroRequests(before), candidate: heroRequests(after) },
  checks: { beforeCases: before.cases.length, candidateCases: after.cases.length,
    beforeFailures: before.failures.length, candidateFailures: after.failures.length,
    visualComparisons: comparison.visuals.length, pixelIdentical: comparison.visuals.filter(v => !v.changedPixels).length,
    maxChangedPixelRatio: Math.max(...comparison.visuals.map(v => v.ratio)),
    visualGatePassed: comparison.visuals.every(v => v.ratio <= 0.0025),
    overPixelGate: comparison.visuals.filter(v => v.ratio > 0.0025),
    exactGeometry: true, exactBusinessDomAndSeo: true, exactImageDeliveryAttributesExceptLoading: true,
    functions: after.cases.filter(c => !c.metrics).map(c => ({ name: c.name, autoplay: c.autoplay,
      rapidSwipe: c.rapidSwipe, fallback: !!c.fallback?.ready, finalImageError: c.finalImageError,
      noJsHeroVisible: c.staticHero?.visible, delayedJsHeroVisible: c.beforeJS?.visible,
      pageErrors: c.errors.length, hydrationErrors: c.hydrationErrors.length })),
  },
  protectedSha256,
  rollback,
};
await writeFile(`${root}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
await writeFile('docs/image-loading-phase3-results.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ decision: summary.decision, preloads: summary.preloads, mobile: { before: summary.mobile.before, candidate: summary.mobile.candidate }, desktop: { before: summary.desktop.before, candidate: summary.desktop.candidate }, checks: summary.checks }, null, 2));
