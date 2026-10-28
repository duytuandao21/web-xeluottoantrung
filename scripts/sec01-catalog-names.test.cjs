// Run only inside the isolated sandbox documented in the SEC-01 fix report.
// node:vm bounds the snippet duration; it does NOT provide an OS security sandbox.
// This harness reads the real sink blocks, without importing the server/API module.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { load } = require('cheerio');
const parse = require('html-react-parser').default;
const { renderToStaticMarkup } = require('react-dom/server');

const file = path.resolve(__dirname, '../lib/public-pages.ts');
const source = readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const listing = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'listingPage');
assert.ok(listing?.body, 'The actual listing renderer must exist');
const statements = listing.body.statements;
const groupIndex = statements.findIndex(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'groupMap'));
assert.ok(groupIndex >= 0 && ts.isForOfStatement(statements[groupIndex + 1]), 'Find the real catalog filter loop');
const listingBlock = source.slice(statements[groupIndex].getStart(ast), statements[groupIndex + 1].end);

const homeLoops = [];
function findHomeLoop(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'each') {
    const selector = node.expression.expression;
    if (ts.isCallExpression(selector) && selector.expression.getText(ast) === '$' &&
      selector.arguments.length === 1 && ts.isStringLiteral(selector.arguments[0]) &&
      selector.arguments[0].text === '.muaxe .thuonghieu') homeLoops.push(node);
  }
  ts.forEachChild(node, findHomeLoop);
}
findHomeLoop(ast);
assert.equal(homeLoops.length, 1, 'Find exactly one real home catalog loop');
const homeBlock = `${homeLoops[0].getText(ast)};`;

function compile(block) {
  const result = ts.transpileModule(block, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error), []);
  return new vm.Script(result.outputText, { filename: 'sec01-real-sink.js' });
}
const scripts = { listing: compile(listingBlock), home: compile(homeBlock) };
const marker = '<iframe srcdoc="<script>parent.document.body.dataset.sec01=\'executed\'</script>"></iframe>';
const names = [
  ['ordinary', 'Toyota'],
  ['Vietnamese', 'Xe Lướt Toàn Trung – Chi nhánh Pleiku'],
  ['special characters', `Tên & < > ' "`],
  ['HTML-looking text', '<strong>Không phải HTML</strong>'],
  ['iframe srcdoc marker', marker],
  ['image event handler', '<img src=x onerror="document.body.dataset.sec01=\'executed\'">'],
  ['closing tags and SVG handler', '</a><svg onload="document.body.dataset.sec01=\'executed\'"></svg><a>'],
  ['already encoded entities', '&lt;iframe srcdoc=&quot;văn bản&quot;&gt;&amp;'],
];
const listingGroups = ['hangxe', 'kieudang', 'hopso', 'mausac', 'chinhanh'];
const homeGroups = ['hangxe', 'kieudang'];

function fixture(sink, name, withLogo) {
  const groups = sink === 'listing' ? listingGroups : homeGroups;
  const items = groups.map((group, index) => ({
    id: `dummy-${index}`, name, slug: `fixture-${group}`, stockCount: 1,
    ...(withLogo ? { imageUrl: '/sec01-fixture-logo.svg' } : {}),
    ...(group === 'mausac' ? { colorCode: '#a1b2c3' } : {}),
  }));
  const html = sink === 'listing'
    ? groups.map(group => `<div class="goiy_${group}"><p>Old option</p></div>`).join('')
    : '<div class="muaxe"><div class="thuonghieu"><p>Old option</p></div><div class="thuonghieu"><p>Old option</p></div></div>';
  const $ = load(html, {}, false);
  const filters = Object.fromEntries(['brands', 'styles', 'transmissions', 'colors', 'branches']
    .map((key, index) => [key, [items[index]]]));
  scripts[sink].runInNewContext({ $, filters, groups: items.map(item => [item]), URLSearchParams }, { timeout: 1000 });
  return { $, groups, items, html: $.html() };
}

function assertNoExecutableNodes($) {
  assert.equal($('iframe,script,svg,object,embed').length, 0, 'Names cannot introduce executable elements');
  $('*').each((_, node) => {
    for (const key of Object.keys(node.attribs || {}))
      assert.ok(!/^on/i.test(key) && key.toLowerCase() !== 'srcdoc', `Unexpected executable attribute: ${key}`);
  });
}

