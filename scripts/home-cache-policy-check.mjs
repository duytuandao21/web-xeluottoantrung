import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The API owns persistent caching; the React stub models one SSR render.
const calls = [], releases = [];
let status = 200, revision = 1, active = 0, peak = 0, hold = false, renderMemo;
const source = ts.transpileModule(fs.readFileSync('lib/public-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(source, {
  exports, process: { env: { API_URL: 'http://public-api.test' } }, URLSearchParams, AbortSignal, setTimeout,
  require: name => {
    if (name === 'server-only') return {};
    assert.equal(name, 'react', 'No persistent Next wrapper may hide API invalidation');
    return { cache: callback => (...args) => {
      if (!renderMemo) return callback(...args);
      const key = JSON.stringify(args);
      if (!renderMemo.has(key)) renderMemo.set(key, callback(...args));
      return renderMemo.get(key);
    } };
  },
  fetch: async (url, options) => {
    calls.push({ url, options }); active++; peak = Math.max(peak, active);
    if (hold) await new Promise(resolve => releases.push(resolve));
    active--;
    return { ok: status === 200, status, headers: { get: () => status === 503 ? '60' : null }, json: async () => ({ revision }) };
  },
});
for (const [path, params] of [
  ['/cars', { limit:6, sort:'newest' }], ['/cars/test'], ['/brands'], ['/seo', { route:'/' }],
  ['/site-settings/thiet-lap-logo'], ['/content', { group:'thiet-lap-cac-buoc-mua-xe' }],
  ['/content', { group:'thiet-lap-chinh-sach-dieu-kien' }], ['/lookups/body-styles'],
  ['/lookups/branch-regions'], ['/articles', {limit:3}], ['/services'], ['/faqs'], ['/accessories'],
]) {
  const before = calls.length;
  revision++; assert.equal((await exports.publicApi(path, params)).revision, revision);
  revision++; assert.equal((await exports.publicApi(path, params)).revision, revision);
  assert.equal(calls.length-before, 2, `Every new SSR request reaches the API cache owner: ${path}`);
}
renderMemo = new Map();
const beforeMemo = calls.length;
await exports.publicApi('/seo', {route:'/', unused:undefined});
await exports.publicApi('/seo', {route:'/'});
await exports.publicApi('/articles', {limit:3, page:1});
await exports.publicApi('/articles', {page:1, limit:3});
assert.equal(calls.length-beforeMemo, 2, 'One render shares results with canonical full queries');
renderMemo = undefined;
assert(calls.every(call => call.options.cache === 'no-store'));
status = 404;
assert.equal(await exports.optionalPublicApi('/seo', {route:'/unknown'}), null);
status = 503;
await assert.rejects(() => exports.optionalPublicApi('/seo'), error => error.status === 503);
const drain = async () => {
  for (let round=0; round<3; round++) {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(releases.length, 8);
    releases.splice(0).forEach(resolve => resolve());
  }
};
for (const expectedStatus of [200, 503]) {
  status = expectedStatus; hold = true; peak = 0;
  const batch = Promise.allSettled(Array.from({length:24}, (_, index) => exports.publicApi('/cars', {page:index+1})));
  await drain();
  assert((await batch).every(result => expectedStatus === 200 ? result.status === 'fulfilled' :
    result.status === 'rejected' && result.reason.status === 503));
  assert.equal(peak, 8);
}
status = 200; hold = false;
assert.equal((await exports.publicApi('/cars')).revision, revision);
console.log('PASS: API cache owner, request memoization, canonical queries, live inventory, 404/503 propagation, eight-slot limit and cleanup.');
