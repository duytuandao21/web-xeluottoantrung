import 'server-only';
import { publicApi, PublicApiError, type PageResult, type SeoRecord } from './public-api';
import { SITE_ORIGIN } from './site-origin';

const PAGE_SIZE = 100;
const TTL_MS = 300_000;
const MAX_FILES = 64;
const MAX_PAGES = 5_000; // Explicit failure rather than silently truncating a catalog.
const staticPaths = ['/', '/san-pham', '/ban-xe', '/len-doi', '/ve-chung-toi', '/bai-viet', '/cau-hoi', '/dich-vu', '/phu-kien-o-to', '/tuyen-dung', '/khuyen-mai', '/tien-ich/mua-xe-theo-nhu-cau', '/tien-ich/dinh-gia-xe', '/tien-ich/xem-ngay-mua-xe'];
type Row = { slug?: string; id?: string; key?: string };
const sources: Record<string, { path: string; prefix: string; field: keyof Row; array?: boolean; params?: Record<string, string> }> = {
  cars: { path: '/cars', prefix: '/', field: 'slug' },
  articles: { path: '/articles', prefix: '/', field: 'slug' },
  experiences: { path: '/driving-experiences', prefix: '/kinh-nghiem-su-dung-xe/', field: 'slug' },
  faqs: { path: '/faqs', prefix: '/cau-hoi/', field: 'slug' },
  services: { path: '/services', prefix: '/dich-vu/', field: 'slug' },
  recruitments: { path: '/recruitments', prefix: '/tuyen-dung/', field: 'slug' },
  accessories: { path: '/accessories', prefix: '/phu-kien-o-to/', field: 'slug' },
  brands: { path: '/brands', prefix: '/', field: 'slug', array: true },
  'body-styles': { path: '/lookups/body-styles', prefix: '/', field: 'slug' },
  policies: { path: '/content', params: { group: 'thiet-lap-chinh-sach-dieu-kien' }, prefix: '/', field: 'key', array: true },
};
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const xml = (kind: 'urlset' | 'sitemapindex', urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<${kind === 'urlset' ? 'url' : 'sitemap'}><loc>${escapeXml(url)}</loc></${kind === 'urlset' ? 'url' : 'sitemap'}>`).join('')}</${kind}>\n`;
type Reader = typeof publicApi;
export class SitemapNotFound extends Error {}

// Isolated cache of sitemap XML only: never used by pages, prices or inventory.
// Single-flight and a bounded serial generation queue protect cold API reads.
export function createSitemapService(read: Reader, now: () => number = Date.now) {
  const cache = new Map<string, { body: string; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  let tail = Promise.resolve(), queued = 0, blockedUntil = 0, lastLog = -Infinity;

  async function catalog(section: string, page: number) {
    const source = sources[section];
    const result = await read<Row[] | PageResult<Row>>(source.path, source.array ? source.params : { page, limit: PAGE_SIZE });
    if (source.array) {
      if (!Array.isArray(result)) throw new Error('Invalid sitemap catalog');
      return { rows: result.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), pages: Math.ceil(result.length / PAGE_SIZE) };
    }
    if (Array.isArray(result) || !Array.isArray(result.data) || !Number.isInteger(result.meta?.totalPages) || result.meta.totalPages < 0 || result.data.length > PAGE_SIZE)
      throw new Error('Invalid sitemap pagination');
    return { rows: result.data, pages: result.meta.totalPages };
  }

  async function index() {
    const urls = [`${SITE_ORIGIN}/sitemap.xml?section=pages&page=1`];
    // Count only the first page of each fixed public collection, never all cars.
    for (const section of Object.keys(sources)) {
      const { pages } = await catalog(section, 1);
      if (pages > MAX_PAGES) throw new Error('Sitemap index capacity exceeded');
      for (let page = 1; page <= pages; page++) urls.push(`${SITE_ORIGIN}/sitemap.xml?section=${section}&page=${page}`);
    }
    if (urls.length > 50_000) throw new Error('Sitemap index capacity exceeded');
    return xml('sitemapindex', urls);
  }

  async function canonical(path: string): Promise<string | null> {
    let seo: SeoRecord | null;
    try { seo = await read<SeoRecord>('/seo', { route: path }); }
    catch (error) { if (error instanceof PublicApiError && error.status === 404) seo = null; else throw error; }
    if (seo?.robotsIndex === false) return null;
    const value = seo?.canonicalUrl?.trim() || path;
    try {
      const url = new URL(value, SITE_ORIGIN);
      // Only canonical, same-host pages; never filters, redirects or external URLs.
      if (url.origin !== SITE_ORIGIN || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== path.replace(/\/$/, '')) return null;
      return url.href;
    } catch { return null; }
  }

  async function child(section: string, page: number) {
    let paths: string[];
    if (section === 'pages') paths = staticPaths;
    else {
      const { rows, pages } = await catalog(section, page);
      if (page > pages) throw new SitemapNotFound();
      const { prefix, field } = sources[section];
      paths = rows.flatMap(row => {
        // Support the previous API during rollout; a migrated item always has a slug.
        const value = row[field] ?? (section === 'accessories' ? row.id : undefined);
        return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? [prefix + value] : [];
      });
    }
    const urls: string[] = [];
    // At most two sitemap SEO reads at once, within the existing eight slots.
    let cursor = 0;
    const workers = await Promise.allSettled([0, 1].map(async () => {
      while (cursor < paths.length) {
        const url = await canonical(paths[cursor++]);
        if (url) urls.push(url);
      }
    }));
    const failure = workers.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return xml('urlset', [...new Set(urls)].sort());
  }

  async function get(section?: string, page = 1): Promise<string> {
    if (section !== undefined && section !== 'pages' && !Object.hasOwn(sources, section) || !Number.isSafeInteger(page) || page < 1 || page > MAX_PAGES || section === 'pages' && page !== 1)
      throw new SitemapNotFound();
    const key = section ? `${section}:${page}` : 'index';
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.body;
    if (blockedUntil > now()) throw new PublicApiError(503, 'Sitemap cooling down', blockedUntil - now());
    const running = pending.get(key);
    if (running) return running;
    if (queued >= 16) throw new PublicApiError(503, 'Sitemap queue full', 10_000);
    queued++;
    const job = tail.then(async () => {
      if (blockedUntil > now()) throw new PublicApiError(503, 'Sitemap cooling down', blockedUntil - now());
      return section ? child(section, page) : index();
    }).then(body => {
      if (cache.size >= MAX_FILES) cache.delete(cache.keys().next().value!);
      cache.set(key, { body, expires: now() + TTL_MS });
      return body;
    }).catch(error => {
      if (error instanceof SitemapNotFound) throw error;
      blockedUntil = Math.max(blockedUntil, now() + Math.max(10_000, error instanceof PublicApiError ? error.retryAfterMs ?? 0 : 0));
      if (now() - lastLog >= 30_000) {
        lastLog = now();
        console.warn(JSON.stringify({ event: 'sitemap_generation_failed', status: error instanceof PublicApiError ? error.status : 503 }));
      }
      throw error;
    }).finally(() => { queued--; pending.delete(key); });
    tail = job.then(() => undefined, () => undefined);
    pending.set(key, job);
    return job;
  }
  return { get };
}

export const sitemapService = createSitemapService(publicApi);
