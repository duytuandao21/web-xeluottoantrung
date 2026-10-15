import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('lib/public-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lookup = (revision = 1, page = 1, totalPages = 1) => ({ data: [{ id: 'branch', name: `Branch ${revision}`, slug: 'branch' }], meta: { page, limit: 100, total: totalPages, totalPages } });
const response = (status, data = lookup(), retryAfter) => ({ ok: status === 200, status, headers: { get: () => retryAfter ?? null }, json: async () => data });
function fixture(read) {
  const exports = {}, calls = [], waits = [], logs = [];
  let now = 1_000_000_500, memo;
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { exports, URLSearchParams, AbortSignal, Date: Clock,
    process: { env: { API_URL: 'http://fixture.test' } },
    fetch: async (url, options) => { calls.push({ url, options }); return read(calls.length, url); },
    setTimeout: (callback, delay) => { waits.push(delay); now += delay; queueMicrotask(callback); },
    console: { warn: value => logs.push(JSON.parse(value)) },
    require: name => {
    if (name === './perf-observer') return { perfAsync: (_metric,_label,work) => work(), perfApiLabel: () => 'read-other', perfGauge: () => {}, perfStart: () => () => {} };
      if (name === 'server-only') return {};
      assert.equal(name, 'react');
      return { cache: fn => (...args) => {
        if (!memo) return fn(...args);
        const key = JSON.stringify(args); if (!memo.has(key)) memo.set(key, fn(...args)); return memo.get(key);
      } };
    },
  });
  return { api: exports, calls, waits, logs, render: () => { memo = new Map(); }, freshRender: () => { memo = undefined; }, now: () => now };
}

for (const status of [429, 503]) {
  const f = fixture(attempt => response(attempt === 1 ? status : 200));
  assert.equal((await f.api.optionalLookupPage('/lookups/branches')).data.length, 1);
  assert.equal(f.calls.length, 2); assert.equal(f.waits.length, 1); assert(f.waits[0] >= 150 && f.waits[0] < 200);
  assert(f.calls.every(call => call.options.cache === 'no-store' && call.options.signal));
  assert.equal(f.logs[0].status, status); assert.equal(f.logs[0].outcome, 'retry');
}
for (const retryAfter of ['0.5', new Date(1_000_001_000).toUTCString()]) {
  const f = fixture(attempt => response(attempt === 1 ? 429 : 200, lookup(), retryAfter));
  assert(await f.api.optionalLookupPage('/lookups/body-styles'));
  assert.equal(f.waits[0], 500, 'Honor seconds and HTTP-date without retrying early');
}
for (const status of [429, 503]) {
  const f = fixture(() => response(status, null, '60'));
  assert.equal(await f.api.optionalLookupPage('/lookups/branches'), null);
  assert.equal(f.calls.length, 1); assert.equal(f.waits.length, 0, 'Long Retry-After does not stall SSR or cause an early retry');
  assert(f.logs.some(log => log.outcome === 'lookup_unavailable' && log.endpoint === '/lookups/branches'));
}
for (const status of [400, 401, 403, 404]) {
  const f = fixture(() => response(status));
  await assert.rejects(f.api.optionalLookupPage('/lookups/branches'), error => error.status === status);
  assert.equal(f.calls.length, 1);
}
const persistent = fixture(() => response(503));
assert.equal(await persistent.api.optionalPublicLookups('/lookups/body-styles'), null);
assert.equal(persistent.calls.length, 2);
assert.equal(persistent.waits.length, 1);
const serverError = fixture(() => response(500));
assert.equal(await serverError.api.optionalLookupPage('/lookups/body-styles'), null, 'Other lookup server errors also degrade without inventing inventory');
assert.equal(serverError.calls.length, 1, 'Do not broaden retries beyond the chosen transient statuses');
const partial = fixture((_, url) => response(url.includes('page=2') ? 503 : 200, lookup(1, 1, 2)));
assert.equal(await partial.api.optionalPublicLookups('/lookups/branches'), null, 'Never publish a partial catalog as complete');
const transport = fixture(() => { throw new TypeError('sensitive URL/body must not be logged'); });
assert.equal(await transport.api.optionalLookupPage('/lookups/branches'), null);
assert.equal(transport.calls.length, 2);
assert(!JSON.stringify(transport.logs).includes('sensitive'));
let cancelled = 0;
const bodies = fixture(() => ({ ...response(503), body: { cancel: async () => { cancelled++; } } }));
assert.equal(await bodies.api.optionalLookupPage('/lookups/branches'), null);
assert.equal(cancelled, 2, 'Error response bodies release their connections before retry/fallback');

