import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { PublicApiError, publicApi, retryComposedContent, type ContentEntry } from './public-api';

const homeGroups = new Set([
  'thiet-lap-nut-goi', 'thiet-lap-chinh-sach-dieu-kien', 'thiet-lap-mang-xa-hoi', 'thiet-lap-ung-dung',
  'thiet-lap-quy-trinh-ban-xe', 'thiet-lap-cac-buoc-mua-xe', 'thiet-lap-cac-buoc-ban-xe',
  'thiet-lap-cac-buoc-len-doi', 'thiet-lap-banner-dong-xe',
]);
type ContentItem = { ok: true; data: ContentEntry[] } | { ok: false; status: number; retryAfterSeconds?: number };
type HomeContent = { groups: Record<string, ContentItem> };
const useHomeView = cache(async () => process.env.HOME_CMS_COMPOSITION === 'true' && (await headers()).get('x-tt-home-content') === '1');
const homeView = cache(async () => {
  const started = Date.now();
  try { return { started, value: await publicApi<HomeContent>('/content/home') }; }
  catch (error) {
    // Allow API-first rolling deployment/rollback. No fallback for transport,
    // quota or malformed responses that could amplify a failing origin.
    if (error instanceof PublicApiError && error.status === 404) return { started, value: null };
    throw error;
  }
});
const contentForRequest = cache(async (group: string): Promise<ContentEntry[]> => {
  if (!homeGroups.has(group) || !await useHomeView()) return publicApi<ContentEntry[]>('/content', { group });
  const { started, value } = await homeView();
  if (value === null) return publicApi<ContentEntry[]>('/content', { group });
  const item = value?.groups?.[group];
  if (item?.ok === true && Array.isArray(item.data)) return item.data;
  if (item?.ok === false && Number.isInteger(item.status) && item.status >= 400 && item.status <= 599 &&
    (item.retryAfterSeconds === undefined || Number.isFinite(item.retryAfterSeconds) && item.retryAfterSeconds >= 0)) {
    return retryComposedContent<ContentEntry>(group, new PublicApiError(item.status, `Public API /content: ${item.status}`,
      item.retryAfterSeconds === undefined ? undefined : item.retryAfterSeconds * 1000,
      item.status === 429 ? 'rate_limit_exceeded' : item.status === 503 ? 'service_unavailable' : 'http_error'), started);
  }
  return retryComposedContent<ContentEntry>(group, new PublicApiError(502, 'Invalid public CMS view', undefined, 'invalid_payload'), started);
});

// Request-scoped memoization only. PublicResponseCache remains the sole cache
// across requests; successful, failed and fallback values never gain a Next TTL.
export function publicContent<T = ContentEntry>(group: string): Promise<T[]> {
  return contentForRequest(group) as Promise<T[]>;
}
