import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const out = '../toi-uu-hieu-suat-website/phase-3';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = { lighthouseVersion: '', api: 'http://52.65.173.30', unit: 'bytes / milliseconds, unless stated otherwise', devices: {} };
for (const device of ['desktop', 'mobile']) {
  summary.devices[device] = {};
  for (const stage of ['before', 'after']) {
    const runs = [];
    for (let run = 1; run <= 3; run++) {
      const r = JSON.parse(fs.readFileSync(`${out}/lighthouse-${stage}-${device}-${run}.json`, 'utf8')); assert(!r.runtimeError);
      summary.lighthouseVersion = r.lighthouseVersion;
      const requests = r.audits['network-requests'].details.items;
      const bytes = type => requests.filter(i => !type || i.resourceType === type).reduce((n, i) => n + (i.transferSize || 0), 0);
      const lcp = r.audits['lcp-breakdown-insight']?.details?.items || [];
      runs.push({ run, score: r.categories.performance.score * 100, ttfb: r.audits['server-response-time'].numericValue,
        fcp: r.audits['first-contentful-paint'].numericValue, lcp: r.audits['largest-contentful-paint'].numericValue,
        speedIndex: r.audits['speed-index'].numericValue, tbt: r.audits['total-blocking-time'].numericValue,
        cls: r.audits['cumulative-layout-shift'].numericValue, totalBytes: bytes(), imageBytes: bytes('Image'),
        fontBytes: bytes('Font'), jsBytes: bytes('Script'), cssBytes: bytes('Stylesheet'), imageCount: requests.filter(i => i.resourceType === 'Image').length,
        lcpElement: lcp.find(i => i.type === 'node'), lcpBreakdown: lcp.find(i => i.type === 'table')?.items,
        largest: [...requests].sort((a, b) => b.transferSize - a.transferSize).slice(0, 8).map(i => ({ url: i.url, bytes: i.transferSize, type: i.resourceType, priority: i.priority })) });
      summary.devices[device].configuration = r.configSettings;
    }
    const keys = ['score', 'ttfb', 'fcp', 'lcp', 'speedIndex', 'tbt', 'cls', 'totalBytes', 'imageBytes', 'fontBytes', 'jsBytes', 'cssBytes', 'imageCount'];
    summary.devices[device][stage] = { runs, median: Object.fromEntries(keys.map(k => [k, median(runs.map(r => r[k]))])) };
  }
}
const before = JSON.parse(fs.readFileSync(`${out}/browser-before.json`)), after = JSON.parse(fs.readFileSync(`${out}/browser-after.json`));
assert.equal(before.cases.length, 6); assert.equal(after.cases.length, 6);
summary.browser = { beforeBuildId: before.buildId, afterBuildId: after.buildId, cases: after.cases.map(r => {
  const old = before.cases.find(b => b.width === r.width), bytes = (rows, type) => rows.filter(i => !type || i.type === type).reduce((n, i) => n + (i.bytes || 0), 0);
  return { width: r.width, beforeBytes: bytes(old.initial), afterBytes: bytes(r.initial), beforeFonts: bytes(old.initial, 'Font'), afterFonts: bytes(r.initial, 'Font'),
    beforeJS: bytes(old.initial, 'Script'), afterJS: bytes(r.initial, 'Script'), beforeCLS: old.cls, afterCLS: r.cls };
}) };
const walk = p => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${p}/${e.name}`) : [`${p}/${e.name}`]);
const originals = JSON.parse(fs.readFileSync(`${out}/source-hashes-before.json`, 'utf8'));
const files = [...['app', 'components', 'lib', 'public', 'config'].flatMap(walk), 'next.config.ts', 'package.json', 'package-lock.json'];
const hashes = Object.fromEntries(files.map(p => [p, createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const preservation = { changed: Object.keys(originals).filter(p => hashes[p] !== originals[p]), added: files.filter(p => !(p in originals)), removed: Object.keys(originals).filter(p => !(p in hashes)) };
assert(!preservation.changed.some(p => /\.(otf|ttf|png|jpe?g|webp|svg|gif|avif)$/.test(p))); assert(!preservation.changed.some(p => ['package.json', 'package-lock.json'].includes(p)));
fs.writeFileSync(`${out}/source-preservation.json`, JSON.stringify(preservation, null, 2));
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
for (const device of ['desktop', 'mobile']) console.log(device, JSON.stringify({ before: summary.devices[device].before.median, after: summary.devices[device].after.median }));
console.log('Preservation:', JSON.stringify(preservation));
