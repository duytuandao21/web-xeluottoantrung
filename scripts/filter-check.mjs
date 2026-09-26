import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/filter-options.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { optionRange, parseRangeQuery } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
for (const [group, name, expected] of [
  ['budget', '100 - 300 triệu', { min: 100, max: 300 }],
  ['budget', '1 - 1.2 tỷ', { min: 1000, max: 1200 }],
  ['budget', '800 triệu - 1 tỷ', { min: 800, max: 1000 }],
  ['budget', '1,2 - 1,5 tỷ', { min: 1200, max: 1500 }],
  ['budget', 'Dưới 500 triệu', { min: 0, max: 500 }],
  ['budget', 'Trên 1 tỷ', { min: 1000 }],
  ['year', '2026', { min: 2026, max: 2026 }],
  ['year', '2024 - 2026', { min: 2024, max: 2026 }],
  ['mileage', 'Dưới 100.000km', { min: 0, max: 100000 }],
  ['mileage', '30.000 - 50.000 km', { min: 30000, max: 50000 }],
]) assert.deepEqual(optionRange({ name }, group), expected, name);
assert.deepEqual(optionRange({ name: 'Tên tùy chỉnh', minValue: 300, maxValue: 500 }, 'budget'), { min: 300, max: 500 });
assert.equal(optionRange({ name: '500 - 100 triệu' }, 'budget'), undefined);
assert.equal(optionRange({ name: 'Chưa cấu hình' }, 'mileage'), undefined);
assert.equal(optionRange({ name: '2101' }, 'year'), undefined);
assert.deepEqual(parseRangeQuery('0-500'), { min: 0, max: 500 });
assert.deepEqual(parseRangeQuery('1000-'), { min: 1000, max: undefined });
assert.deepEqual(parseRangeQuery('-2026'), { min: undefined, max: 2026 });
assert.equal(parseRangeQuery('500-100'), undefined);
assert.equal(parseRangeQuery('-'), undefined);
console.log('Filter range checks passed.');
