import localImages from '../config/cdn-local-images.json';
import remoteDimensions from '../config/cdn-image-dimensions.json';

/** Pure, shared SSR/browser adapter. The factory preserves explicit original mode. */
export const IMAGE_DELIVERY_WIDTHS = [240, 320, 480, 640, 768, 960, 1200, 1600, 1920] as const;
export const IMAGE_DELIVERY_QUALITIES = [80, 85, 90] as const;

export type ImageDeliveryWidth = typeof IMAGE_DELIVERY_WIDTHS[number];
export type ImageDeliveryQuality = typeof IMAGE_DELIVERY_QUALITIES[number];
export type ImageDeliveryKind = 'logo' | 'hero' | 'card' | 'thumbnail' | 'gallery' | 'content' | 'lightbox';
export type ImageDeliveryRequest = {
  src: string;
  width?: ImageDeliveryWidth;
  quality?: ImageDeliveryQuality;
  kind?: ImageDeliveryKind;
};
export type ImageDeliveryConfiguration = {
  mode?: string;
  cloudflareOrigin?: string;
  sourceOrigins?: string;
  legacyOrigins?: string;
};

// Audited CSS sizes are recorded in phase-2a/image-inventory.md. These are
// bounded candidates, not a claim that every source supports every size.
const widthsByKind: Record<Exclude<ImageDeliveryKind, 'lightbox'>, readonly number[]> = {
  logo: [240, 320, 480, 640, 960],
  hero: [480, 640, 768, 960, 1200, 1600, 1920],
  card: [320, 480, 640, 768, 960, 1200],
  thumbnail: [240, 320, 480],
  gallery: [480, 640, 768, 960, 1200, 1600, 1920],
  content: [320, 480, 640, 768, 960, 1200, 1600, 1920],
};

function publicHttpsUrl(value: string): URL | undefined {
  // Reject browser-normalized backslashes, whitespace and credential URLs.
  if (!value.startsWith('https://') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.username || url.password || url.port || !host.includes('.') ||
      host.endsWith('.') || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.startsWith('[') || /^[\d.]+$/.test(host)) return;
    return url;
  } catch {
    return;
  }
}

function publicHttpsOrigin(value: string): string | undefined {
  const url = publicHttpsUrl(value);
  if (!url || url.pathname !== '/' || url.search || url.hash) return;
  return url.origin;
}

/** Invalid/missing opt-in config falls back before any transform URL is built. */
export function createImageDelivery(configuration: ImageDeliveryConfiguration = {}) {
  const origin = publicHttpsOrigin(configuration.cloudflareOrigin || '');
  const rawSources = (configuration.sourceOrigins || '').split(',').map(value => value.trim());
  const sources = rawSources.map(publicHttpsOrigin);
  const enabled = configuration.mode === 'cloudflare' && Boolean(origin) &&
    sources.length > 0 && sources.every(Boolean);
  const allowedSources = new Set(sources);

  const aliases = (configuration.legacyOrigins || '').split(',').filter(Boolean).map(value => publicHttpsOrigin(value.trim()));
  const legacySources = new Set(aliases.every(Boolean) ? aliases : []);
  const original = (src: string): string => {
    if (!enabled) return src;
    const local = Object.prototype.hasOwnProperty.call(localImages, src) ? (localImages as Record<string, { url: string }>)[src] : undefined;
    if (local && publicHttpsUrl(local.url)?.origin === origin) return local.url;
    const source = publicHttpsUrl(src);
    if (!source || Array.from(source.searchParams.keys()).some(key =>
      /^(?:x-amz-|x-goog-)|^(?:token|signature|sig|key|api_key|access_token)$/i.test(key))) return src;
    return legacySources.has(source.origin) ? src.replace(/^https:\/\/[^/]+/, origin!) : src;
  };

  const deliver = ({ src, width, quality = 85, kind = 'card' }: ImageDeliveryRequest): string => {
    // Do not normalize, rewrite hosts, trim, decode or append params here.
    if (!enabled) return src;
    src = original(src);
    if (kind === 'lightbox') return src;
    if (!Object.prototype.hasOwnProperty.call(widthsByKind, kind) ||
      !widthsByKind[kind].includes(width as number) ||
      !(IMAGE_DELIVERY_QUALITIES as readonly number[]).includes(quality)) return src;
    const source = publicHttpsUrl(src);
    if (!source || !allowedSources.has(source.origin) || source.hash ||
      source.pathname.toLowerCase().includes('/cdn-cgi/image/') ||
      !/\.(?:jpe?g|png|webp|avif)$/i.test(source.pathname)) return src;
    // Source credentials/query signatures must never be forwarded to a service.
    if (Array.from(source.searchParams.keys()).some(key =>
      /^(?:x-amz-|x-goog-)|^(?:token|signature|sig|key|api_key|access_token)$/i.test(key))) return src;
    // Width only: preserve the source ratio, do not crop, pad or upscale.
    // Keep the raw source string so existing path/query encoding survives.
    return `${origin}/cdn-cgi/image/width=${width},quality=${quality},fit=scale-down,format=auto/${src}`;
  };
  return Object.assign(deliver, { original });
}

