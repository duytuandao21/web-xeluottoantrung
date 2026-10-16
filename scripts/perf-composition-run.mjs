// Isolated production-build measurements. Never reads API .env or targets a VPS.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..'), api = resolve(web, '../api-xeluottoantrung');
const variant = process.argv[2];
if (!['baseline', 'composition', 'rollback', 'paired'].includes(variant)) throw Error('Specify baseline/composition/rollback/paired');
const target = Number(process.env.PERF_VUS || 20);
if (![10, 20].includes(target)) throw Error('PERF_VUS must be 10 or 20');
const outputTag = process.env.PERF_OUTPUT_TAG || variant;
if (!/^[a-z0-9-]{1,60}$/.test(outputTag)) throw Error('Invalid output tag');
const artifactSuite = process.env.PERF_ARTIFACT_SUITE || 'perf-composition-local-2026-10-15';
if (!/^[a-z0-9-]{1,80}$/.test(artifactSuite)) throw Error('Invalid artifact suite');
const output = resolve(web, '../docs/artifacts', artifactSuite, target === 20 ? outputTag : `${outputTag}-${target}vu`);
const wait = ms => new Promise(done => setTimeout(done, ms));
const k6 = process.env.K6_BIN || (process.platform === 'win32' ? 'C:/Program Files/k6/k6.exe' : 'k6');
const buildId = (await readFile(resolve(web, '.next/BUILD_ID'), 'utf8')).trim();
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'environment.json'), JSON.stringify({ variant, node: process.version, platform: os.platform(),
  cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, memoryGiB: os.totalmem()/1024**3,
  database: 'PGlite memory; real SQL/services/cache/guard; no PostgreSQL TCP pool',
  dataset: '24 cars / 5 slides / 6 testimonials / 4 articles / 12 accessories / all nine CMS groups',
  concurrency: 8, rateLimit: '500/60s', composition: variant === 'paired' ? 'per phase' : variant === 'composition', buildId, vus: target,
  workload: '10s ramp/40s hold/10s down; mixed even VUs listing, odd VUs home; deterministic 2-4.9s sleep' }, null, 2));

