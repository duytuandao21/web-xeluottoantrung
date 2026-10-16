import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('../docs/artifacts/perf-dom-local-2026-10-16');
const read = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const median = values => { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor(sorted.length / 2)]; };
const results = {};
for (const variant of ['before', 'after']) {
  const environment = await read(`${variant}-10vu/environment.json`);
  assert.equal(environment.composition, false); assert.equal(environment.concurrency, 8);
  const { stages } = await read(`${variant}-10vu/measurements.json`);
  assert.equal(stages.length, 9, 'Keep all nine phases; never filter errors/outliers');
  results[variant] = stages.map(stage => {
    const row = (metric, label) => stage.rows.find(row => row.role === 'web' && row.metric === metric && row.label === label);
    const home = row('ssr.prepare', 'home')?.count || 0, listing = row('ssr.prepare', 'listing')?.count || 0;
    const errors = stage.rows.filter(row => row.role === 'web' && row.metric === 'api.read').reduce((sum, row) => sum + row.errors, 0);
    assert.equal(home + listing, stage.requests, 'One SSR preparation per k6 request');
    assert.equal(stage.apiFetchCount, home * 25 + listing * 20, 'No read removed or added');
    assert.equal(row('api.read', 'home-content'), undefined, 'Composition is off');
    assert.equal(errors, 0); assert.equal(stage.dropped, 0); assert(stage.peakActive <= 8);
    // Error phases remain in the output; validity is explicit, not a filter.
    return { key: stage.key, workload: stage.workload, requests: stage.requests, valid: stage.errorRate === 0 && stage.checksFailed === 0,
      httpP95Ms: stage.httpP95Ms, rps: stage.rps, errorRate: stage.errorRate, checksFailed: stage.checksFailed,
      cpuMsPerRequest: stage.web.cpuMs / stage.requests, avgELU: stage.web.avgELU, peakELU: stage.web.peakELU,
      publicHomeTransformMs: row('cheerio.transform', 'public-home')?.avgMs ?? null,
      homeComponentTransformMs: row('cheerio.transform', 'home-component')?.avgMs ?? null,
      legacyTransformMs: row('cheerio.transform', 'legacy-page')?.avgMs,
      homeParseMs: row('cheerio.parse', 'home-component')?.avgMs ?? null,
      homeSerializeMs: row('cheerio.serialize', 'public-page')?.avgMs ?? null,
      queueWindowP95Ms: Object.fromEntries(['content', 'cars', 'accessories'].map(label => [label, row('api.queue', label)?.maxWindowP95Ms ?? null])),
      peakWaiting: stage.peakWaiting, peakActive: stage.peakActive, host: stage.host, home, listing, apiFetchCount: stage.apiFetchCount };
  });
  for (const workload of ['home', 'listing', 'mixed']) assert.equal(results[variant].filter(stage => stage.workload === workload && stage.valid).length, 3, 'Need three valid runs per workload, retain failures separately');
}
const comparison = ['home', 'listing', 'mixed'].map(workload => {
  const summarize = variant => {
    const stages = results[variant].filter(stage => stage.workload === workload);
    const fields = ['httpP95Ms', 'rps', 'cpuMsPerRequest', 'avgELU', 'publicHomeTransformMs', 'homeComponentTransformMs', 'homeParseMs', 'peakWaiting'];
    return { runs: stages.length, requests: stages.reduce((sum, stage) => sum + stage.requests, 0),
      ...Object.fromEntries(fields.map(key => { const values = stages.map(stage => stage[key]).filter(value => value !== null); return [key, values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values) } : null]; })),
      queueWindowP95Ms: Object.fromEntries(['content', 'cars', 'accessories'].map(key => { const values = stages.map(stage => stage.queueWindowP95Ms[key]).filter(value => value !== null); return [key, values.length ? median(values) : null]; })),
      errors: stages.reduce((sum, stage) => sum + stage.checksFailed, 0) };
  };
  const before = summarize('before'), after = summarize('after');
  return { workload, before, after, httpP95ChangePercent: (after.httpP95Ms.median / before.httpP95Ms.median - 1) * 100,
    cpuChangePercent: (after.cpuMsPerRequest.median / before.cpuMsPerRequest.median - 1) * 100 };
});
const output = { note: 'Median of three per-run p95s, not a pooled percentile. Queue = median of per-run maximum window p95. No failing run/outlier removed.', results, comparison };
await writeFile(resolve(root, 'comparison.json'), JSON.stringify(output, null, 2));
const lines = ['# All 18 benchmark runs', '', 'CPU = Next process ms/request; ELU = window-weighted mean. Queue = maximum window p95 per run, in ms. Host = mean/peak busy %. No failed run or outlier removed.', '',
  '| Build | Run | Requests | HTTP p95 ms | RPS | CPU ms/req | ELU | Queue content/cars/accessories ms | Waiting peak | Host mean/peak % | HTTP errors % |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: |'];
const fixed = (value, decimals = 2) => value === null || value === undefined ? '-' : value.toFixed(decimals);
for (const variant of ['before', 'after']) for (const stage of results[variant]) lines.push(`| ${variant} | ${stage.key.replace('benchmark-', '')} | ${stage.requests} | ${fixed(stage.httpP95Ms)} | ${fixed(stage.rps, 3)} | ${fixed(stage.cpuMsPerRequest)} | ${fixed(stage.avgELU, 3)} | ${Object.values(stage.queueWindowP95Ms).map(value => fixed(value)).join(' / ')} | ${stage.peakWaiting} | ${fixed(stage.host.avgBusy * 100, 1)} / ${fixed(stage.host.peakBusy * 100, 1)} | ${fixed(stage.errorRate * 100)} |`);
await writeFile(resolve(root, 'benchmark-runs.md'), lines.join('\n') + '\n');
for (const value of comparison) console.log(JSON.stringify(value));
