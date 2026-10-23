import assert from 'node:assert/strict';
import { tvPages, tvNextPage } from '../lib/tv-pages.ts';

const brands = ['deposit-only', 'land-rover', 'toyota', 'hyundai'].map(slug => ({ slug, name: slug, imageUrl: null }));
const groups = [8, 7, 1].map((count, i) => Array.from({ length: count }, (_, n) => ({
  slug: `${i}-${n}`, brandSlug: brands[i + 1].slug, name: 'Same first word for every car',
})));
const snapshot = { brands, cars: groups.flat().reverse() };
const before = JSON.stringify(snapshot);
const pages = tvPages(snapshot);
assert.deepEqual(pages.map(page => page.brandCarCount), [8, 8, 7, 7, 1], 'footer counts the whole active brand, not only this page');
assert.deepEqual(pages.map(page => [page.brand.slug, page.cars.length]), [
  ['land-rover', 6], ['land-rover', 2], ['toyota', 6], ['toyota', 1], ['hyundai', 1],
]);
for (const page of pages) assert.ok(page.cars.every(car => car.brandSlug === page.brand.slug));
assert.equal(new Set(pages.flatMap(page => page.cars.map(car => car.slug))).size, 16);
assert.deepEqual(pages.filter(page => page.brand.slug === 'toyota').flatMap(page => page.cars), groups[1].toReversed());
assert.equal(tvPages(snapshot), pages, 'same snapshot reuses its grouped pages');
assert.equal(JSON.stringify(snapshot), before, 'no mutation of inventory/catalog');
assert.deepEqual(tvPages({ cars: [], brands }), []);
const withEmptyBrands = { ...snapshot, brands: [brands[0], brands[1], { slug: 'empty-middle', name: 'Empty', imageUrl: null }, ...brands.slice(2),
  { slug: 'empty-last', name: 'Empty last', imageUrl: null }] };
assert.deepEqual(tvPages(withEmptyBrands).map(page => page.brand.slug), ['land-rover', 'land-rover', 'toyota', 'toyota', 'hyundai']);
let current = withEmptyBrands, index = 0;
for (let turn = 0; turn < 20; turn++) {
  // Every advance sees a fresh API snapshot, even when the data is unchanged.
  const updated = { ...withEmptyBrands, updatedAt: String(turn) };
  index = tvNextPage(current, index, updated);
  assert.equal(index, (turn + 1) % pages.length, 'refreshes must not interrupt repeated full cycles');
  current = updated;
}
const withoutToyota = { ...withEmptyBrands, cars: withEmptyBrands.cars.filter(car => car.brandSlug !== 'toyota') };
assert.equal(tvPages(withoutToyota)[tvNextPage(withEmptyBrands, 2, withoutToyota)].brand.slug, 'hyundai');
assert.equal(tvNextPage(withEmptyBrands, 4, withoutToyota), 0, 'last nonempty brand wraps to first after refresh');
const shrunkToyota = { ...withEmptyBrands, cars: withEmptyBrands.cars.filter(car => car.brandSlug !== 'toyota' || car.slug === '1-0') };
assert.equal(tvPages(shrunkToyota)[tvNextPage(withEmptyBrands, 3, shrunkToyota)].brand.slug, 'hyundai');
assert.equal(tvNextPage(withEmptyBrands, 4, { cars: [], brands }), 0);
assert.equal(tvNextPage({ cars: [], brands }, 0, withEmptyBrands), 0);
console.log('PASS: catalog order, multiword brands, 6/2/6/1/1 pages, no mixing/duplication/mutation, empty inventory');
console.log('PASS: four cycles across refreshes, empty brands at start/middle/end, removal/shrink and empty/recovered inventory');