async function cdp(url) {
  const socket = new WebSocket(url); await once(socket, 'open'); let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => { const reply = JSON.parse(event.data); const call = pending.get(reply.id); if (call) { pending.delete(reply.id); reply.error ? call.reject(Error('Inspector command failed')) : call.resolve(reply.result); } });
  return { send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }), close: () => socket.close() };
}
function start(args, cwd, env, events, ipc = false) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
  let pending = '';
  child.stdout.on('data', chunk => { pending += chunk; for (;;) { const index = pending.indexOf('\n'); if (index < 0) break;
    const line = pending.slice(0, index); pending = pending.slice(index + 1);
    try { const event = JSON.parse(line); if (event.event === 'perf_diagnostics') events.push(event); if (event.event === 'perf_fixture_ready') child.ready = event; } catch { /* No arbitrary application logs retained. */ }
  } if (pending.length > 131072) pending = ''; });
  child.stderr.on('data', chunk => {
    const text = String(chunk), match = /ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/.exec(text); if (match) child.inspector = match[0];
    // Fixed error codes only; never persist arbitrary application output.
    const code = /\b(EADDRINUSE|EACCES|EPERM|ENOENT|MODULE_NOT_FOUND)\b/.exec(text); if (code) child.startupCode = code[1];
  });
  return child;
}
async function until(check, message, child) { for (let i = 0; i < 720; i++) { if (await check()) return; if (child?.exitCode !== null && child?.exitCode !== undefined) throw Error(`${message}: exit=${child.exitCode}, code=${child.startupCode || 'unknown'}`); await wait(250); } throw Error(message); }
const runList = [];
if (variant === 'paired') {
  for (const workload of ['home', 'listing', 'mixed']) for (const composition of [false, true]) runList.push({ workload, composition, profile: false, repeat: 1 });
} else {
  if (!process.argv.includes('--no-profile')) for (const workload of ['home', 'listing', 'mixed']) runList.push({ workload, profile: true, repeat: 0 });
  if (!process.argv.includes('--profile-only')) for (let repeat = 1; repeat <= (variant === 'rollback' ? 1 : 3); repeat++) for (const workload of ['home', 'listing', 'mixed']) runList.push({ workload, profile: false, repeat });
}
for (const run of runList) {
  const key = `${run.profile ? 'profile' : 'benchmark'}-${run.workload}-${variant === 'paired' ? `${run.composition ? 'on' : 'off'}-` : ''}${run.repeat}`;
  if (process.argv.includes('--resume')) {
    try { await access(resolve(output, `${key}-phase.json`)); console.log(JSON.stringify({ event: 'local_run_already_saved', variant, key })); continue; }
    catch { /* Only completed phases can be skipped. */ }
  }
  console.log(JSON.stringify({ event: 'local_run_setup', variant, key }));
  const events = []; let apiChild, webChild, inspector, hostTimer;
  try {
    if ((await readFile(resolve(web, '.next/BUILD_ID'), 'utf8')).trim() !== buildId) throw Error('Build changed during benchmark; stop rather than mix results');
    apiChild = start(['.test-dist/test/fixtures/perf-local-server.js'], api, { NODE_ENV: 'test', PERF_DIAGNOSTICS: 'true' }, events, true);
    await until(() => !!apiChild.ready, 'Fixture startup failed', apiChild);
    const reservation = createServer(); await new Promise(done => reservation.listen(0, '127.0.0.1', done)); const port = reservation.address().port; await new Promise(done => reservation.close(done));
    webChild = start(['--inspect=127.0.0.1:0', resolve(web, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], web,
      { NODE_ENV: 'production', API_URL: apiChild.ready.url, PERF_DIAGNOSTICS: 'true', HOME_CMS_COMPOSITION: (run.composition ?? variant === 'composition') ? 'true' : 'false' }, events);
    const base = `http://127.0.0.1:${port}`;
    await until(async () => { try { const response = await fetch(base + '/', { signal: AbortSignal.timeout(5000) }); return response.ok && (await response.text()).includes('Toyota'); } catch { return false; } }, 'Next startup failed', webChild);
    await until(() => !!webChild.inspector, 'Inspector startup failed', webChild);
    inspector = await cdp(webChild.inspector);
    for (let i = 0; i < 3; i++) for (const route of ['/', '/san-pham']) { const response = await fetch(base + route); await response.arrayBuffer(); }
    await wait(250); // Drain warmup HTTP response-finish notifications before reset.
    await inspector.send('Runtime.evaluate', { expression: 'globalThis.__ttPerfObserver.flush()' });
    const flushed = once(apiChild, 'message'); apiChild.send('perf:flush'); await flushed;
    events.length = 0;
    const started = new Date().toISOString();
    const cpuTimes = () => os.cpus().reduce((value, cpu) => ({ idle: value.idle + cpu.times.idle,
      total: value.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
    let previousCpu = cpuTimes(); const host = [];
    hostTimer = setInterval(() => { const current = cpuTimes(), total = current.total - previousCpu.total;
      if (host.length < 120 && total > 0) host.push({ busy: 1 - (current.idle - previousCpu.idle) / total, availableMiB: os.freemem()/1048576 });
      previousCpu = current; }, 1000); hostTimer.unref();
    if (run.profile) {
      await inspector.send('Profiler.enable'); await inspector.send('Profiler.setSamplingInterval', { interval: 1000 }); await inspector.send('Profiler.start');
      const deadline = Date.now() + 35000;
      await Promise.all(Array.from({ length: 8 }, async (_, index) => { let iteration = 0; while (Date.now() < deadline) {
        const route = run.workload === 'listing' || run.workload === 'mixed' && index % 2 === 0 ? '/san-pham' : '/';
        const response = await fetch(base + route); const html = await response.text(); if (!response.ok || !html.includes('Toyota')) throw Error('Profile workload failed');
        await wait(1000 + (index + iteration++ * 3) % 10 * 100);
      } }));
      const { profile } = await inspector.send('Profiler.stop');
      await writeFile(resolve(output, `${key}.cpuprofile`), JSON.stringify(profile));
      await inspector.send('Profiler.disable');
    } else {
      const command = spawn(k6, ['run', '--quiet', '--summary-export', resolve(output, `${key}-k6.json`), '-e', `BASE_URL=${base}`, '-e', `WORKLOAD=${run.workload}`, '-e', `TARGET=${target}`, resolve(web, 'scripts/perf-composition.k6.js')], { windowsHide: true, stdio: 'ignore' });
      const [exitCode] = await once(command, 'exit'); run.exitCode = exitCode;
      if (exitCode !== 0) run.failed = true;
    }
    const finished = new Date().toISOString(); clearInterval(hostTimer); await wait(250);
    await inspector.send('Runtime.evaluate', { expression: 'globalThis.__ttPerfObserver.flush()' });
    const flushedEnd = once(apiChild, 'message'); apiChild.send('perf:flush'); await flushedEnd; await wait(50);
    await writeFile(resolve(output, `${key}-perf.jsonl`), events.map(event => JSON.stringify(event)).join('\n') + '\n');
    await writeFile(resolve(output, `${key}-phase.json`), JSON.stringify({ ...run, started, finished, profiled: run.profile, dataset: apiChild.ready.database, buildId, vus: target, host }, null, 2));
    console.log(JSON.stringify({ event: 'local_run_finished', variant, key, windows: events.length, exitCode: run.exitCode ?? 0 }));
    if (run.failed) throw Error(`k6 stopped with code ${run.exitCode}; failed phase and diagnostics preserved`);
  } finally { clearInterval(hostTimer); inspector?.close(); webChild?.kill(); apiChild?.kill(); }
}
