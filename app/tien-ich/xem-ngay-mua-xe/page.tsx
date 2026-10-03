import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import AuspiciousDateViewer from '@/components/utilities/AuspiciousDateViewer';
import { routeMetadata } from '@/lib/page-metadata';
import { publicApi } from '@/lib/public-api';
import type { DateConfig } from '@/lib/auspicious-date';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const config = await publicApi<DateConfig>('/auspicious-dates/config').catch(() => null);
  return routeMetadata('/tien-ich/xem-ngay-mua-xe', { title: config?.seoTitle ? { absolute: config.seoTitle } : 'Xem ngày mua xe',
    description: config?.seoDescription || 'Tham khảo ngày phù hợp để mua xe, nhận xe hoặc ký hợp đồng tại Toàn Trung.',
    alternates: { canonical: '/tien-ich/xem-ngay-mua-xe' }, openGraph: { images: ['/images/utilities/test-icon-tien-ich/xem-ngay-mua-xe.png'] } });
}
export default function Page() { return <><SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tiện ích' }, { label: 'Xem ngày mua xe' }]} /><main className="main_fix tt-date-page"><AuspiciousDateViewer /></main></>; }
