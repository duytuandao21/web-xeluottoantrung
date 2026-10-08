import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

const baseUrl = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

// Public presentation data can tolerate a short revalidation window. Keep this
// allowlist narrow: stock counts, prices, policies and API actions stay live.
const presentationContentGroups = new Set([
  'thiet-lap-quy-trinh-ban-xe',
  'thiet-lap-cac-buoc-mua-xe',
  'thiet-lap-cac-buoc-ban-xe',
  'thiet-lap-cac-buoc-len-doi',
  'thiet-lap-banner-dong-xe',
  'thiet-lap-mang-xa-hoi',
  'thiet-lap-ung-dung',
]);
const presentationSettings = new Set([
  '/site-settings/thiet-lap-thong-tin',
  '/site-settings/thiet-lap-logo',
  '/site-settings/thiet-lap-favicon',
  '/site-settings/thiet-lap-footer',
]);
const presentationCatalogs = new Set(['/lookups/branches', '/lookups/branch-regions', '/services']);

// A cold homepage needs many independent reads. Bound the burst per server
// process to avoid sending the whole cold render to the public API at once.
const maxConcurrentReads = 8;
let activeReads = 0;
const waitingReads: Array<() => void> = [];
async function withPublicReadSlot<T>(read: () => Promise<T>): Promise<T> {
  if (activeReads >= maxConcurrentReads) await new Promise<void>(resolve => waitingReads.push(resolve));
  else activeReads++;
  try {
    return await read();
  } finally {
    const next = waitingReads.shift();
    if (next) next(); // Transfer the slot to the next waiting read.
    else activeReads--;
  }
}

export class PublicApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function readPublicData(path: string, queryString: string): Promise<unknown> {
  return withPublicReadSlot(async () => {
    // Cache outside fetch so background revalidation also acquires a read slot.
    // Fetch-level SWR would bypass this concurrency limit.
    const response = await fetch(`${baseUrl}/api/v1${path}${queryString ? `?${queryString}` : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new PublicApiError(response.status, `Public API ${path}: ${response.status}`);
    return response.json();
  });
}

const readCached60 = unstable_cache(readPublicData, ['public-api-v2-60', baseUrl], { revalidate: 60 });
const readCached30 = unstable_cache(readPublicData, ['public-api-v2-30', baseUrl], { revalidate: 30 });
// Reuse parsed results within SSR, including page/layout/metadata callers.
// Origin, path and the full query also form the persistent cache key.
const readRequestData = cache((path: string, queryString: string, seconds: number) =>
  seconds === 60 ? readCached60(path, queryString) : seconds === 30 ? readCached30(path, queryString) : readPublicData(path, queryString));

export async function publicApi<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined && value !== '') query.set(key, String(value));
  const presentation = presentationSettings.has(path) || presentationCatalogs.has(path) ||
    (path === '/content' && presentationContentGroups.has(query.get('group') || ''));
  // Keep inventory, user-specific data, policies and contact-action content fresh.
  // A revalidated response may remain stale for one request after its TTL expires.
  const immediate = path === '/search' || path.startsWith('/search/') || path === '/seo' || path.startsWith('/auspicious-dates/') ||
    path === '/driving-experiences' || path.startsWith('/driving-experiences/') ||
    path === '/cars' || path.startsWith('/cars/') || path === '/brands' ||
    path === '/accessories' || path.startsWith('/accessories/') ||
    path === '/services' || path.startsWith('/services/') ||
    path === '/lookups/branches' || path === '/lookups/branch-regions' ||
    path.startsWith('/site-settings/') || path === '/content';
  const stable = path.startsWith('/brands/') ||
    path.startsWith('/lookups/') || path === '/slides' || path === '/testimonials' ||
    path === '/accessory-brands' || path === '/accessory-categories' ||
    path === '/faqs' || path.startsWith('/faqs/') ||
    path === '/recruitments' || path.startsWith('/recruitments/');
  const seconds = presentation ? 60 : immediate ? 0 : stable ? 60 : 30;
  return readRequestData(path, query.toString(), seconds) as Promise<T>;
}

export type PageResult<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
export type PublicCar = {
  slug: string; name: string; year: number; price: number; originalPrice?: number | null; mileage?: number | null;
  status: string; featured?: boolean; fuel?: string | null; cover?: string | null; transmission?: string | null;
  color?: string | null; colorSlug?: string | null;
  seatCount?: number | null; branch?: string | null;
  brand: { name: string; slug: string }; model: { name: string; slug: string }; bodyType?: string | null;
};
export type CarDetail = Omit<PublicCar, 'cover' | 'transmission' | 'branch'> & {
  description?: string | null; condition?: string | null; seatCount?: number | null;
  version?: string | null; transmission?: string | null; color?: string | null;
  branch?: { name: string; slug: string; address?: string; phone?: string; mapUrl?: string | null; imageUrl?: string | null } | null;
  media: { url: string; altText?: string | null; isCover: boolean; sortOrder: number }[];
  specifications: { key: string; label: string; value: string; sortOrder: number }[];
};
export type PublicLookup = { id: string; name: string; slug: string; imageUrl?: string | null; colorCode?: string | null };
export async function allPublicLookups<T = PublicLookup>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const first = await publicApi<PageResult<T>>(path, { ...params, limit: 100 });
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
    publicApi<PageResult<T>>(path, { ...params, limit: 100, page: index + 2 })));
  return [...first.data, ...rest.flatMap(page => page.data)];
}
export type PublicBrand = PublicLookup & { stockCount: number };
export type SeoRecord = { metaTitle?: string | null; metaDescription?: string | null; ogTitle?: string | null;
  keywords?: string | null; ogDescription?: string | null; ogImageUrl?: string | null; canonicalUrl?: string | null;
  robotsIndex?: boolean; robotsFollow?: boolean };
export type Article = { slug: string; title: string; excerpt?: string | null; content?: string | null;
  imageUrl?: string | null; status: string; publishedAt?: string | null };
export type Testimonial = { id: string; name: string; content: string; rating: number; avatarUrl?: string | null; carBought?: string | null; purchaseDate?: string | null; featured?: boolean };
export type Faq = { id: string; slug: string; question: string; answer: string; excerpt?: string | null; imageUrl?: string | null; featured?: boolean; sortOrder: number; createdAt?: string | null };
export type Slide = { id: string; title: string; imageUrl: string; link?: string | null };
export type Service = { id: string; slug: string; title: string; description: string; imageUrl?: string | null; icon?: string | null };
export type Accessory = { id: string; name: string; brand: string; brandId?: string | null; categoryId?: string | null; price: number; imageUrl: string; imageUrls: string[]; description?: string | null };
export type AccessoryLookup = { id: string; name: string; imageUrl?: string | null };
export type Recruitment = { id: string; slug: string; title: string; description: string; excerpt?: string | null;
  imageUrl?: string | null; createdAt?: string | null };
export type CmsPage = { path: string; title: string; body?: string | null };
export type CallContact = { id: string; title: string; body?: string | null; phone?: string | null; sortOrder: number };
export type ContentEntry = { id: string; key: string; title: string; body?: string | null; imageUrl?: string | null; link?: string | null; sortOrder: number };

export async function optionalPublicApi<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T | null> {
  try { return await publicApi<T>(path, params); }
  catch (error) { if (error instanceof PublicApiError && error.status === 404) return null; throw error; }
}
