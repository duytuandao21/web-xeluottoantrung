import type { TVBrand, TVCar, TVSnapshot } from '@/types/tv';

export const TV_PAGE_SIZE = 6;
export type TVPage = { brand: TVBrand; cars: TVCar[]; brandPage: number; brandPages: number; brandCarCount: number };
const cache = new WeakMap<TVSnapshot, TVPage[]>();

/** Preserve the API/filter brand order and existing within-brand vehicle order. */
export function tvPages(snapshot: TVSnapshot): TVPage[] {
  const existing = cache.get(snapshot);
  if (existing) return existing;
  const groups = new Map<string, TVCar[]>();
  for (const car of snapshot.cars) {
    const rows = groups.get(car.brandSlug);
    if (rows) rows.push(car); else groups.set(car.brandSlug, [car]);
  }
  const pages: TVPage[] = [];
  for (const brand of snapshot.brands) {
    const cars = groups.get(brand.slug);
    if (!cars?.length) continue;
    const count = Math.ceil(cars.length / TV_PAGE_SIZE);
    for (let page = 0; page < count; page++) pages.push({ brand,
      cars: cars.slice(page * TV_PAGE_SIZE, (page + 1) * TV_PAGE_SIZE), brandPage: page, brandPages: count, brandCarCount: cars.length });
  }
  cache.set(snapshot, pages);
  return pages;
}

/** Advance through nonempty brand pages, including across refreshed snapshots. */
export function tvNextPage(current: TVSnapshot, currentPage: number, updated = current): number {
  const next = tvPages(updated);
  if (!next.length) return 0;
  const previous = tvPages(current);
  const showing = previous[currentPage];
  if (!showing) return 0;
  if (updated === current) return (currentPage + 1) % next.length;
  // A refresh must not restart a long rotation every five minutes. Follow the
  // current brand/page in the updated order, clamping if that brand shrank.
  const sameBrand = next.map((page, index) => ({ page, index })).filter(item => item.page.brand.slug === showing.brand.slug);
  if (sameBrand.length) return (sameBrand[Math.min(showing.brandPage, sameBrand.length - 1)].index + 1) % next.length;
  // If Admin removed this brand's last active car, continue to the next
  // surviving brand from the previous order; wrap when none remains after it.
  for (const page of previous.slice(currentPage + 1)) {
    const index = next.findIndex(item => item.brand.slug === page.brand.slug);
    if (index !== -1) return index;
  }
  return 0;
}
