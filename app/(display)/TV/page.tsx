import type { Metadata } from 'next';
import TVDisplay from '@/components/tv/TVDisplay';
import { getTVBranding, getTVSnapshot } from '@/lib/tv-data';
import { getImageOriginalUrl } from '@/lib/image-delivery';
import { defaultTVSettings } from '@/lib/tv-settings';

export const dynamic = 'force-dynamic';
const TV_WEBSITE = 'https://xeluottoantrung.com';
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTVBranding();
  return { title: 'Bảng giá xe đang bán | Xe Lướt Toàn Trung',
    robots: { index: false, follow: false }, icons: { icon: getImageOriginalUrl(branding.favicon) } };
}

export default async function TVPage() {
  try { return <TVDisplay initial={await getTVSnapshot()} website={TV_WEBSITE} />; }
  catch {
    const branding = await getTVBranding();
    return <TVDisplay initial={{ ...branding, ...defaultTVSettings,
      hotlines: [{ name: branding.siteName, phone: branding.phone }], cars: [], brands: [], updatedAt: new Date().toISOString() }}
      unavailable website={TV_WEBSITE} />;
  }
}