for (const path of ['/cars', '/cars/test', '/brands', '/search', '/valuation/records', '/admin/leads']) {
  const f = fixture(() => response(503));
  await assert.rejects(f.api.publicApi(path, { search: 'private@example.test' }), error => error.status === 503);
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.api.optionalLookupPage(path));
  assert(!JSON.stringify(f.logs).includes('private@example.test'));
}
const revision = fixture(attempt => response(200, lookup(attempt)));
assert.equal((await revision.api.publicApi('/lookups/branches')).data[0].name, 'Branch 1');
assert.equal((await revision.api.publicApi('/lookups/branches')).data[0].name, 'Branch 2', 'New renders observe API invalidation, no second TTL');
revision.render();
const before = revision.calls.length;
await Promise.all([
  revision.api.publicApi('/lookups/branches', { limit: 100, page: 1 }),
  revision.api.publicApi('/lookups/branches', { page: 1, limit: 100, ignored: undefined }),
]);
assert.equal(revision.calls.length, before + 1, 'Layout/page/metadata share one canonical read per render');
revision.freshRender();
const recovery = fixture(attempt => response(attempt <= 2 ? 503 : 200));
assert.equal(await recovery.api.optionalLookupPage('/lookups/branches'), null);
assert(await recovery.api.optionalLookupPage('/lookups/branches'), 'Errors/fallbacks are not cached across renders');
const dynamicError = Object.assign(new Error('Next dynamic render bailout'), { digest: 'DYNAMIC_SERVER_USAGE' });
const framework = fixture(() => { throw dynamicError; });
await assert.rejects(framework.api.publicApi('/lookups/branches'), error => error === dynamicError);
assert.equal(framework.calls.length, 1); assert.equal(framework.logs.length, 0, 'Do not log/retry framework control flow as an API failure');

for (const status of [429, 503]) {
  const f = fixture(() => response(status, null, '60'));
  for (let i = 0; i < 20; i++) await assert.rejects(f.api.publicApi('/content', { group: 'thiet-lap-chinh-sach-dieu-kien' }), error => error.status === status);
  assert.equal(f.calls.length, 20, 'One attempt per render, no retry loop when Nest sends Retry-After 60');
  assert.equal(f.logs.length, 1, 'Repeated content failures are rate limited in logs');
  assert.equal(f.logs[0].group, 'thiet-lap-chinh-sach-dieu-kien');
  await assert.rejects(f.api.publicApi('/content', { group: 'private@example.test', token: 'secret' }));
  assert.equal(f.logs.at(-1).group, 'other');
  assert(!/private@example|secret|token/.test(JSON.stringify(f.logs)));
}
const contentMemo = fixture(() => response(200, []));
for (let i = 0; i < 3; i++) {
  contentMemo.render();
  await Promise.all(Array.from({ length: 6 }, () => contentMemo.api.publicApi('/content', { group: 'thiet-lap-chinh-sach-dieu-kien' })));
}
assert.equal(contentMemo.calls.length, 3, 'Policy readers in layout/page/metadata coalesce once per render and stay fresh across renders');
console.log('Passed: 429/503 retry budget, Retry-After, timeout/network fallback, pagination integrity, privacy, request memoization, invalidation and no fake empty inventory.');
