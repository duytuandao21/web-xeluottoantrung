// Windows/Linux runner. Isolated API + production Next; no dotenv DB or remote
// target. Only sanitized perf events and k6 aggregates are written as evidence.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..'), api = resolve(web, '../api-xeluottoantrung');
const output = resolve(web, '../docs/artifacts/perf-local-2026-10-15');
const k6 = process.env.K6_BIN || (process.platform === 'win32' ? 'C:/Program Files/k6/k6.exe' : 'k6');
const wait = ms => new Promise(done => setTimeout(done, ms));
const phases = process.argv.includes('--smoke') ? [10] : [10, 20, 30];
const capture = (child, events) => {
  let pending = '';
  child.stdout.on('data', chunk => {
    pending += chunk.toString();
    for (;;) {
      const index = pending.indexOf('\n'); if (index < 0) break;
      const line = pending.slice(0, index); pending = pending.slice(index + 1);
      try {
        const event = JSON.parse(line);
        if (event.event === 'perf_diagnostics') events.push(event);
        if (event.event === 'perf_fixture_ready') child.fixtureReady = event;
      } catch { /* Ignore application output; never persist arbitrary log text. */ }
    }
    if (pending.length > 131072) pending = '';
  });
  child.stderr.on('data', () => {});
};
function start(args, cwd, env, events) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  capture(child, events); return child;
}
await mkdir(output, { recursive: true });
await access(resolve(api, '.test-dist/test/fixtures/perf-local-server.js'));
await writeFile(resolve(output, 'environment.json'), JSON.stringify({ mode: 'local-isolated', platform: os.platform(), node: process.version,
  cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, totalMemoryGiB: os.totalmem()/1024**3,
  database: 'PGlite memory, synthetic 6 cars; not PostgreSQL pool', cache: 'existing policy, enabled, real TTL', rateLimit: '500/60s unchanged',
  stages: '30s ramp + 60s hold + 30s ramp down, sleep 2-5s, homepage HTML only; no browser assets', smoke: process.argv.includes('--smoke') }, null, 2));
for (const vus of phases) {
  const events = []; let apiChild, webChild;
  try {
    console.log(JSON.stringify({ event: 'phase_setup', vus }));
    apiChild = start(['.test-dist/test/fixtures/perf-local-server.js'], api, { NODE_ENV: 'test', PERF_DIAGNOSTICS: 'true' }, events);
    for (let i=0; !apiChild.fixtureReady; i++) { if(apiChild.exitCode !== null || i > 180) throw Error('Isolated API failed to start'); await wait(250); }
    const reservation = createServer(); await new Promise(done => reservation.listen(0, '127.0.0.1', done));
    const port = reservation.address().port; await new Promise(done => reservation.close(done));
    webChild = start([resolve(web, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], web,
      { API_URL: apiChild.fixtureReady.url, PERF_DIAGNOSTICS: 'true', NODE_ENV: 'production' }, events);
    const base = `http://127.0.0.1:${port}`;
    for (let i=0;;i++) {
      if (webChild.exitCode !== null || i > 180) throw Error('Production Next failed to start');
      try { const response = await fetch(base + '/', { signal: AbortSignal.timeout(10000) }); const html = await response.text(); if(response.ok && html.includes('Toyota') && !html.includes('Tạm thời chưa tải được dữ liệu')) break; } catch {}
      await wait(250);
    }
    // Next loads instrumentation lazily on the first request. A second warmup
    // observes the entire Node HTTP lifecycle after subscriptions are installed.
    const warmup = await fetch(base + '/'); await warmup.arrayBuffer();
    // Verify both runtime hooks before spending minutes on k6.
    await wait(31000);
    if (!events.some(e => e.role === 'web' && e.rows.some(r => r.metric === 'ssr.http')) ||
        !events.some(e => e.role === 'web' && e.rows.some(r => r.metric === 'cheerio.transform')) ||
        !events.some(e => e.role === 'api' && e.rows.some(r => r.metric === 'api.http'))) throw Error('Missing SSR/API/Cheerio instrumentation');
    const started = new Date().toISOString();
    console.log(JSON.stringify({ event: 'k6_started', vus, started }));
    const summary = resolve(output, `result-${vus}vu.json`);
    const args = ['run', '--quiet', '--summary-export', summary, '-e', `BASE_URL=${base}`, '-e', `TARGET=${vus}`];
    if (process.argv.includes('--smoke')) args.push('--duration', '5s', '--vus', '1');
    args.push(resolve(web, 'scripts/perf-homepage.k6.js'));
    const command = spawn(k6, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    command.stdout.on('data', () => {}); command.stderr.on('data', () => {});
    const exitCode = await new Promise((done, reject) => { command.once('error', reject); command.once('exit', done); });
    const finished = new Date().toISOString();
    await wait(31000); // Flush the last partial measurement window without a probe endpoint.
    await writeFile(resolve(output, `perf-${vus}vu.jsonl`), events.map(event => JSON.stringify(event)).join('\n') + '\n');
    await writeFile(resolve(output, `phase-${vus}vu.json`), JSON.stringify({ vus, started, finished, exitCode, flushWaitMs: 31000 }, null, 2));
    console.log(JSON.stringify({ event: 'k6_finished', vus, exitCode, diagnosticWindows: events.length }));
    if (exitCode !== 0 && exitCode !== 99) throw Error('k6 failed; see its aggregate summary');
  } finally {
    await writeFile(resolve(output, `perf-${vus}vu.jsonl`), events.map(event => JSON.stringify(event)).join('\n') + '\n');
    webChild?.kill(); apiChild?.kill();
  }
}
