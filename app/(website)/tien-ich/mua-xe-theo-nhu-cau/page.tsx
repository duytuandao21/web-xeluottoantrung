import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import NeedsSurvey from '@/components/utilities/car-recommendations/NeedsSurvey';
import { routeMetadata } from '@/lib/page-metadata';
export const dynamic = 'force-dynamic';
export function generateMetadata(): Promise<Metadata> {
  return routeMetadata('/tien-ich/mua-xe-theo-nhu-cau', { title: 'Mua xe theo nhu cầu', description: 'Trả lời vài câu để tìm xe đang có bán tại Toàn Trung, phù hợp ngân sách, số chỗ và nhu cầu sử dụng của bạn.', alternates: { canonical: '/tien-ich/mua-xe-theo-nhu-cau' }, openGraph: { images: ['/images/utilities/test-icon-tien-ich/mua-xe-theo-nhu-cau.png'] } });
}
export default function Page() {
  return <><SiteBreadcrumb className="tt-needs-breadcrumb" items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tiện ích' }, { label: 'Mua xe theo nhu cầu' }]} />
    <main className="main_fix tt-needs-page"><NeedsSurvey /></main></>;
}
