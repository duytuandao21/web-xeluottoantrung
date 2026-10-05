import 'server-only';
import { cache } from 'react';
import { publicApi } from './public-api';

export const DEFAULT_LOGO = '/upload/photo/logo-tt-gold-6981.webp';
export const assetUrl = (value?: string | null) => value && /^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(value) ? value : undefined;
export const getSiteBranding = cache(async () => {
  const [logos, favicons] = await Promise.all([
    publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-logo').catch(() => []),
    publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-favicon').catch(() => []),
  ]);
  const values = Object.fromEntries(logos.map(row => [row.key, row.value]));
  const logo = assetUrl(values.logo) || DEFAULT_LOGO;
  return { logo, logoDark: assetUrl(values.logoDark) || logo, logoMobile: assetUrl(values.logoMobile) || logo,
    favicon: assetUrl(favicons.find(row => row.key === 'favicon')?.value) || '/upload/photo/favicon-3815.png' };
});