// Direct NEXT_PUBLIC references are replaced by Next at build time in both
// bundles. No window, viewport, localStorage or server-only environment lookup.
export const getImageDeliveryUrl = createImageDelivery({
  mode: process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE || 'cloudflare',
  cloudflareOrigin: process.env.NEXT_PUBLIC_IMAGE_CLOUDFLARE_ORIGIN || 'https://cdn.toantrungxeluot.io.vn',
  sourceOrigins: process.env.NEXT_PUBLIC_IMAGE_SOURCE_ORIGINS || 'https://cdn.toantrungxeluot.io.vn',
  legacyOrigins: process.env.NEXT_PUBLIC_IMAGE_LEGACY_R2_ORIGINS || 'https://pub-edb90463be404b1d8b79b79517518131.r2.dev',
});

export const getImageOriginalUrl = getImageDeliveryUrl.original;
type Dimensions = { width: number; height: number; animated?: boolean };
export function imageDimensions(src: string): Dimensions | undefined {
  return Object.prototype.hasOwnProperty.call(localImages, src) ? (localImages as Record<string, Dimensions>)[src]
    : Object.prototype.hasOwnProperty.call(remoteDimensions, src) ? (remoteDimensions as Record<string, Dimensions>)[src] : undefined;
}

export type ImageProfile = Exclude<ImageDeliveryKind, 'lightbox'> | 'icon' | 'brand';
export const IMAGE_SIZES: Record<ImageProfile, string> = {
  brand: '(max-width: 760px) 52px, 64px',
  logo: '150px', icon: '160px', thumbnail: '90px', hero: '100vw',
  card: '(max-width: 490px) calc((100vw - 32px) / 2), (max-width: 800px) calc((100vw - 64px) / 2), 400px',
  gallery: '(max-width: 960px) calc(100vw - 32px), 760px',
  content: '(max-width: 960px) calc(100vw - 32px), 1100px',
};

/** Width descriptors reflect actual scale-down output, deduplicated at source size. */
export function responsiveImage(src: string, profile: ImageProfile = 'content', sizes = IMAGE_SIZES[profile]) {
  const original = getImageOriginalUrl(src);
  const kind = profile === 'icon' || profile === 'brand' ? 'logo' : profile;
  // Small brand tiles need at most 192 physical pixels at 3x DPR. Reuse the
  // existing 240px CDN variant, including when source dimensions are unknown.
  const widths = profile === 'brand' ? [240] : widthsByKind[kind];
  const dimensions = imageDimensions(src);
  const quality = profile === 'logo' || profile === 'icon' || profile === 'brand' ? 90 : 85;
  if (dimensions?.animated) return { src: original, sizes: undefined, srcSet: undefined, original };
  const fallback = getImageDeliveryUrl({ src, width: widths.at(-1) as ImageDeliveryWidth, quality, kind });
  // Unknown dimensions use one conservative variant. Never invent width descriptors.
  let pathname = '';
  try { pathname = new URL(original, 'https://local.invalid').pathname; } catch { /* Invalid sources remain unchanged. */ }
  if (!dimensions?.width || dimensions.animated || !/\.(?:jpe?g|png|webp|avif)$/i.test(pathname) || fallback === original) {
    return { src: fallback, sizes: undefined, srcSet: undefined, original };
  }
  if (dimensions.width < IMAGE_DELIVERY_WIDTHS[0]) return { src: original, sizes: undefined, srcSet: undefined, original };
  const variants: { url: string; pixels: number }[] = [];
  for (const width of widths) {
    const pixels = Math.min(width, dimensions.width);
    if (variants.some(v => v.pixels === pixels)) break;
    variants.push({ url: getImageDeliveryUrl({ src, width: width as ImageDeliveryWidth, quality, kind }), pixels });
    if (width >= dimensions.width) break;
  }
  return { src: variants.at(-1)!.url, srcSet: variants.map(v => `${v.url} ${v.pixels}w`).join(', '), sizes, original };
}

export function imageProfile(ancestorClasses: string): ImageProfile {
  if (/slider_slick/.test(ancestorClasses)) return 'hero';
  if (/home-car-brands|vehicle-brands/.test(ancestorClasses)) return 'brand';
  if (/thuonghieu|vehicle-brands|brand-logo|logo|ngansach/.test(ancestorClasses)) return 'logo';
  if (/tt-home-utility|tt-(?:date|valuation|needs)-hero/.test(ancestorClasses)) return 'icon';
  if (/tt-chat|avatar|camnhan/.test(ancestorClasses)) return 'thumbnail';
  if (/item_qt|quytrinh/.test(ancestorClasses)) return 'icon';
  if (/img_sp|img_post|tt-home-news|tt-article-preview|tt-accessory-card|tt-faq-card/.test(ancestorClasses)) return 'card';
  return 'content';
}
