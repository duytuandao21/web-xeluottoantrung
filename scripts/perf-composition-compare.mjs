import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('../docs/artifacts/perf-composition-local-2026-10-15');
const median = values => { const ordered = [...values].sort((a,b) => a-b); return ordered.length % 2 ? ordered[(ordered.length-1)/2] : (ordered[ordered.length/2-1]+ordered[ordered.length/2])/2; };
const results = [], evidence = [];
for (const variant of ['baseline', 'composition', 'rollback', 'paired-10vu', 'node-paired-10vu', 'node-composition-10vu']) {
  let data; try { data = JSON.parse(await readFile(resolve(root, variant, 'measurements.json'), 'utf8')); } catch { continue; }
  for (const stage of data.stages) {
    const count = (metric, label) => stage.rows.find(row => row.role === 'web' && row.metric === metric && row.label === label)?.count || 0;
    const home = count('ssr.prepare', 'home'), listing = count('ssr.prepare', 'listing');
    const httpFinishes = count('ssr.http', 'home') + count('ssr.http', 'listing');
    const enabled = stage.composition ?? variant === 'composition';
    const expectedReads = home * (enabled ? 17 : 25) + listing * 20;
    assert.equal(home + listing, stage.requests, `${variant}/${stage.key}: prepare samples match k6`);
    assert.equal(count('ssr.component', 'layout'), stage.requests, `${variant}/${stage.key}: layout samples match k6`);
    // A warmup response finish can cross the manual flush boundary even after
    // its prepare/API work completed. Keep this visible, do not invent a read.
    assert(Math.abs(httpFinishes - stage.requests) <= 1, `${variant}/${stage.key}: unexpected HTTP-finish mismatch`);
    assert.equal(stage.apiFetchCount, expectedReads, `${variant}/${stage.key}: exact expected fan-out`);
    assert.equal(stage.dropped, 0);
    assert(stage.peakActive <= 8, `${variant}/${stage.key}: unchanged eight-slot bound`);
    assert(stage.rows.every(row => !(row.metric === 'api.read' && row.errors)), `${variant}/${stage.key}: no API read span errors`);
    const queue = label => stage.rows.find(row => row.role === 'web' && row.metric === 'api.queue' && row.label === label)?.maxWindowP95Ms || 0;
    evidence.push({ variant, key: stage.key, workload: stage.workload, enabled, requests: stage.requests, home, listing, httpFinishes,
      httpFinishBoundaryDifference: httpFinishes - stage.requests,
      expectedReads, actualReads: stage.apiFetchCount, httpErrorRate: stage.errorRate, httpP95Ms: stage.httpP95Ms,
      rps: stage.rps, cpuMsPerRequest: stage.web.cpuMs / stage.requests, avgCpuCores: stage.web.avgCpuCores,
      avgELU: stage.web.avgELU, peakWaiting: stage.peakWaiting, queueMaxWindowP95Ms: {
        content: queue('content'), homeContent: queue('home-content'), cars: queue('cars'), accessories: queue('accessories') }, host: stage.host });
  }
  for (const workload of ['home', 'listing', 'mixed']) {
    const rows = evidence.filter(row => row.variant === variant && row.workload === workload);
    if (!rows.length) continue;
    if (variant.includes('paired')) continue; // Off/on are separate observed runs.
    results.push({ variant, workload, runs: rows.length, medianOfRunP95Ms: median(rows.map(row => row.httpP95Ms)),
      minRunP95Ms: Math.min(...rows.map(row => row.httpP95Ms)), maxRunP95Ms: Math.max(...rows.map(row => row.httpP95Ms)),
      medianRps: median(rows.map(row => row.rps)), medianCpuMsPerRequest: median(rows.map(row => row.cpuMsPerRequest)),
      medianAvgCpuCores: median(rows.map(row => row.avgCpuCores)), medianAvgELU: median(rows.map(row => row.avgELU)),
      httpErrors: rows.some(row => row.httpErrorRate > 0) });
  }
}
let failedControl;
try {
  const source = JSON.parse(await readFile(resolve(root, 'paired/benchmark-home-off-1-k6.json'), 'utf8')).metrics;
  failedControl = { variant: 'paired-20vu', enabled: false, requests: source.http_reqs.count,
    httpFailureRate: source.http_req_failed.value, httpP95Ms: source.http_req_duration['p(95)'],
    completed: false, exitCode: 99, diagnosticsAvailable: false,
    note: 'Stopped on errors. Earlier harness threw before flushing diagnostics; this was fixed for subsequent runs. Never include this as a successful baseline.' };
} catch { /* No failed artifact on a fresh independent run. */ }
await writeFile(resolve(root, 'comparison.json'), JSON.stringify({
  percentileNote: 'Median of run p95 is NOT a pooled/global p95. Queue values are maximum per-window p95.',
  results, evidence, failedControl,
}, null, 2));
console.log(JSON.stringify({ verifiedBenchmarkPhases: evidence.length, exactFanoutAndMatchingPrepareCounts: true, failedControlPreserved: !!failedControl }));
