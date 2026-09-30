import 'server-only';
import type { Metadata } from 'next';
import type { LegacyPageData } from '@/types/legacy';
import { optionalPublicApi, type SeoRecord } from './public-api';
import { getSiteName } from './site-info';

export async function pageMetadata(page: LegacyPageData | null, pathname: string): Promise<Metadata> {
  if (!page) return {};
  const seo = await optionalPublicApi<SeoRecord>('/seo', { route: pathname });
  const siteName = await getSiteName();
  const customTitle = seo?.metaTitle?.trim();
  const title = pathname === '/' ? siteName : customTitle || page.title.replace(/\s*\|\s*(?:Xe Lướt |Ô tô |Auto )?Toàn Trung\s*$/i, '');
  const description = seo?.metaDescription || page.description || undefined;
  const image = seo?.ogImageUrl || page.openGraphImage || undefined;
  return {
    title: pathname === '/' || customTitle ? { absolute: title } : title,
    alternates: { canonical: seo?.canonicalUrl || pathname },
    openGraph: { title: seo?.ogTitle || title, description: seo?.ogDescription || description, url: pathname,
      images: image ? [image.startsWith('/') || /^https?:\/\//.test(image) ? image : `/${image}`] : undefined },
    robots: seo ? { index: seo.robotsIndex ?? true, follow: seo.robotsFollow ?? true } : undefined,
  };
}
