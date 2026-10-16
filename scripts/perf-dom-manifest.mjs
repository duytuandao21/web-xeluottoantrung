// Hash only source/config/assets needed to audit this experiment. Never read .env.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw Error('Expected before/after');
const workspace = resolve('..'), output = resolve(workspace, 'docs/artifacts/perf-dom-local-2026-10-16');
const files = {};
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
async function visit(path, target = files) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await visit(full, target);
    else if (/\.(?:tsx?|css|json|mjs|js)$/.test(entry.name)) target[relative(workspace, full).replaceAll('\\', '/')] = sha(await readFile(full));
  }
}
for (const path of ['web-xeluottoantrung/app', 'web-xeluottoantrung/lib', 'web-xeluottoantrung/components', 'web-xeluottoantrung/data', 'api-xeluottoantrung/src', 'api-xeluottoantrung/test', 'admin-xeluottoantrung/src']) await visit(resolve(workspace, path));
for (const project of ['web-xeluottoantrung', 'api-xeluottoantrung', 'admin-xeluottoantrung']) for (const name of ['package.json', 'package-lock.json']) {
  const key = `${project}/${name}`; files[key] = sha(await readFile(resolve(workspace, key)));
}
for (const name of ['middleware.ts', 'next.config.ts']) files[`web-xeluottoantrung/${name}`] = sha(await readFile(name));
await mkdir(output, { recursive: true });
const builtAssets = {}; await visit(resolve('.next/static'), builtAssets);
const staticAssets = Object.fromEntries(Object.entries(builtAssets).map(([key, hash]) => [key.replace(/^web-xeluottoantrung\//, ''), hash]));
await writeFile(resolve(output, `source-${stage}.json`), JSON.stringify({ time: new Date().toISOString(), buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), files, staticAssets }, null, 2));
if (stage === 'before') await writeFile(resolve(output, 'public-pages-before.ts'), await readFile('lib/public-pages.ts'));
else {
  const before = JSON.parse(await readFile(resolve(output, 'source-before.json'), 'utf8'));
  const changed = [...new Set([...Object.keys(before.files), ...Object.keys(files)])].filter(key => before.files[key] !== files[key]);
  const staticAssetChanges = [...new Set([...Object.keys(before.staticAssets || {}), ...Object.keys(staticAssets)])].filter(key => before.staticAssets?.[key] !== staticAssets[key]);
  const staticContentsIdentical = JSON.stringify(Object.values(before.staticAssets || {}).sort()) === JSON.stringify(Object.values(staticAssets).sort());
  const result = { changed, staticAssetChanges, staticContentsIdentical, beforeStaticAssets: Object.keys(before.staticAssets || {}).length, afterStaticAssets: Object.keys(staticAssets).length };
  await writeFile(resolve(output, 'source-diff.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
