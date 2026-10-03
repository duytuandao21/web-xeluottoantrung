import 'server-only';
import type { Metadata } from 'next';
import type { LegacyPageData } from '@/types/legacy';
import { optionalPublicApi, type SeoRecord } from './public-api';
import { getSiteName } from './site-info';

function titleText(title: Metadata['title']): string {
  if (typeof title === 'string') return title;
  return title && ('absolute' in title ? title.absolute : 'default' in title ? title.default : '') || '';
}

export async function routeMetadata(pathname: string, defaults: Metadata): Promise<Metadata> {
  const seo = await optionalPublicApi<SeoRecord>('/seo', { route: pathname });
  const customTitle = seo?.metaTitle?.trim();
  const title = customTitle || titleText(defaults.title);
  const description = seo?.metaDescription?.trim() || defaults.description || undefined;
  const image = seo?.ogImageUrl?.trim();
  const defaultCanonical = defaults.alternates?.canonical;
  const canonical = seo?.canonicalUrl?.trim() || (defaultCanonical && typeof defaultCanonical === 'object' && 'url' in defaultCanonical ? defaultCanonical.url : defaultCanonical) || pathname;
  const ogTitle = seo?.ogTitle?.trim() || customTitle || defaults.openGraph?.title || title;
  const ogDescription = seo?.ogDescription?.trim() || description || defaults.openGraph?.description;
  return {
    ...defaults,
    title: customTitle ? { absolute: customTitle } : defaults.title,
    description,
    keywords: seo?.keywords?.trim() || defaults.keywords || undefined,
    alternates: { ...defaults.alternates, canonical },
    openGraph: { ...defaults.openGraph, title: ogTitle, description: ogDescription, url: canonical,
      ...(image ? { images: [image] } : {}) },
    twitter: { ...defaults.twitter, card: 'summary_large_image', title: ogTitle, description: ogDescription,
      ...(image ? { images: [image] } : defaults.openGraph?.images ? { images: defaults.openGraph.images } : {}) },
    robots: seo ? { index: seo.robotsIndex ?? true, follow: seo.robotsFollow ?? true } : defaults.robots,
  };
}

export async function pageMetadata(page: LegacyPageData | null, pathname: string): Promise<Metadata> {
  if (!page) return {};
  const siteName = await getSiteName();
  const title = pathname === '/' ? siteName : pathname === '/san-pham' ? 'Mua xe' : page.title.replace(/\s*\|\s*(?:Xe Lướt |Ô tô |Auto )?Toàn Trung\s*$/i, '');
  const description = page.description || undefined;
  const image = page.openGraphImage || undefined;
  return routeMetadata(pathname, {
    title: pathname === '/' || /\|\s*OTO TOAN TRUNG/i.test(title) ? { absolute: title } : title,
    description,
    keywords: page.keywords || undefined,
    alternates: { canonical: pathname },
    openGraph: { title, description, url: pathname,
      images: image ? [image.startsWith('/') || /^https?:\/\//.test(image) ? image : `/${image}`] : undefined },
  });
}
