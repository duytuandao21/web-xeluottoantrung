// Isolated, unmodified baseline production build for real A/B (no HTML rewriting).
import assert from 'node:assert/strict';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = process.cwd();
const artifacts = resolve('../docs/artifacts/css-optimization-2026-10-17');
const target = resolve(artifacts, 'baseline-project');
assert(target.startsWith(artifacts + sep));
if (process.argv.includes('--comparable')) {
  assert(existsSync(target), 'Create the isolated baseline project first');
  const saved = resolve(artifacts, 'candidate-build');
  assert(!existsSync(saved), 'Never overwrite the candidate build backup');
  const candidateLayout = readFileSync(resolve('app/layout.tsx'));
  assert(candidateLayout.includes('legacyCss.href'));
  const copyBuild = (from, to) => cpSync(from, to, { recursive: true, filter: file => !file.includes(sep + 'cache' + sep) && !file.endsWith(sep + 'cache') });
  copyBuild(resolve('.next'), saved);
  try {
    copyFileSync(resolve(artifacts, 'layout.before.tsx'), resolve('app/layout.tsx'));
    const child = spawnSync(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'build'], { cwd: root, windowsHide: true, stdio: 'inherit' });
    assert.equal(child.status, 0, 'Comparable baseline build');
    copyBuild(resolve('.next'), resolve(target, '.next'));
  } finally {
    writeFileSync(resolve('app/layout.tsx'), candidateLayout);
    copyBuild(saved, resolve('.next'));
  }
  console.log('Comparable baseline ID: ' + readFileSync(resolve(target, '.next/BUILD_ID'), 'utf8').trim());
  console.log('Candidate restored: ' + readFileSync(resolve('.next/BUILD_ID'), 'utf8').trim());
} else {
assert(!existsSync(target), 'Never overwrite an existing baseline project');
mkdirSync(target, { recursive: true });
for (const folder of ['app', 'components', 'lib', 'config', 'types', 'data']) cpSync(resolve(folder), resolve(target, folder), { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', '.eslintrc.json', 'instrumentation.ts']) copyFileSync(resolve(file), resolve(target, file));
copyFileSync(resolve(artifacts, 'layout.before.tsx'), resolve(target, 'app/layout.tsx'));
symlinkSync(resolve('node_modules'), resolve(target, 'node_modules'), 'junction');
symlinkSync(resolve('public'), resolve(target, 'public'), 'junction');
// Match the candidate's build-time env without copying secrets into artifacts.
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(root, false);
const child = spawnSync(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'build'], { cwd: target, env: process.env, windowsHide: true, stdio: 'inherit' });
assert.equal(child.status, 0, 'Baseline production build');
console.log('Baseline build ID: ' + readFileSync(resolve(target, '.next/BUILD_ID'), 'utf8').trim());
}
