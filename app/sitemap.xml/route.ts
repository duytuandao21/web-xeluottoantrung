import { PublicApiError } from '@/lib/public-api';
import { sitemapService, SitemapNotFound } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const section = query.get('section') ?? undefined;
  const rawPage = query.get('page') ?? '1';
  if ([...query.keys()].some(key => !['section', 'page'].includes(key)) || query.getAll('section').length > 1 || query.getAll('page').length > 1 || !/^[1-9]\d{0,3}$/.test(rawPage) || !section && query.has('page'))
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    return new Response(await sitemapService.get(section, Number(rawPage)), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SitemapNotFound) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: {
      'Cache-Control': 'no-store', 'Retry-After': String(Math.max(10, Math.ceil((error instanceof PublicApiError ? error.retryAfterMs ?? 60_000 : 60_000) / 1000))),
    } });
  }
}
