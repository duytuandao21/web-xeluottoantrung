import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the actual Next configuration in an isolated local fixture.
// Never mutate published assets, environment files or Cloudflare settings.
const require = createRequire(import.meta.url);
const root = process.cwd();
fs.mkdirSync('artifacts', { recursive: true });
const fixture = fs.mkdtempSync(path.join(root, 'artifacts/versioned-cache-'));
const entries = JSON.parse(fs.readFileSync('config/versioned-images.json', 'utf8'));
fs.mkdirSync(path.join(fixture, 'config'));
fs.writeFileSync(path.join(fixture, 'config/versioned-images.json'), JSON.stringify(entries));
for (const image of entries) {
  const destination = path.join(fixture, 'public', image.src.slice(1));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, 'public', image.src.slice(1)), destination);
}
const configFile = path.join(fixture, 'next.config.cjs');
fs.writeFileSync(configFile, ts.transpileModule(fs.readFileSync('next.config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText);
const load = () => {
  delete require.cache[configFile];
  delete require.cache[require.resolve(path.join(fixture, 'config/versioned-images.json'))];
  return require(configFile).default;
};
try {
  process.chdir(fixture);
  const headers = await load().headers();
  assert.equal(headers.length, entries.length);
  assert.equal(new Set(headers.map(row => row.source)).size, entries.length);
  assert(headers.every(row => row.headers[0].value === 'public, max-age=31536000, immutable'));
  assert(headers.every(row => !row.source.includes('*') && !row.source.includes(':')));
  const target = path.join(fixture, 'public', entries[0].src.slice(1));
  const original = fs.readFileSync(target);
  const changed = Buffer.from(original); changed[changed.length - 1] ^= 1;
  fs.writeFileSync(target, changed);
  await assert.rejects(load().headers(), /Published image version changed/);
  fs.writeFileSync(target, original);
  fs.renameSync(target, `${target}.missing`);
  await assert.rejects(load().headers(), /ENOENT/);
  fs.renameSync(`${target}.missing`, target);
  fs.writeFileSync(path.join(fixture, 'config/versioned-images.json'), JSON.stringify([{ ...entries[0], src: '/images/:path*' }]));
  await assert.rejects(load().headers(), /Invalid versioned image path/);
  console.log('PASS: exact versioned headers; changed/missing image and wildcard rejected. Published source files untouched.');
} finally { process.chdir(root); }
