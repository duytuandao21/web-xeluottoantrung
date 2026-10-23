import 'server-only';
import { cache } from 'react';
import { publicApi, type PageResult, type PublicCar, type CallContact } from './public-api';
import { getSiteBranding } from './site-branding';
import { getSiteInfo } from './site-info';
import type { TVCar, TVSnapshot } from '@/types/tv';
import { parseTVSettings, tvSalesContacts, validTVHotlines } from './tv-settings';

export const getTVBranding = cache(async () => {
  const [info, branding] = await Promise.all([getSiteInfo(), getSiteBranding()]);
  return { logo: branding.logo, favicon: branding.favicon, phone: info.phone?.trim() || '0777393913',
    siteName: info.siteName?.trim() || 'Xe Lướt Toàn Trung' };
});

function validPage(value: PageResult<PublicCar>): boolean {
  return Array.isArray(value?.data) && Number.isInteger(value.meta?.totalPages) &&
    value.meta.totalPages >= 0 && value.meta.totalPages <= 1000;
}

/** Read public list projections only: no per-car detail, gallery or private fields. */
export const getTVSnapshot = cache(async (): Promise<TVSnapshot> => {
  const [branding, first, settings, contacts] = await Promise.all([
    getTVBranding(), publicApi<PageResult<PublicCar>>('/cars', { status: 'active', limit: 100, page: 1, sort: 'newest' }),
    publicApi<{ key: string; value: string }[]>('/site-settings/tv-display'),
    publicApi<CallContact[]>('/content', { group: 'thiet-lap-nut-goi' }),
  ]);
  const config = parseTVSettings(settings.find(row => row.key === 'config')?.value);
  const selected = config.syncSalesContacts ? tvSalesContacts(contacts) : config.hotlines;
  const fallback = validTVHotlines([{ name: branding.siteName, phone: branding.phone }]);
  const hotlines = selected.length ? selected : fallback.length ? fallback : [{ name: branding.siteName, phone: '0777393913' }];
  if (!validPage(first)) throw new Error('Invalid TV inventory response');
  const rows = [...first.data];
  // Sequential pages prevent an unbounded fan-out for a large showroom inventory.
  for (let page = 2; page <= first.meta.totalPages; page++) {
    const result = await publicApi<PageResult<PublicCar>>('/cars', { status: 'active', limit: 100, page, sort: 'newest' });
    if (!validPage(result)) throw new Error('Invalid TV inventory page');
    rows.push(...result.data);
  }
  const seen = new Set<string>();
  const cars: TVCar[] = [];
  for (const row of rows) {
    if (row.status !== 'active' || seen.has(row.slug)) continue;
    if (!row.slug || !row.name || !Number.isFinite(row.price) || row.price < 0) throw new Error('Invalid TV car');
    seen.add(row.slug);
    cars.push({ slug: row.slug, name: row.name, year: row.year, price: row.price,
      originalPrice: row.originalPrice ?? null, mileage: row.mileage ?? null, fuel: row.fuel?.trim() || 'Chưa cập nhật',
      cover: row.cover || null, coverWidth: row.coverWidth ?? null, coverHeight: row.coverHeight ?? null });
  }
  return { ...branding, logo: config.logoUrl || branding.logo, title: config.title, hotlineTitle: config.hotlineTitle,
    hotlines, carIntervalSeconds: config.carIntervalSeconds, hotlineIntervalSeconds: config.hotlineIntervalSeconds,
    cars, updatedAt: new Date().toISOString() };
});
