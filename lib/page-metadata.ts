import 'server-only';
import type { Metadata } from 'next';
import type { LegacyPageData } from '@/types/legacy';
import { optionalPublicApi, type SeoRecord } from './public-api';
import { getSiteName } from './site-info';
import { getImageOriginalUrl } from './image-delivery';

function titleText(title: Metadata['title']): string {
  if (typeof title === 'string') return title;
  return title && ('absolute' in title ? title.absolute : 'default' in title ? title.default : '') || '';
}

export async function routeMetadata(pathname: string, defaults: Metadata, resolvedSeo?: SeoRecord | null): Promise<Metadata> {
  const seo = resolvedSeo === undefined ? await optionalPublicApi<SeoRecord>('/seo', { route: pathname }) : resolvedSeo;
  const customTitle = seo?.metaTitle?.trim();
  const title = customTitle || titleText(defaults.title);
  const description = seo?.metaDescription?.trim() || defaults.description || undefined;
  const image = seo?.ogImageUrl?.trim() ? getImageOriginalUrl(seo.ogImageUrl.trim()) : undefined;
  const defaultImages = defaults.openGraph?.images;
  const images = image ? [image] : defaultImages ? (Array.isArray(defaultImages) ? defaultImages : [defaultImages]).map(value =>
    typeof value === 'string' ? getImageOriginalUrl(value) : value instanceof URL ? new URL(getImageOriginalUrl(value.href))
      : { ...value, url: getImageOriginalUrl(String(value.url)) }) : undefined;
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
      ...(images ? { images } : {}) },
    twitter: { ...defaults.twitter, card: 'summary_large_image', title: ogTitle, description: ogDescription,
      ...(images ? { images } : {}) },
    robots: seo ? { index: seo.robotsIndex ?? true, follow: seo.robotsFollow ?? true } : defaults.robots,
  };
}

export async function pageMetadata(page: LegacyPageData | null, pathname: string, resolvedSeo?: SeoRecord | null): Promise<Metadata> {
  if (!page) return {};
  const siteName = await getSiteName();
  const title = pathname === '/' ? siteName : pathname === '/san-pham' ? 'Mua xe' : page.title.replace(/\s*\|\s*(?:Xe Lướt |Ô tô |Auto )?Toàn Trung\s*$/i, '');
  const description = page.description || undefined;
  const image = page.openGraphImage ? getImageOriginalUrl(page.openGraphImage) : undefined;
  return routeMetadata(pathname, {
    title: pathname === '/' || /\|\s*OTO TOAN TRUNG/i.test(title) ? { absolute: title } : title,
    description,
    keywords: page.keywords || undefined,
    alternates: { canonical: pathname },
    openGraph: { title, description, url: pathname,
      images: image ? [image.startsWith('/') || /^https?:\/\//.test(image) ? image : `/${image}`] : undefined },
  }, resolvedSeo);
}
