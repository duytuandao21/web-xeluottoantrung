import 'server-only';
import { cache } from 'react';
import { publicApi } from './public-api';

export const getSiteInfo = cache(async (): Promise<Record<string, string>> => {
  try {
    const rows = await publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-thong-tin');
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  } catch {
    return {};
  }
});

export async function getSiteName(): Promise<string> {
  return (await getSiteInfo()).siteName?.trim() || 'Xe Lướt Toàn Trung';
}
