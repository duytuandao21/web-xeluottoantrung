import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const suite = process.env.PERF_ARTIFACT_SUITE || 'perf-composition-local-2026-10-15';
if (!/^[a-z0-9-]{1,80}$/.test(suite)) throw Error('Invalid artifact suite');
const directory = resolve('../docs/artifacts', suite, process.argv[2] || 'baseline');
const files = await readdir(directory);
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const stages = [], profiles = [];
for (const file of files.filter(name => name.endsWith('.cpuprofile'))) {
  const profile = await read(file), nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const self = new Map(), byFile = new Map(); let idleUs = 0, totalUs = 0;
  const safeFile = url => url.replace(/^file:\/\/\//, '').replace(/^.*?\/xeluottoantrung\/web-xeluottoantrung\//i, '').replace(/^.*?\\xeluottoantrung\\web-xeluottoantrung\\/i, '');
  for (let i = 0; i < profile.samples.length; i++) {
    const frame = nodes.get(profile.samples[i]).callFrame, delta = profile.timeDeltas[i] || 0;
    totalUs += delta; if (frame.functionName === '(idle)') idleUs += delta;
    const key = JSON.stringify({ name: frame.functionName || '(anonymous)', file: safeFile(frame.url || '(native)'), line: frame.lineNumber + 1, column: frame.columnNumber + 1 });
    self.set(key, (self.get(key) || 0) + delta);
    const file = frame.url ? safeFile(frame.url) : frame.functionName || '(native)';
    byFile.set(file, (byFile.get(file) || 0) + delta);
  }
  profiles.push({ file, samples: profile.samples.length, totalSampleMs: totalUs / 1000, idleSampleMs: idleUs / 1000,
    note: 'Main-thread sampling wall-time attribution, not process CPU; inclusive stacks must not be added together.',
    byFile: [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([file, us]) => ({ file, sampleMs: us / 1000, percentAll: us / totalUs * 100,
      percentNonIdle: file === '(idle)' ? null : us / Math.max(1, totalUs - idleUs) * 100 })),
    topSelf: [...self].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([key, us]) => ({ ...JSON.parse(key), sampleMs: us / 1000, percentAll: us / totalUs * 100,
      percentNonIdle: JSON.parse(key).name === '(idle)' ? null : us / Math.max(1, totalUs - idleUs) * 100 })) });
}
for (const file of files.filter(name => name.startsWith('benchmark-') && name.endsWith('-phase.json'))) {
  const key = file.replace('-phase.json', ''), phase = await read(file), k6 = await read(`${key}-k6.json`);
  const all = (await readFile(resolve(directory, `${key}-perf.jsonl`), 'utf8')).trim().split('\n').filter(Boolean).map((line, index) => ({ ...JSON.parse(line), line: index + 1 }));
  const windows = all.filter(event => Date.parse(event.time) > Date.parse(phase.started) && Date.parse(event.time) - event.windowMs < Date.parse(phase.finished));
  const combined = new Map();
  for (const window of windows) for (const row of window.rows) {
    const key = `${window.role}:${row.metric}:${row.label}`;
    const item = combined.get(key) || { role: window.role, metric: row.metric, label: row.label, count: 0, sumMs: 0, errors: 0, status429: 0, status503: 0, maxWindowP95Ms: 0, maxMs: 0 };
    for (const name of ['count', 'sumMs', 'errors', 'status429', 'status503']) item[name] += row[name];
    item.maxMs = Math.max(item.maxMs, row.maxMs); item.maxWindowP95Ms = Math.max(item.maxWindowP95Ms, row.p95Ms); combined.set(key, item);
  }
  const rows = [...combined.values()].map(item => ({ ...item, avgMs: item.sumMs / item.count }));
  const runtime = role => {
    const values = windows.filter(window => window.role === role), span = values.reduce((sum, window) => sum + window.windowMs, 0);
    return { cpuMs: values.reduce((sum, window) => sum + window.runtime.cpuMs, 0), measuredWindowMs: span,
      avgCpuCores: values.reduce((sum, window) => sum + window.runtime.cpuMs, 0) / span,
      avgELU: values.reduce((sum, window) => sum + window.runtime.eventLoopUtilization * window.windowMs, 0) / span,
      peakELU: Math.max(...values.map(window => window.runtime.eventLoopUtilization)), peakRssMiB: Math.max(...values.map(window => window.runtime.rssMiB)) };
  };
  stages.push({ key, workload: phase.workload, repeat: phase.repeat, ...(phase.composition === undefined ? {} : { composition: phase.composition }),
    host: phase.host?.length ? { samples: phase.host.length, avgBusy: phase.host.reduce((sum, row) => sum + row.busy, 0) / phase.host.length,
      peakBusy: Math.max(...phase.host.map(row => row.busy)), minAvailableMiB: Math.min(...phase.host.map(row => row.availableMiB)) } : undefined,
    requests: k6.metrics.http_reqs.count, rps: k6.metrics.http_reqs.rate,
    httpP95Ms: k6.metrics.http_req_duration['p(95)'], httpAvgMs: k6.metrics.http_req_duration.avg, errorRate: k6.metrics.http_req_failed.value,
    ttfbP95Ms: k6.metrics.http_req_waiting['p(95)'],
    checksFailed: k6.metrics.checks.fails, apiFetchCount: rows.filter(row => row.role === 'web' && row.metric === 'api.fetch').reduce((sum, row) => sum + row.count, 0),
    dropped: windows.reduce((sum, window) => sum + window.dropped, 0), peakWaiting: Math.max(...windows.map(window => window.peaks['api.waiting'] || 0)),
    peakActive: Math.max(...windows.map(window => window.peaks['api.active'] || 0)),
    web: runtime('web'), api: runtime('api'), rows });
}
await writeFile(resolve(directory, 'measurements.json'), JSON.stringify({ percentileNote: 'Queue uses max window p95, not global p95; HTTP p95 is k6 whole run.', profiles, stages }, null, 2));
for (const profile of profiles) console.log(JSON.stringify({ file: profile.file, topSelf: profile.topSelf.slice(0, 12) }));
for (const stage of stages) console.log(JSON.stringify({ ...stage, rows: undefined }));
