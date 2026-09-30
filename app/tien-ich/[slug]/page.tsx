import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import shared from '@/data/shared.json';

type Props = { params: Promise<{ slug: string }> };

function utilityFor(slug: string) {
  return shared.menu.find(item => item.label === 'Tiện ích')?.children.find(item => item.href === `/tien-ich/${slug}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = utilityFor((await params).slug);
  return { title: item?.label || 'Tiện ích' };
}

export default async function UtilityPage({ params }: Props) {
  const item = utilityFor((await params).slug);
  if (!item) notFound();
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tiện ích' }, { label: item.label }]} />
    <main className="tt-utility-page tt-utility-page--placeholder main_fix">
      <div className="tt-utility-page__panel">
        <span className="tt-utility-page__accent" aria-hidden="true" />
        <p className="tt-utility-page__eyebrow">Tiện ích Toàn Trung</p>
        <h1>{item.label}</h1>
        <p>Tiện ích này đang được phát triển. Vui lòng quay lại sau.</p>
        <Link href="/">Về trang chủ</Link>
      </div>
    </main>
  </>;
}
