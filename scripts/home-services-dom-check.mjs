// Execute the actual before/after service blocks and helpers, not a reimplementation.
// No API, database, env file, production server or customer data is used here.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as cheerio from 'cheerio';
const require = createRequire(import.meta.url);
const root = resolve('../docs/artifacts/perf-dom-local-2026-10-16');
const before = await readFile(resolve(root, 'public-pages-before.ts'), 'utf8');
const after = await readFile(process.argv.includes('--saved-candidate') ? resolve(root, 'public-pages-candidate.ts') : 'lib/public-pages.ts', 'utf8');
assert.notEqual(after, before, 'Apply the candidate patch first, or use --saved-candidate after rollback');
const home = await readFile('app/page.tsx', 'utf8');
const manifest = JSON.parse(await readFile('data/route-manifest.json', 'utf8'));
const snapshot = JSON.parse(await readFile(resolve('data/pages', manifest['/']), 'utf8')).content;
function compile(text, context = {}) {
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  Function('require', 'module', 'exports', ...Object.keys(context), code)(name => {
    if (name === 'server-only') return {};
    if (name.endsWith('measured-cheerio')) return { measuredCheerio: () => cheerio };
    if (name.endsWith('safe-html')) return { safeHtml };
    return require(name);
  }, module, module.exports, ...Object.values(context));
  return module.exports;
}
const safeSource = await readFile('lib/safe-html.ts', 'utf8');
const { safeHtml } = compile(safeSource);
const { serviceStepList } = compile(await readFile('lib/service-step-markup.ts', 'utf8'));
function serviceWork(source) {
  const ast = ts.createSourceFile('resolver.ts', source, ts.ScriptTarget.Latest, true);
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['renderServiceSteps', 'prepareServiceTabs'].includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
  const start = source.indexOf("    const serviceSection = $('.wap_dichvu').first();");
  assert(start >= 0, 'Locate exact home branch');
  const end = source.indexOf('    renderTestimonials(', start);
  assert(end > start);
  return compile(`${helpers}\nexports.work = ($, buyingSteps, sellingSteps, tradeInSteps) => {${source.slice(start, end)}};`, { safeHtml }).work;
}
const start = home.indexOf("  const section = $('.wap_dichvu').first().addClass('tt-home-services');");
const end = home.indexOf('  replaceHomeBottom(', start);
assert(start >= 0 && end > start);
const services = [
  { key: 'mua-xe', label: 'Mua xe', href: '/san-pham' },
  { key: 'ban-xe', label: 'Bán xe', href: '/ban-xe' },
  { key: 'len-doi', label: 'Lên đời', href: '/len-doi' },
];
const finalize = compile(`exports.work = ($, steps) => {${home.slice(start, end)}};`, { services, serviceStepList }).work;
const oldWork = serviceWork(before), newWork = serviceWork(after);
const steps = Array.from({ length: 4 }, (_, index) => ({ title: `Step ${index} <&>`,
  body: '<p>Detail <strong>kept</strong><a href="/san-pham">link</a><img src="/images/logo.png" alt="body"><script>unsafe()</script></p>',
  imageUrl: index % 2 ? null : '/images/logo.png' }));
const cases = [[steps, steps.slice(0, 3), steps.slice(0, 3)], [[], [], []], [steps, [], steps.slice(0, 1)]];
const sha = value => createHash('sha256').update(value).digest('hex');
const goldens = [];
for (const [index, data] of cases.entries()) {
  const run = work => {
    const $ = cheerio.load(snapshot, {}, false); work($, ...data);
    const intermediate = $.html();
    const next = cheerio.load(intermediate, {}, false); finalize(next, data);
    return { intermediate, html: next.html() };
  };
  const original = run(oldWork), candidate = run(newWork);
  assert.equal(candidate.html, original.html, `Exact serialized DOM case ${index}`);
  // Everything outside panels must already match, BEFORE HomePage runs.
  const outside = html => { const $ = cheerio.load(html, {}, false); $('.wap_dichvu').first().children('.dichvu').remove(); return $.html(); };
  assert.equal(outside(candidate.intermediate), outside(original.intermediate), 'No side effect outside discarded panels');
  goldens.push({ case: index, finalSha256: sha(original.html), beforeIntermediateBytes: Buffer.byteLength(original.intermediate), afterIntermediateBytes: Buffer.byteLength(candidate.intermediate) });
}
// Paired synchronous work isolates CPU/DOM cost from HTTP queue and SSR scheduling.
// Parse setup is outside the timed block; resolver transform + serialization +
// the next HomePage parse/finalization are measured as a second, inclusive span.
const rounds = [];
function measure(work, iterations, inclusive) {
  // Batch the CPU counter on Windows; individual sub-ms calls are below its
  // effective resolution. Build independent input trees outside the measurement.
  const trees = Array.from({ length: iterations }, () => cheerio.load(snapshot, {}, false));
  const cpu = process.cpuUsage(), started = performance.now();
  for (const $ of trees) {
    work($, ...cases[0]);
    if (inclusive) { const next = cheerio.load($.html(), {}, false); finalize(next, cases[0]); next.html(); }
  }
  const wallMs = performance.now() - started, elapsed = process.cpuUsage(cpu);
  return { iterations, cpuMsPerRequest: (elapsed.user + elapsed.system) / 1000 / iterations, wallMsPerRequest: wallMs / iterations };
}
for (const work of [oldWork, newWork]) measure(work, 15, true);
for (let round = 1; round <= 3; round++) {
  const entry = { round };
  for (const variant of round % 2 ? ['before', 'after'] : ['after', 'before']) {
    const work = variant === 'before' ? oldWork : newWork;
    entry[variant] = { block: measure(work, 150, false), inclusive: measure(work, 100, true) };
  }
  rounds.push(entry);
}
const result = { passed: true, note: 'Microbenchmark, not HTTP latency or V8 sampled CPU. Full snapshot, synthetic 4/3/3 steps. Same process paired order alternates.',
  beforeSha256: sha(before), afterSha256: sha(after), goldens, rounds };
await writeFile(resolve(root, 'service-dom-measurements.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
