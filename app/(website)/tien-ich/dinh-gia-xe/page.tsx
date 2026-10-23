import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import ValuationViewer from '@/components/utilities/valuation/ValuationViewer';
import { routeMetadata } from '@/lib/page-metadata';
import { getSiteInfo } from '@/lib/site-info';
import { zaloHref } from '@/lib/contact-links';

export const dynamic = 'force-dynamic';
export function generateMetadata(): Promise<Metadata> {
  return routeMetadata('/tien-ich/dinh-gia-xe', { title: 'Định giá xe cũ',
    description: 'Tham khảo giá trị ô tô cũ và khoảng giá thu mua tại Toàn Trung dựa trên phiên bản, năm sản xuất, số km và tình trạng xe.',
    alternates: { canonical: '/tien-ich/dinh-gia-xe' }, openGraph: { images: ['/images/utilities/test-icon-tien-ich/dinh-gia-xe-cu.png'] } });
}
export default async function Page() {
  const info = await getSiteInfo(), phone = info.phone?.trim();
  const digits = (phone || '').replace(/\D/g, '');
  return <><SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tiện ích' }, { label: 'Định giá xe cũ' }]} />
    <main className="main_fix tt-valuation-page"><ValuationViewer contact={{ phone: phone || '', phoneHref: /^\d{9,12}$/.test(digits) ? `tel:${digits}` : null, zaloHref: info.zalo?.trim() ? zaloHref(info.zalo) : null }} /></main></>;
}
