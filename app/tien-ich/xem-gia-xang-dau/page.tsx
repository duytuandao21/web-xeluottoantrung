import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import FuelPriceViewer from '@/components/utilities/FuelPriceViewer';

export const metadata: Metadata = {
  title: 'Xem giá xăng dầu',
  description: 'Xem giá xăng dầu Petrolimex theo Vùng 1 và Vùng 2.',
};

export default function FuelPricesPage() {
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tiện ích' }, { label: 'Giá xăng dầu' }]} />
    <main className="tt-utility-page tt-fuel-page main_fix"><FuelPriceViewer /></main>
  </>;
}
