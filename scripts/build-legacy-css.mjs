// Keep every rule and its order. Never purge selectors inferred from CMS content.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const values = require('next/dist/compiled/postcss-value-parser');
export const sources = [
  '/assets/bootstrap/bootstrap.css', '/assets/css/all.css', '/assets/fancybox3/jquery.fancybox.css',
  '/assets/slick/slick.css', '/assets/slick/slick-theme.css', '/assets/magiczoomplus/magiczoomplus.css',
  '/assets/css/style.css', '/assets/css/jquery-ui.css', '/assets/css/media.css', '/assets/login/login.css',
];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function absoluteUrls(css, source) {
  const ast = values(css);
  ast.walk(node => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
    const token = node.nodes.find(n => n.type === 'word' || n.type === 'string');
    if (!token || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(token.value)) return false;
    const url = new URL(token.value, 'https://css.invalid' + source);
    // href preserves an empty query, e.g. the existing EOT "?#iefix" suffix;
    // pathname + search + hash would silently discard that question mark.
    token.value = url.href.slice(url.origin.length);
    return false;
  });
  return ast.toString();
}
export async function generate(readSource = source => readFile(resolve('public', source.slice(1)), 'utf8')) {
  const details = [], pieces = ['@charset "UTF-8";'];
  for (const source of sources) {
    // Git may check out CRLF on Windows and LF on Ubuntu. Fingerprints and the
    // stale-source gate must be identical on both operating systems.
    const original = (await readSource(source)).replace(/\r\n?/g, '\n');
    let css = original, verbatim = false;
    try {
      const ast = postcss.parse(css, { from: source });
      ast.walk(node => {
        if (node.type === 'comment') {
          // Preserve vendor/license notices, including Magic Toolbox's notice.
          if (!/Copyright|licen[cs]e|^!/i.test(node.text)) node.remove();
          return;
        }
        node.raws.before = ''; node.raws.after = '';
        if (node.type === 'decl') node.raws.between = ':';
        else if (node.type === 'rule' || node.type === 'atrule') node.raws.between = '';
      });
      css = ast.toString();
    } catch (error) {
      // Legacy style.css contains "padding30px 0". Do NOT repair invalid CSS:
      // preserve browser error recovery and the original declarations verbatim.
      if (source !== '/assets/css/style.css' || error.reason !== 'Unknown word padding30px') throw error;
      verbatim = true;
    }
    // Encoding is declared once for this UTF-8 file; no imports/namespaces exist.
    assert(!/@(?:import|namespace)\b/i.test(css), `${source}: must review bundling semantics`);
    css = css.replace(/@charset\s+(['"])UTF-8\1\s*;/gi, '');
    pieces.push(`\n/* Source: ${source} */\n` + absoluteUrls(css, source));
    details.push({ source, sha256: digest(original), canonicalBytes: Buffer.byteLength(original), verbatim });
  }
  const css = pieces.join('\n') + '\n';
  const href = `/assets/css/site-legacy.${digest(css).slice(0, 12)}.css`;
  return { css, manifest: { href, sha256: digest(css), sources: details } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { css, manifest } = await generate();
  const target = resolve('public', manifest.href.slice(1));
  const file = resolve('config/legacy-css.json');
  if (process.argv.includes('--check')) {
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), manifest, 'Stale CSS manifest: run node scripts/build-legacy-css.mjs');
    assert.equal(await readFile(target, 'utf8'), css, 'Generated CSS changed: regenerate; never edit it directly');
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, css);
    await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(`${process.argv.includes('--check') ? 'PASS' : 'Generated'} ${posix.basename(manifest.href)} (${Buffer.byteLength(css)} bytes, all ten sources retained)`);
}
