import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('../docs/artifacts/perf-local-2026-10-15');
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const summary = [];
for (const vus of [10, 20, 30]) {
  const phase = await read(`phase-${vus}vu.json`), k6 = await read(`result-${vus}vu.json`);
  const all = (await readFile(resolve(directory, `perf-${vus}vu.jsonl`), 'utf8')).trim().split('\n').map((line, i) => ({ ...JSON.parse(line), line: i + 1 }));
  const windows = all.filter(event => Date.parse(event.time) > Date.parse(phase.started) && Date.parse(event.time) - event.windowMs < Date.parse(phase.finished));
  const combined = new Map();
  for (const window of windows) for (const row of window.rows) {
    const key = `${window.role}:${row.metric}:${row.label}`;
    const item = combined.get(key) || { role: window.role, metric: row.metric, label: row.label,
      count: 0, sumMs: 0, errors: 0, status429: 0, status503: 0, clipped: 0, maxMs: 0,
      minWindowP95Ms: Infinity, maxWindowP95Ms: 0, evidenceLines: [] };
    for (const name of ['count', 'sumMs', 'errors', 'status429', 'status503', 'clipped']) item[name] += row[name];
    item.maxMs = Math.max(item.maxMs, row.maxMs);
    item.minWindowP95Ms = Math.min(item.minWindowP95Ms, row.p95Ms);
    item.maxWindowP95Ms = Math.max(item.maxWindowP95Ms, row.p95Ms);
    item.evidenceLines.push(window.line); combined.set(key, item);
  }
  const rows = [...combined.values()].map(item => ({ ...item, avgMs: item.sumMs / item.count }));
  const runtime = role => {
    const values = windows.filter(window => window.role === role);
    return { peakCpuCores: Math.max(...values.map(window => window.runtime.cpuMs / window.windowMs)),
      peakEventLoopUtilization: Math.max(...values.map(window => window.runtime.eventLoopUtilization)),
      peakEventLoopDelayP95Ms: Math.max(...values.map(window => window.runtime.eventLoopDelayP95Ms)),
      peakRssMiB: Math.max(...values.map(window => window.runtime.rssMiB)),
      peakHeapUsedMiB: Math.max(...values.map(window => window.runtime.heapUsedMiB)) };
  };
  const http = rows.find(row => row.role === 'web' && row.metric === 'ssr.http' && row.label === 'home');
  const stage = { vus, phase, requests: k6.metrics.http_reqs.count, requestsPerSecond: k6.metrics.http_reqs.rate,
    durationAvgMs: k6.metrics.http_req_duration.avg, durationP95Ms: k6.metrics.http_req_duration['p(95)'],
    waitingP95Ms: k6.metrics.http_req_waiting['p(95)'], receivingP95Ms: k6.metrics.http_req_receiving['p(95)'],
    httpFailureRate: k6.metrics.http_req_failed.value, checks: k6.metrics.checks,
    ssrSamplesMatchK6: http?.count === k6.metrics.http_reqs.count,
    dropped: windows.reduce((sum, window) => sum + window.dropped, 0),
    peakActive: Math.max(...windows.map(window => window.peaks['api.active'] ?? 0)),
    peakWaiting: Math.max(...windows.map(window => window.peaks['api.waiting'] ?? 0)),
    runtime: { web: runtime('web'), api: runtime('api') },
    rows, windows: windows.map(window => ({ line: window.line, role: window.role, time: window.time, windowMs: window.windowMs })) };
  summary.push(stage);
}
await writeFile(resolve(directory, 'measurements.json'), JSON.stringify({ quantiles: 'HDR approximate p95 per window; never merged as a whole-run p95', stages: summary }, null, 2));
for (const stage of summary) {
  console.log(JSON.stringify({ ...stage, rows: undefined, windows: undefined }));
  for (const row of stage.rows) if (/ssr.http|ssr.prepare|ssr.component|cheerio.transform|html.react_parse|legacy.read/.test(row.metric) ||
    ['api.http', 'api.queue', 'api.fetch', 'api.body', 'api.read'].includes(row.metric) && ['cars', 'accessories', 'brands'].includes(row.label)) console.log(JSON.stringify(row));
}
