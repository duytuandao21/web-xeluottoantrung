import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as eventSettings from '../lib/tv-anniversary-settings.ts';
const compiled = ts.transpileModule(readFileSync('lib/tv-settings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports = {};
new Function('exports','require',compiled)(exports,name=>{
  assert.equal(name,'./tv-anniversary-settings'); return eventSettings;
});
const { defaultTVSettings, parseTVSettings } = exports;

const { theme, ...legacy } = defaultTVSettings;
assert.equal(theme, 'standard');
assert.equal(parseTVSettings().theme, 'standard');
assert.equal(parseTVSettings(JSON.stringify(legacy)).theme, 'standard');
const event = { ...legacy, theme: 'anniversary-4' };
assert.equal(parseTVSettings(JSON.stringify(event)).theme, 'anniversary-4');
assert.deepEqual(parseTVSettings(JSON.stringify({ ...event, theme: 'standard' })), defaultTVSettings);
for (const invalid of [null, '', 'custom', true, {}]) {
  assert.throws(() => parseTVSettings(JSON.stringify({ ...legacy, theme: invalid })));
}
assert.deepEqual(parseTVSettings(JSON.stringify({...legacy,anniversary:undefined})).anniversary,eventSettings.defaultTVAnniversary);
assert.throws(()=>parseTVSettings(JSON.stringify({...event,anniversary:{slideSeconds:-1}})));
for (const path of ['../admin-xeluottoantrung/src/lib/tv-anniversary-settings.ts','../api-xeluottoantrung/src/modules/content/tv-anniversary-settings.ts']) {
  assert.equal(readFileSync(path,'utf8'),readFileSync('lib/tv-anniversary-settings.ts','utf8'),'event contract stays identical across repositories');
}
console.log('PASS: legacy settings, event selection, exact standard rollback, unsupported themes rejected');
