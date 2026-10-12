import localImages from '@/config/cdn-local-images.json';

// Match only the two existing artworks. New banners uploaded in admin keep
// their own artwork and delivery settings.
export function homeBannerArtwork(src: string) {
  for (const kind of ['ban-xe', 'mua-xe'] as const) {
    const original = `/images/${kind}-banner.png` as const;
    if (src !== original && !src.includes(`/${localImages[original].key}`)) continue;
    const base = `/images/home-banners/${kind}-banner-wide-v1`;
    return {
      src: `${base}.webp`,
      srcSet: `${base}-480.webp 480w, ${base}-960.webp 960w, ${base}.webp 1600w`,
      sizes: '(max-width:960px) 92vw, (max-width:1024px) calc(62.56vw - 50px), 800px',
      width: 1600,
      height: 158,
    };
  }
}
