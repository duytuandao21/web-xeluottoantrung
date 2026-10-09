import fs from 'node:fs';
import { chromium } from 'playwright';
const stage = process.argv[2]; if (!['before', 'after'].includes(stage)) throw Error('Choose before/after');
const out = '../toi-uu-hieu-suat-website/phase-3';
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await c.newPage(), cdp = await c.newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); await cdp.send('CSS.startRuleUsageTracking');
  const sheets = new Map(); cdp.on('CSS.styleSheetAdded', e => sheets.set(e.header.styleSheetId, e.header));
  await p.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3107', { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(12000);
  const coverage = await cdp.send('CSS.stopRuleUsageTracking'), css = [];
  for (const [id, sheet] of sheets) {
    const text = (await cdp.send('CSS.getStyleSheetText', { styleSheetId: id })).text;
    const rules = coverage.ruleUsage.filter(r => r.styleSheetId === id);
    css.push({ url: sheet.sourceURL, characters: text.length, rules: rules.length, usedRuleCharacters: rules.filter(r => r.used).reduce((n, r) => n + r.endOffset - r.startOffset, 0) });
  }
  const entries = await p.evaluate(() => performance.getEntriesByType('resource').map(r => ({ url: r.name, initiator: r.initiatorType, encodedBytes: r.encodedBodySize, transferBytes: r.transferSize })));
  const manifest = JSON.parse(fs.readFileSync('.next/app-build-manifest.json', 'utf8'));
  const bundle = [...new Set([...(manifest.pages['/layout'] || []), ...(manifest.pages['/page'] || [])])].map(path => ({ path, bytes: fs.statSync('.next/' + path).size }));
  fs.writeFileSync(`${out}/resources-${stage}.json`, JSON.stringify({ buildId: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(), css,
    scripts: entries.filter(e => e.initiator === 'script'), entries, bundle,
    initialOnlyCoverage: true, warning: 'Unused CSS here may be required by interactions and other routes; not a removal list.' }, null, 2));
  console.log(`PASS ${stage}: ${css.length} stylesheets, ${entries.filter(e => e.initiator === 'script').length} scripts audited`);
} finally { await b.close(); }
