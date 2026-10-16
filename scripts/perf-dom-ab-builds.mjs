// Test tooling only. Archive/switch production builds without editing Next config.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
export const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const workspace = resolve(web, '..');
export const api = resolve(workspace, 'api-xeluottoantrung');
export const output = resolve(workspace, 'docs/artifacts/perf-dom-ab-local-2026-10-16');
const stash = resolve(workspace, '.perf-dom-ab-local-2026-10-16');
const dist = resolve(web, '.next');
export const sha = data => createHash('sha256').update(data).digest('hex');
export const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function move(source, destination) {
  for (const path of [source, destination]) { const name = relative(workspace, resolve(path)); assert(name && !name.startsWith('..') && !name.includes(':')); }
  assert(!(await exists(destination)), 'Never overwrite a build archive');
  await rename(source, destination);
}
export async function activate(label) {
  assert(['A', 'B'].includes(label));
  const manifest = JSON.parse(await readFile(resolve(output, 'builds.json'), 'utf8'));
  const current = (await readFile(resolve(dist, 'BUILD_ID'), 'utf8')).trim();
  const active = ['A', 'B'].find(key => manifest[key].buildId === current);
  assert(active, 'Unknown active build; do not move it');
  if (active === label) return manifest[label];
  const destination = resolve(stash, active), next = resolve(stash, label);
  await move(dist, destination);
  try { await move(next, dist); } catch (error) { await move(destination, dist); throw error; }
  return manifest[label];
}
async function command(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: web, windowsHide: true, stdio: 'inherit', env: { ...process.env, ...env } });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, 'Build/regression command failed');
}
async function git(args) {
  const child = spawn('git', ['-c', `safe.directory=${web.replaceAll('\\', '/')}`, '-c', 'core.autocrlf=false', ...args], { cwd: web, windowsHide: true, stdio: 'inherit' });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, 'Saved patch does not apply cleanly');
}
async function prepare() {
  assert(!(await exists(output)) && !(await exists(stash)), 'New experiment only; preserve previous artifacts');
  const original = await readFile(resolve(web, 'lib/public-pages.ts'));
  const previous = JSON.parse(await readFile(resolve(workspace, 'docs/artifacts/perf-dom-local-2026-10-16/source-before.json'), 'utf8'));
  assert.equal(sha(original), previous.files['web-xeluottoantrung/lib/public-pages.ts']);
  const candidate = await readFile(resolve(workspace, 'docs/artifacts/perf-dom-local-2026-10-16/public-pages-candidate.ts'));
  const files = {};
  for (const name of Object.keys(previous.files)) files[name] = sha(await readFile(resolve(workspace, name)));
  // Compiled fixture is used unchanged; record the execution artifacts as well.
  for (const name of ['test/fixtures/perf-local-server.js', 'test/fixtures/query-cache-fixture.js', 'src/common/cache/public-cache.js', 'src/common/cache/public-cache.policy.js', 'src/common/cache/public-read-throttler.guard.js']) {
    const key = `api-xeluottoantrung/.test-dist/${name}`; files[key] = sha(await readFile(resolve(workspace, key)));
  }
  await mkdir(output, { recursive: true }); await mkdir(stash);
  await writeFile(resolve(output, 'source-initial.json'), JSON.stringify({ files, sourceSha: sha(original) }, null, 2));
  await writeFile(resolve(output, 'protocol.json'), JSON.stringify({ registeredAt: new Date().toISOString(),
    variants: { A: 'rollback, original', B: 'exact saved dom-only.patch' },
    order: ['A', 'B', 'B', 'A', 'A', 'B'], pairs: [['A', 'B'], ['B', 'A'], ['A', 'B']],
    workloads: ['home', 'listing', 'mixed'], executors: ['closed', 'arrival'],
    closed: '10 VUs; 10s ramp, 40s hold, 10s down; same existing k6 script and think time',
    arrival: { totalRps: 2, durationSeconds: 60, mixed: '1 home + 1 listing RPS; separate scenarios', maxTotalVUs: 10 },
    preSeconds: 15, postSeconds: 15, sampleSeconds: 1,
    composition: false, maxConcurrentReads: 8, apiRateLimit: '500/60s',
    noise: { highBackgroundMean: 0.15, maxBackgroundMeanDrift: 0.05, duringBackgroundP95: 0.25, backgroundPeak: 0.60,
      pairedBackgroundMeanDifference: 0.05, maxMissingFraction: 0.10, description: 'Any flag makes run/pair noisy. Preserve all runs and report all + clean strata separately.' },
    decision: { minCleanPairsPerCell: 3, minimumMedianCpuReductionPercent: 3, requiredCpuImprovingPairs: 3,
      latencyRegression: 'Reject if paired median p95 increases by >10% AND >20ms, or any pair by >20% AND >30ms.',
      errors: 'No increased HTTP/check errors, API 429/503, or arrival dropped iterations.',
      listingControl: 'Require median CPU difference within 5%; latency gate also applies.',
      insufficientOrNoisy: 'Continue rollback; do not infer a whole-page benefit.' },
    environment: { node: process.version, platform: os.platform(), cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, memoryGiB: os.totalmem()/1024**3 },
  }, null, 2), { flag: 'wx' });
  const builds = {};
  try {
    for (const label of ['A', 'B']) {
      if (label === 'B') {
        const patch = resolve(workspace, 'docs/artifacts/perf-dom-local-2026-10-16/dom-only.patch');
        await git(['apply', '--check', patch]); await git(['apply', patch]);
        assert.equal(sha(await readFile(resolve(web, 'lib/public-pages.ts'))), sha(candidate), 'Exact candidate source required');
      }
      await command([resolve(web, 'node_modules/next/dist/bin/next'), 'build'], { HOME_CMS_COMPOSITION: 'false', API_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9' });
      builds[label] = { buildId: (await readFile(resolve(dist, 'BUILD_ID'), 'utf8')).trim(), sourceSha: sha(await readFile(resolve(web, 'lib/public-pages.ts'))) };
      await move(dist, resolve(stash, label));
    }
    await writeFile(resolve(output, 'builds.json'), JSON.stringify(builds, null, 2), { flag: 'wx' });
  } finally {
    const current = await readFile(resolve(web, 'lib/public-pages.ts'));
    assert([sha(original), sha(candidate)].includes(sha(current)), 'Concurrent source change: do not overwrite');
    if (!current.equals(original)) await writeFile(resolve(web, 'lib/public-pages.ts'), original);
    if (!(await exists(dist)) && await exists(resolve(stash, 'A'))) await move(resolve(stash, 'A'), dist);
  }
  assert.equal(sha(await readFile(resolve(web, 'lib/public-pages.ts'))), sha(original));
  console.log(JSON.stringify({ event: 'dom_ab_builds_ready', builds, sourceRestored: true }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare();
