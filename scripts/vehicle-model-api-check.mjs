import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real read logic with controlled network responses; no database writes.
const js = ts.transpileModule(readFileSync('lib/public-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const models = [{ id: 'spark', name: 'Spark', slug: 'spark' }];
function setup(fetch) {
  const exports = {};
  vm.runInNewContext(js, { exports, fetch, process: { env: {} }, URLSearchParams, AbortSignal, setTimeout, Map, Set,
    require: name => name === 'react' ? { cache: fn => fn } : name === 'next/cache' ? { unstable_cache: fn => fn } : {},
  });
  return exports.publicApi;
}
const response = (status, data = models) => ({ ok: status === 200, status, json: async () => data });
for (const failure of [429, 500, 503, 'network', 'timeout']) {
  let calls = 0;
  const api = setup(async () => {
    if (++calls > 1) return response(200);
    if (typeof failure === 'string') throw new Error(failure);
    return response(failure);
  });
  assert.deepEqual(await api('/brands/chevrolet/models'), models);
  assert.equal(calls, 2);
}
for (const status of [400, 404]) {
  let calls = 0;
  const api = setup(async () => { calls++; return response(status); });
  await assert.rejects(api('/brands/chevrolet/models'));
  assert.equal(calls, 1);
}
let calls = 0;
const outage = setup(async () => { calls++; return response(503); });
await assert.rejects(outage('/brands/chevrolet/models'));
assert.equal(calls, 2, 'Persistent outage has a bounded retry');
calls = 0;
const concurrent = setup(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 40)); return response(200); });
await Promise.all(Array.from({ length: 10 }, () => concurrent('/brands/chevrolet/models')));
assert.equal(calls, 1, 'SSR and catalog route share an in-flight origin request');
for (const invalid of [{ data: models }, [...models, ...models], [{ id: '1', name: 'A' }]]) {
  await assert.rejects(setup(async () => response(200, invalid))('/brands/chevrolet/models'));
}
calls = 0;
await assert.rejects(setup(async () => { calls++; return response(503); })('/cars'));
assert.equal(calls, 1, 'Inventory reads retain their original request policy');
console.log('Passed: transient failures, bounded retries, 404, deduplication, invalid catalogs, inventory isolation.');
