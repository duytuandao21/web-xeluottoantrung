import 'server-only';
import { cache } from 'react';

const baseUrl = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

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
  constructor(public status: number, message: string, public retryAfterMs?: number, public reason = 'http_error') { super(message); }
}

const modelPath = /^\/brands\/[a-z0-9]+(?:-[a-z0-9]+)*\/models$/;
const lookupPath = /^\/lookups\/(?:car-versions|body-styles|transmissions|car-colors|branch-regions|branches|filter-options)$/;
const readLogTimes = new Map<string, number>();
const diagnosticContentGroups = new Set([
  'thiet-lap-chinh-sach-dieu-kien', 'thiet-lap-nut-goi', 'thiet-lap-mang-xa-hoi', 'thiet-lap-ung-dung',
  'thiet-lap-quy-trinh-ban-xe', 'thiet-lap-cac-buoc-mua-xe', 'thiet-lap-cac-buoc-ban-xe', 'thiet-lap-cac-buoc-len-doi',
  'thiet-lap-banner-dong-xe', 'thiet-lap-goi-y-nam-san-xuat', 'thiet-lap-tai-sao-chon', 'quan-ly-gioi-thieu',
]);
function logReadFailure(path: string, error: PublicApiError, attempt: number, outcome: 'retry' | 'failed' | 'lookup_unavailable', queryString = '') {
  // Never log queries, response bodies, credentials or user-supplied search text.
  const endpoint = path.split('?')[0];
  const query = new URLSearchParams(queryString);
  const group = endpoint === '/content' ? query.size === 1 && diagnosticContentGroups.has(query.get('group') ?? '') ? query.get('group') : 'other' : undefined;
  const key = `${endpoint}:${group ?? ''}:${error.status}:${outcome}`;
  const now = Date.now();
  if (now - (readLogTimes.get(key) ?? 0) < 10_000) return;
  if (readLogTimes.size >= 64) readLogTimes.delete(readLogTimes.keys().next().value!);
  readLogTimes.set(key, now);
  console.warn(JSON.stringify({ event: 'public_api_read_failure', endpoint, status: error.status,
    ...(group ? { group } : {}), reason: error.reason, attempt: attempt + 1, outcome }));
}

function retryAfterMs(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function readPublicData(path: string, queryString: string): Promise<unknown> {
  const models = modelPath.test(path);
  const budgetMs = path === '/cars/menu' ? 7_000 : 5_000;
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await withPublicReadSlot(async () => {
        // The API owns persistent caching and synchronous admin invalidation.
        // Keep React's per-render memoization; never cache stock or private data here.
        const response = await fetch(`${baseUrl}/api/v1${path}${queryString ? `?${queryString}` : ''}`, {
          cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, budgetMs - (Date.now() - started))),
        });
        if (!response.ok) {
          const wait = retryAfterMs(response.headers?.get('retry-after'));
          // Release the failed response before retrying; do not leave undici
          // connections occupied by unread error bodies during an outage.
          await response.body?.cancel().catch(() => undefined);
          throw new PublicApiError(response.status, `Public API ${path}: ${response.status}`, wait,
            response.status === 429 ? 'rate_limit_exceeded' : response.status === 503 ? 'service_unavailable' : 'http_error');
        }
        const data: unknown = await response.json();
        if (models && (!Array.isArray(data) || !data.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.slug === 'string') ||
          new Set(data.map(item => item.id)).size !== data.length)) throw new PublicApiError(502, 'Invalid model catalog', undefined, 'invalid_payload');
        return data;
      });
    } catch (cause) {
      // Next uses thrown control-flow errors for dynamic rendering/redirects.
      // Preserve those and programming errors; classify only native I/O errors.
      const name = cause && typeof cause === 'object' && 'name' in cause ? String(cause.name) : '';
      if (!(cause instanceof PublicApiError) && !['TypeError', 'TimeoutError', 'AbortError', 'SyntaxError'].includes(name)) throw cause;
      const error = cause instanceof PublicApiError ? cause : new PublicApiError(name === 'SyntaxError' ? 502 : 503,
        `Public API ${path}: transport failure`, undefined, name);
      const delay = Math.max(150 * 2 ** attempt + Math.floor(Math.random() * 50), error.retryAfterMs ?? 0);
      const transient = error.status === 429 || error.status === 503 || models && error.status >= 500;
      // GET only, at most one retry. Long Retry-After values are not shortened:
      // fail safely instead of blocking SSR for a minute or retrying too early.
      if (!transient || attempt >= 1 || delay > 750 || Date.now() - started + delay + 250 >= budgetMs) {
        logReadFailure(path, error, attempt, 'failed', queryString);
        throw error;
      }
      logReadFailure(path, error, attempt, 'retry', queryString);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Reuse parsed results within SSR, including page/layout/metadata callers.
// React memoization lasts one render; it cannot conceal API invalidation across
// requests. Cross-request coalescing belongs to the API so that admin mutations
// can detach old reads. Failed responses are never retained between renders.
const readRequestData = cache(readPublicData);

export async function publicApi<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b)))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return readRequestData(path, query.toString()) as Promise<T>;
}

export type PageResult<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
export type PublicCar = {
  slug: string; name: string; year: number; price: number; originalPrice?: number | null; mileage?: number | null;
  status: string; featured?: boolean; fuel?: string | null; cover?: string | null; transmission?: string | null;
  color?: string | null; colorSlug?: string | null; createdAt?: string | null; newArrival?: boolean;
  seatCount?: number | null; branch?: string | null;
  brand: { name: string; slug: string }; model: { name: string; slug: string }; bodyType?: string | null;
};
export type CarDetail = Omit<PublicCar, 'cover' | 'transmission' | 'branch'> & {
  id: string;
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

// Only optional filter/navigation lookup data may degrade. A null result means
// unavailable, not an empty successful catalog. Never use this for cars or leads.
export async function optionalLookupPage<T = PublicLookup>(path: string, params?: Record<string, string | number | undefined>): Promise<PageResult<T> | null> {
  if (!lookupPath.test(path)) throw new Error('Optional fallback is limited to public lookups');
  try { return await publicApi<PageResult<T>>(path, params); }
  catch (error) {
    if (!(error instanceof PublicApiError) || !(error.status === 429 || error.status >= 500 && error.status < 600)) throw error;
    logReadFailure(path, error, 0, 'lookup_unavailable');
    return null;
  }
}

export async function optionalPublicLookups<T = PublicLookup>(path: string, params: Record<string, string | number> = {}): Promise<T[] | null> {
  const first = await optionalLookupPage<T>(path, { ...params, limit: 100 });
  if (!first) return null;
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
    optionalLookupPage<T>(path, { ...params, limit: 100, page: index + 2 })));
  // A missing later page must not masquerade as a complete lookup catalog.
  if (rest.some(page => page === null)) return null;
  return [...first.data, ...rest.flatMap(page => page!.data)];
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
