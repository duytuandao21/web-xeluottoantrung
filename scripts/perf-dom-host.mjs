import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import os from 'node:os';
import { web } from './perf-dom-ab-builds.mjs';
export async function cpuProbe() {
  const script = await readFile(resolve(web, 'scripts/perf-dom-cpu-probe.ps1'), 'utf8');
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = ''; const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) { const end = buffer.indexOf('\n'); if (end < 0) break; const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try { const value = JSON.parse(line), request = pending.get(value.sequence); if (request) { pending.delete(value.sequence); clearTimeout(request.timer); request.resolve(value); } } catch { /* No arbitrary stdout persisted. */ }
    }
  });
  child.stderr.on('data', () => {});
  return { pid: child.pid, sample: pids => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CPU probe timeout')); }, 5000);
    pending.set(id, { resolve, timer }); child.stdin.write(JSON.stringify({ sequence: id, pids }) + '\n');
  }), close: async () => { const ended = once(child, 'exit'); child.stdin.end(); await ended; } };
}
const cpuTimes = () => os.cpus().reduce((value, cpu) => ({ idle: value.idle + cpu.times.idle,
  total: value.total + Object.values(cpu.times).reduce((a,b) => a+b, 0) }), { idle: 0, total: 0 });
export async function hostSampler(pids) {
  const probe = await cpuProbe(); let currentPids = [...pids, process.pid];
  let previous = await probe.sample(currentPids), previousHost = cpuTimes(), busy = false, skipped = 0, phase = 'pre';
  const samples = [];
  const sample = async () => {
    if (busy) { skipped++; return; } busy = true;
    try {
      const counters = await probe.sample(currentPids), host = cpuTimes(), totalMs = host.total - previousHost.total;
      const trackedMs = Object.entries(counters.cpuMs).reduce((sum, [pid, value]) => sum + Math.max(0, value - (previous.cpuMs[pid] || 0)), 0);
      const hostBusyMs = totalMs - (host.idle - previousHost.idle), raw = (hostBusyMs - trackedMs) / Math.max(1, totalMs);
      if (samples.length < 180) samples.push({ time: new Date().toISOString(), phase, totalCpuMs: totalMs, trackedCpuMs: trackedMs,
        hostBusy: hostBusyMs / Math.max(1, totalMs), backgroundRaw: raw, background: Math.max(0, Math.min(1, raw)),
        missing: counters.missing.length, availableMiB: os.freemem()/1048576 });
      previous = counters; previousHost = host;
    } finally { busy = false; }
  };
  const timer = setInterval(() => { void sample().catch(() => { skipped++; }); }, 1000); timer.unref();
  return { samples, setPhase: next => { phase = next; }, addPid: pid => { currentPids.push(pid); },
    tick: async () => { while (busy) await new Promise(done => setTimeout(done, 10)); await sample(); },
    stop: async () => { clearInterval(timer); while (busy) await new Promise(done => setTimeout(done, 10)); await sample(); await probe.close(); return { samples, skipped }; } };
}
