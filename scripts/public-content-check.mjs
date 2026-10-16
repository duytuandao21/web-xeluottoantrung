import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const groups = ['thiet-lap-nut-goi', 'thiet-lap-chinh-sach-dieu-kien', 'thiet-lap-mang-xa-hoi', 'thiet-lap-ung-dung', 'thiet-lap-quy-trinh-ban-xe', 'thiet-lap-cac-buoc-mua-xe', 'thiet-lap-cac-buoc-ban-xe', 'thiet-lap-cac-buoc-len-doi', 'thiet-lap-banner-dong-xe'];
const compiled = name => ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const calls = [], waits = [], logs = [], exports = {};
  let memo = new Map(), revision = 1, marker = '1', enabled = 'true', headerReads = 0, failure, retryAfter, invalid = false, envelopeStatus = 200, now = 1000000;
  const react = { cache: fn => { const id = {}; return (...args) => { if (!memo.has(id)) memo.set(id, new Map()); const map = memo.get(id), key = JSON.stringify(args); if (!map.has(key)) map.set(key, fn(...args)); return map.get(key); }; } };
  class Clock extends Date { static now() { return now; } }
  const context = { exports, URLSearchParams, AbortSignal, Date: Clock, process: { env: { API_URL: 'http://fixture.test' } },
    console: { warn: line => logs.push(JSON.parse(line)) },
    setTimeout: (callback, delay) => { waits.push(delay); now += delay; queueMicrotask(callback); },
    fetch: async (url, options) => {
      calls.push({ url, options }); const target = new URL(url);
      const envelope = target.pathname === '/api/v1/content/home';
      const status = envelope ? envelopeStatus : target.searchParams.get('group') === failure ? 503 : 200;
      const data = envelope ? invalid ? {} : { groups: Object.fromEntries(groups.map(group => [group, group === failure
        ? { ok: false, status: 503, ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }) }
        : { ok: true, data: [{ key: group, title: `Revision ${revision}` }] }])) }
        : [{ key: target.searchParams.get('group'), title: `Revision ${revision}` }];
      return { ok: status === 200, status, headers: { get: () => retryAfter === undefined ? undefined : String(retryAfter) }, json: async () => data };
    }, require: name => name === 'react' ? react : name === './perf-observer'
      ? { perfAsync: (_m,_l,work) => work(), perfApiLabel: () => 'content', perfStart: () => () => {}, perfGauge: () => {} } : {} };
  vm.runInNewContext(compiled('public-api'), context);
  const api = exports, content = {};
  vm.runInNewContext(compiled('public-content'), { ...context, exports: content, process: { env: { get HOME_CMS_COMPOSITION() { return enabled; } } },
    require: name => name === 'react' ? react : name === './public-api' ? api : name === 'next/headers' ? { headers: async () => { headerReads++; return { get: () => marker }; } } : {} });
  return { api, content, calls, waits, logs, render: () => { memo = new Map(); }, revise: () => { revision++; },
    configure: options => { if ('failure' in options) failure = options.failure; if ('retryAfter' in options) retryAfter = options.retryAfter;
      if ('marker' in options) marker = options.marker; if ('enabled' in options) enabled = options.enabled; if ('invalid' in options) invalid = options.invalid; if ('envelopeStatus' in options) envelopeStatus = options.envelopeStatus; }, headers: () => headerReads };
}
const home = fixture();
await Promise.all([...groups, ...groups].map(group => home.content.publicContent(group)));
assert.equal(home.calls.length, 1); assert.equal(home.headers(), 1);
home.revise(); home.render();
assert.equal((await home.content.publicContent(groups[0]))[0].title, 'Revision 2'); assert.equal(home.calls.length, 2);
assert(home.calls.every(call => call.options.cache === 'no-store'));
for (const options of [{ enabled: 'false' }, { marker: null }]) {
  const f = fixture(); f.configure(options); await Promise.all(groups.map(group => f.content.publicContent(group)));
  assert.equal(f.calls.length, 9); assert(f.calls.every(call => new URL(call.url).pathname === '/api/v1/content'));
}
const failed = fixture(); failed.configure({ failure: groups[0] });
const partial = await Promise.allSettled([...groups, groups[0]].map(group => failed.content.publicContent(group)));
assert.equal(failed.calls.length, 2, 'One envelope plus exactly one source retry, never replay all nine groups');
assert.equal(failed.waits.length, 1); assert.equal(partial.filter(item => item.status === 'fulfilled').length, 8);
assert(failed.logs.some(log => log.status === 503 && log.attempt === 2 && log.outcome === 'failed'));
const long = fixture(); long.configure({ failure: groups[0], retryAfter: 60 });
await assert.rejects(long.content.publicContent(groups[0]), error => error.status === 503);
assert.equal(long.calls.length, 1); assert.equal(long.waits.length, 0);
const malformed = fixture(); malformed.configure({ invalid: true });
await assert.rejects(malformed.content.publicContent(groups[0]), error => error.status === 502);
assert.equal(malformed.calls.length, 1); assert(malformed.logs.some(log => log.reason === 'invalid_payload'));
const legacy = fixture(); legacy.configure({ envelopeStatus: 404 });
await Promise.all(groups.map(group => legacy.content.publicContent(group)));
assert.equal(legacy.calls.length, 10, 'One old-API 404 plus nine original reads, memoized per render');
const unavailable = fixture(); unavailable.configure({ envelopeStatus: 503, retryAfter: 60 });
await assert.rejects(unavailable.content.publicContent(groups[0]), error => error.status === 503);
assert.equal(unavailable.calls.length, 1, 'No origin amplification on envelope outage');
console.log('PASS: request-scoped view, nine-group dedup, no-store, fresh revisions, non-home/off legacy reads, bounded per-source retries, Retry-After, invalid payload and old-API rollback.');
