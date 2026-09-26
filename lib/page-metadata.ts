import 'server-only';
import type { Metadata } from 'next';
import type { LegacyPageData } from '@/types/legacy';
import { optionalPublicApi, type SeoRecord } from './public-api';

export async function pageMetadata(page: LegacyPageData | null, pathname: string): Promise<Metadata> {
  if (!page) return {};
  const seo = await optionalPublicApi<SeoRecord>('/seo', { route: pathname });
  const title = seo?.metaTitle || page.title;
  const description = seo?.metaDescription || page.description || undefined;
  const image = seo?.ogImageUrl || page.openGraphImage || undefined;
  return {
    title, description,
    alternates: { canonical: seo?.canonicalUrl || pathname },
    openGraph: { title: seo?.ogTitle || title, description: seo?.ogDescription || description, url: pathname,
      images: image ? [image.startsWith('/') || /^https?:\/\//.test(image) ? image : `/${image}`] : undefined },
    robots: seo ? { index: seo.robotsIndex ?? true, follow: seo.robotsFollow ?? true } : undefined,
  };
}