function checkStructure($, sink, name, withLogo, groups, items) {
  assertNoExecutableNodes($);
  for (const [index, group] of groups.entries()) {
    const parent = sink === 'listing' ? $(`.goiy_${group}`) : $('.muaxe .thuonghieu').eq(index);
    const choice = parent.children('p.img');
    assert.equal(choice.length, 1, 'Keep the existing choice element and class');
    const target = sink === 'listing' ? choice : choice.children('a');
    assert.equal(target.length, 1);
    assert.equal(target.text(), name, 'Preserve the entire name literally, with no entity double-decoding');
    const children = target.contents().toArray();
    const textNodes = children.filter(node => node.type === 'text');
    assert.equal(textNodes.length, 1, 'Append text without a wrapper');
    assert.equal(textNodes[0].data, name);
    assert.equal(children.at(-1), textNodes[0], 'Text follows the original decoration nodes');
    const hasLogo = withLogo && !(sink === 'listing' && group === 'chinhanh');
    assert.equal(target.children('img').length, hasLogo ? 1 : 0);
    if (hasLogo) {
      assert.equal(target.children('img').attr('src'), items[index].imageUrl);
      assert.equal(target.children('img').attr('alt'), name);
    }
    const hasSwatch = sink === 'listing' && group === 'mausac';
    assert.equal(target.children('span').length, hasSwatch ? 1 : 0, 'No temporary span enters the DOM');
    if (hasSwatch) assert.equal(target.children('span').attr('style'), 'background:#a1b2c3');
    assert.equal(target.children().length, Number(hasLogo) + Number(hasSwatch), 'Preserve decoration elements only');
    if (sink === 'listing') {
      assert.equal(choice.attr('data-id'), items[index].slug);
      assert.equal(choice.find('a').length, 0, 'Do not introduce links into legacy choices');
    } else {
      const query = new URLSearchParams({ [index === 0 ? 'hang-xe' : 'kieu-dang']: items[index].slug });
      assert.equal(target.attr('href'), `/san-pham?${query}`);
      assert.equal(target.attr('title'), name);
      assert.equal(parent.hasClass('home-car-brands'), index === 0);
      assert.equal(parent.attr('class'), index === 0 ? 'thuonghieu home-car-brands' : 'thuonghieu');
    }
  }
}

for (const sink of ['listing', 'home']) {
  for (const [label, name] of names) {
    for (const withLogo of [false, true]) {
      test(`${sink}: ${label}, logo=${withLogo}`, () => {
        const { $, html, groups, items } = fixture(sink, name, withLogo);
        checkStructure($, sink, name, withLogo, groups, items);
        // Test both Cheerio serialization/reparse and a parser -> React SSR round trip.
        checkStructure(load(html, {}, false), sink, name, withLogo, groups, items);
        const rendered = renderToStaticMarkup(parse(html));
        checkStructure(load(rendered, {}, false), sink, name, withLogo, groups, items);
      });
    }
  }
}

test('browser: marker control and patched names at desktop/mobile widths', {
  skip: process.env.SEC01_BROWSER !== '1' ? 'Enable only in an OS-isolated sandbox with local browser installed' : false,
  timeout: 30000,
}, async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.SEC01_BROWSER_EXECUTABLE ? { executablePath: process.env.SEC01_BROWSER_EXECUTABLE } : {}),
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    // Positive control: only set a dummy DOM marker; no cookie, storage, or network access.
    await page.setContent(`<!doctype html><html><body>${marker}</body></html>`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.sec01 === 'executed');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const sink of ['listing', 'home']) {
        for (const [, name] of names) {
          const { html } = fixture(sink, name, true);
          for (const content of [html, renderToStaticMarkup(parse(html))]) {
            await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
            await page.evaluate(() => { delete document.body.dataset.sec01; });
            await page.setContent(`<!doctype html><html><body>${content}</body></html>`, { waitUntil: 'load' });
            assert.equal(await page.locator('iframe,script,svg,object,embed').count(), 0);
            assert.equal(await page.evaluate(() => document.body.dataset.sec01), undefined);
            const selector = sink === 'listing' ? '.goiy_hangxe > p.img' : '.muaxe .thuonghieu > p.img > a';
            for (const text of await page.locator(selector).allTextContents()) assert.equal(text, name);
            assert.ok(await page.locator(selector).count() > 0);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
});
