import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText).toString('base64')}`;
const helperUrl = moduleUrl(await readFile('lib/car-new-arrival.ts', 'utf8'));
const { isNewArrival, newArrivalExpiresAt, NEW_ARRIVAL_DURATION_MS: week } = await import(helperUrl);
const { carToCard } = await import(moduleUrl((await readFile('lib/car-view.ts', 'utf8')).replace("'./car-new-arrival'", JSON.stringify(helperUrl))));
const created = '2026-10-01T09:30:00+07:00';
const start = Date.parse(created);
assert.equal(week, 604800000);
assert.equal(newArrivalExpiresAt(created), start + week);
assert.equal(isNewArrival(created, start), true);
assert.equal(isNewArrival(created, start + week - 1), true);
assert.equal(isNewArrival(created, start + week), false);
assert.equal(isNewArrival(created, start + week + 1), false);
assert.equal(isNewArrival(created, start - 1), false, 'Do not tag future creation dates');
assert.equal(isNewArrival(new Date(start).toISOString(), start + week - 1), true, 'Timezone offsets represent the same instant');
for (const invalid of [undefined, null, '', 'invalid']) {
  assert.equal(newArrivalExpiresAt(invalid), null);
  assert.equal(isNewArrival(invalid, start), false);
}
const car = { slug: 'arrival-fixture', name: 'Arrival fixture', year: 2024, price: 100000000, status: 'active' };
const now = Date.now();
assert.equal(carToCard({ ...car, createdAt: new Date(now - 9 * 86400000).toISOString(), updatedAt: new Date(now).toISOString(), newArrival: true }).isNewArrival, false,
  'Editing a car or retaining a manual flag cannot restart the seven days');
assert.equal(carToCard({ ...car, createdAt: new Date(now - 86400000).toISOString(), newArrival: true }).isNewArrival, true);
assert.equal(carToCard({ ...car, createdAt: new Date(now - 86400000).toISOString(), newArrival: false }).isNewArrival, false,
  'Admin can hide a fresh car tag without changing its creation time');
assert.equal(carToCard({ ...car, createdAt: new Date(now - 86400000).toISOString() }).isNewArrival, false);
assert.equal(carToCard(car).isNewArrival, false, 'Never use a missing creation time as today');
console.log('PASS arrival: creation timestamp, exact seven-day boundary, timezone, invalid/future data and edits/manual flags');
