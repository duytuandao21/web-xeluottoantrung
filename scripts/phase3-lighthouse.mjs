import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const stage = process.argv[2]; assert(['before', 'after'].includes(stage));
const out = '../toi-uu-hieu-suat-website/phase-3';
fs.mkdirSync(out, { recursive: true });
for (const device of ['desktop', 'mobile']) for (let run = 1; run <= 3; run++) {
  const args = ['artifacts/performance-tools/node_modules/lighthouse/cli/index.js', process.env.TEST_BASE_URL || 'http://127.0.0.1:3107',
    '--only-categories=performance', '--output=json', `--output-path=${out}/lighthouse-${stage}-${device}-${run}.json`,
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-extensions --incognito', '--quiet'];
  if (device === 'desktop') args.push('--preset=desktop');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' }); child.on('exit', resolve); child.on('error', reject);
  });
  assert.equal(code, 0);
  const r = JSON.parse(fs.readFileSync(`${out}/lighthouse-${stage}-${device}-${run}.json`, 'utf8')); assert(!r.runtimeError);
  console.log(JSON.stringify({ stage, device, run, buildId: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(), score: r.categories.performance.score * 100,
    lcp: r.audits['largest-contentful-paint'].numericValue, cls: r.audits['cumulative-layout-shift'].numericValue }));
}
