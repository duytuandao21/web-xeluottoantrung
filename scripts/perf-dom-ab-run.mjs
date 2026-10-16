// Sequential paired tests. Never target a remote host, change API or rebuild in a run.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { activate, api, exists, output, sha, web, workspace } from './perf-dom-ab-builds.mjs';
import { hostSampler } from './perf-dom-host.mjs';
const wait = ms => new Promise(done => setTimeout(done, ms));
const protocol = JSON.parse(await readFile(resolve(output, 'protocol.json'), 'utf8'));
const source = JSON.parse(await readFile(resolve(output, 'source-initial.json'), 'utf8'));
const runs = resolve(output, 'runs'); await mkdir(runs, { recursive: true });
const k6 = process.env.K6_BIN || 'C:/Program Files/k6/k6.exe';
async function verifySource() {
  for (const [name, hash] of Object.entries(source.files)) assert.equal(sha(await readFile(resolve(workspace, name))), hash, `Source changed: ${name}`);
}
function start(args, cwd, env, events, ipc = false) {
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) { const index = buffer.indexOf('\n'); if (index < 0) break; const line = buffer.slice(0,index); buffer = buffer.slice(index+1);
      try { const value = JSON.parse(line); if (value.event === 'perf_diagnostics') events.push(value); if (value.event === 'perf_fixture_ready') child.ready = value; } catch { /* Do not persist arbitrary application output. */ }
    } if (buffer.length > 131072) buffer = '';
  });
  child.stderr.on('data', chunk => { const match = /ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/.exec(String(chunk)); if (match) child.inspector = match[0]; });
  return child;
}
async function until(check, child) {
  for (let i = 0; i < 720; i++) { if (await check()) return; assert.equal(child.exitCode, null, 'Benchmark child exited during setup'); await wait(250); }
  throw Error('Benchmark readiness deadline exceeded');
}
async function cdp(url) {
  const socket = new WebSocket(url); await once(socket, 'open'); let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const reply = JSON.parse(event.data), callback = pending.get(reply.id); if (callback) { pending.delete(reply.id); callback(reply); } });
  return { send: (method, params = {}) => new Promise((done, reject) => { const sequence = ++id;
    const timeout = setTimeout(() => { pending.delete(sequence); reject(Error('Inspector deadline exceeded')); }, 10000);
    pending.set(sequence, result => { clearTimeout(timeout); result.error ? reject(Error('Inspector failed')) : done(result.result); });
    socket.send(JSON.stringify({ id: sequence, method, params })); }), close: () => socket.close() };
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, 'exit'); child.kill(); await ended;
}
let sequence = 0;
try {
  for (const executor of protocol.executors) for (const workload of protocol.workloads) for (const [index, label] of protocol.order.entries()) {
    const number = ++sequence, key = `run-${String(number).padStart(2,'0')}-${executor}-${workload}-${label}`;
    if (await exists(resolve(runs, `${key}-phase.json`))) {
      assert(process.argv.includes('--resume'), 'Existing results: use resume, never overwrite');
      console.log(JSON.stringify({ event: 'dom_ab_saved', key })); continue;
    }
    await verifySource(); const build = await activate(label);
    console.log(JSON.stringify({ event: 'dom_ab_setup', key, pair: Math.floor(index/2)+1 }));
    let apiChild, webChild, inspector, sampler, loadChild;
    const events = [];
    const phase = { key, executor, workload, variant: label, number, pair: Math.floor(index/2)+1, orderInPair: index%2,
      buildId: build.buildId, composition: false, maxConcurrentReads: 8, rate: executor === 'arrival' ? 2 : null, vus: executor === 'closed' ? 10 : null };
    try {
      apiChild = start(['.test-dist/test/fixtures/perf-local-server.js'], api, { NODE_ENV: 'test', PERF_DIAGNOSTICS: 'true' }, events, true);
      await until(() => !!apiChild.ready, apiChild);
      const reservation = createServer(); await new Promise(done => reservation.listen(0, '127.0.0.1', done));
      const port = reservation.address().port; await new Promise(done => reservation.close(done));
      webChild = start(['--inspect=127.0.0.1:0', resolve(web, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], web,
        { NODE_ENV: 'production', API_URL: apiChild.ready.url, PERF_DIAGNOSTICS: 'true', HOME_CMS_COMPOSITION: 'false' }, events);
      const base = `http://127.0.0.1:${port}`;
      await until(async () => { try { const r = await fetch(base+'/', { signal: AbortSignal.timeout(5000) }); return r.ok && (await r.text()).includes('Toyota'); } catch { return false; } }, webChild);
      await until(() => !!webChild.inspector, webChild); inspector = await cdp(webChild.inspector);
      for (let i=0;i<3;i++) for (const route of ['/', '/san-pham']) { const r = await fetch(base+route); assert(r.ok); await r.arrayBuffer(); }
      await wait(250);
      sampler = await hostSampler([webChild.pid, apiChild.pid]);
      await wait(protocol.preSeconds * 1000);
      await sampler.tick();
      await inspector.send('Runtime.evaluate', { expression: 'globalThis.__ttPerfObserver.flush()' });
      let ack = once(apiChild, 'message'); apiChild.send('perf:flush'); await ack; events.length = 0;
      phase.started = new Date().toISOString(); sampler.setPhase('during');
      const args = ['run', '--quiet', '--summary-export', resolve(runs, `${key}-k6.json`), '-e', `BASE_URL=${base}`, '-e', `WORKLOAD=${workload}`];
      if (executor === 'closed') args.push('-e', 'TARGET=10');
      args.push(resolve(web, executor === 'closed' ? 'scripts/perf-composition.k6.js' : 'scripts/perf-dom-ab.k6.js'));
      loadChild = spawn(k6, args, { windowsHide: true, stdio: 'ignore' }); sampler.addPid(loadChild.pid);
      phase.exitCode = (await once(loadChild, 'exit'))[0]; phase.finished = new Date().toISOString();
      await sampler.tick(); sampler.setPhase('post'); await wait(250);
      await inspector.send('Runtime.evaluate', { expression: 'globalThis.__ttPerfObserver.flush()' });
      ack = once(apiChild, 'message'); apiChild.send('perf:flush'); await ack; await wait(50);
      // Retain only diagnostic windows for the workload, not idle pre/post work.
      const measured = events.filter(event => Date.parse(event.time) > Date.parse(phase.started) && Date.parse(event.time)-event.windowMs < Date.parse(phase.finished));
      await writeFile(resolve(runs, `${key}-perf.jsonl`), measured.map(value => JSON.stringify(value)).join('\n')+'\n');
      await wait(protocol.postSeconds * 1000);
      phase.host = await sampler.stop(); sampler = undefined;
      phase.failed = phase.exitCode !== 0;
      assert.equal((await readFile(resolve(web, '.next/BUILD_ID'), 'utf8')).trim(), build.buildId);
      await writeFile(resolve(runs, `${key}-phase.json`), JSON.stringify(phase, null, 2), { flag: 'wx' });
      console.log(JSON.stringify({ event: 'dom_ab_finished', key, exitCode: phase.exitCode, hostSamples: phase.host.samples.length }));
    } catch (error) {
      // Save incomplete phases separately, never silently skip them in analysis.
      phase.failed = true; phase.failure = 'setup-or-measurement-failed';
      if (sampler) { phase.host = await sampler.stop().catch(() => ({ samples: [], skipped: 1 })); sampler = undefined; }
      await writeFile(resolve(runs, `${key}-incomplete.json`), JSON.stringify(phase, null, 2));
      throw error;
    } finally { await sampler?.stop(); await stop(loadChild); inspector?.close(); await stop(webChild); await stop(apiChild); }
  }
  await verifySource();
} finally { await activate('A'); }
