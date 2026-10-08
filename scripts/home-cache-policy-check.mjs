import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual server wrapper without contacting or changing a database.
const calls = [], cacheCalls = [], refreshes = [], releases = [];
let status = 200, revision = 1, now = 0, active = 0, peak = 0, hold = false;
const source = ts.transpileModule(fs.readFileSync('lib/public-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(source, {
  exports, process: { env: { API_URL: 'http://public-api.test' } }, URLSearchParams,
  require: name => {
    if (name === 'server-only') return {};
    if (name === 'react') return { cache: callback => callback };
    assert.equal(name, 'next/cache');
    return { unstable_cache: (callback, keys, options) => {
      const values = new Map();
      return async (...args) => {
        cacheCalls.push({ keys, seconds: options.revalidate, args });
        const key = JSON.stringify(args), old = values.get(key);
        const update = async () => {
          const value = await callback(...args);
          values.set(key, { value, expires: now + options.revalidate * 1000 });
          return value;
        };
        if (old) {
          if (now >= old.expires) refreshes.push(update());
          return old.value;
        }
        return update();
      };
    } };
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    active++;
    peak = Math.max(peak, active);
    if (hold) await new Promise(resolve => releases.push(resolve));
    active--;
    const responseStatus = status;
    return { ok: responseStatus === 200, status: responseStatus, json: async () => ({ revision }) };
  },
});
const assertCached = async (path, params, seconds) => {
  const before = calls.length;
  await exports.publicApi(path, params);
  await exports.publicApi(path, params);
  assert.equal(calls.length - before, 1, `Expected cached result: ${path} ${JSON.stringify(params)}`);
  assert.equal(cacheCalls.at(-1).seconds, seconds);
  assert(cacheCalls.at(-1).keys.includes('http://public-api.test'));
};
for (const path of ['/site-settings/thiet-lap-thong-tin', '/site-settings/thiet-lap-logo', '/site-settings/thiet-lap-favicon',
  '/site-settings/thiet-lap-footer', '/lookups/branches', '/lookups/branch-regions', '/services']) {
  await assertCached(path, undefined, 60);
}
const groups = ['thiet-lap-quy-trinh-ban-xe', 'thiet-lap-cac-buoc-mua-xe', 'thiet-lap-cac-buoc-ban-xe',
  'thiet-lap-cac-buoc-len-doi', 'thiet-lap-banner-dong-xe', 'thiet-lap-mang-xa-hoi', 'thiet-lap-ung-dung'];
for (const group of groups) await assertCached('/content', { group }, 60);
for (const [path, params] of [
  ['/cars', { limit:6, sort:'newest' }], ['/cars/xe-dang-ban'], ['/brands'], ['/accessories', { limit:100 }],
  ['/seo', { route:'/' }], ['/services/chi-tiet'], ['/site-settings/unknown'],
  ['/content', { group:'thiet-lap-chinh-sach-dieu-kien' }], ['/content', { group:'thiet-lap-nut-goi' }],
  ['/content', { group:'unknown' }], ['/content'], ['/search'], ['/auspicious-dates/config'],
]) {
  const before=calls.length;
  revision++;
  assert.equal((await exports.publicApi(path, params)).revision, revision);
  revision++;
  assert.equal((await exports.publicApi(path, params)).revision, revision);
  assert.equal(calls.length-before, 2, `Must remain live: ${path} ${JSON.stringify(params)}`);
}
await assertCached('/lookups/body-styles', {limit:100}, 60);
await assertCached('/articles', {limit:3}, 30);
await assertCached('/articles', {limit:6}, 30);
assert.equal(new URL(calls.at(-1).url).searchParams.get('limit'), '6');
assert(calls.every(call => call.options.cache === 'no-store'));
status=404;
assert.equal(await exports.optionalPublicApi('/seo', {route:'/'}), null);
status=503;
await assert.rejects(() => exports.optionalPublicApi('/seo'), error => error.status===503);

// Expiry refreshes and foreground reads must share the same eight slots.
status=200; revision++;
now=61000; hold=true; peak=0;
for (const group of groups) await exports.publicApi('/content', {group});
const batch=Promise.allSettled(Array.from({length:17}, (_,i) => exports.publicApi('/cars', {page:i+1})));
const drain=async()=>{
  for(let round=0;round<3;round++) {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(releases.length,8);
    releases.splice(0).forEach(resolve=>resolve());
  }
};
await drain();
assert((await batch).every(result=>result.status==='fulfilled'));
await Promise.all(refreshes);
assert.equal(peak,8);
hold=false;
assert.equal((await exports.publicApi('/content',{group:groups[0]})).revision,revision);

// Failures must release slots and must not poison a subsequent success.
status=503; hold=true; peak=0;
const failing=Promise.allSettled(Array.from({length:24},()=>exports.publicApi('/cars')));
await drain();
assert((await failing).every(result=>result.status==='rejected'&&result.reason.status===503));
assert.equal(peak,8);
status=200; hold=false;
assert.equal((await exports.publicApi('/cars')).revision,revision);
console.log('PASS: TTL, cache hits/query isolation, live stock/prices/policies/SEO, expiry refresh + foreground limit, 404/503 propagation and slot cleanup.');
