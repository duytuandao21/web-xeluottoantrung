import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { publicApi, type Faq, type PageResult } from '@/lib/public-api';
import { faqCardsHtml } from '@/lib/faqs';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { return routeMetadata('/cau-hoi', { title: 'Câu hỏi thường gặp', alternates: { canonical: '/cau-hoi' } }); }

export default async function FaqListPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requested = (await searchParams).page;
  const page = requested && /^\d+$/.test(requested) ? Number(requested) : 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) notFound();
  const result = await publicApi<PageResult<Faq>>('/faqs', { page, limit: 12 });
  if (page > Math.max(1, result.meta.totalPages)) notFound();
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Bài viết', href: '/bai-viet' }, { label: 'Câu hỏi thường gặp' }]} />
    <main className="main_content main_fix tt-faq-list">
      <div className="title-main"><h1>Câu hỏi thường gặp</h1></div>
      {result.data.length ? <div dangerouslySetInnerHTML={{ __html: faqCardsHtml(result.data) }} /> : <p className="tt-faq-empty">Các câu hỏi đang được cập nhật.</p>}
      {result.meta.totalPages > 1 && <nav className="car-pagination" aria-label="Phân trang câu hỏi thường gặp">
        {page > 1 && <Link href={`/cau-hoi?page=${page - 1}`} rel="prev">‹ Trước</Link>}
        <span>Trang {page} / {result.meta.totalPages}</span>
        {page < result.meta.totalPages && <Link href={`/cau-hoi?page=${page + 1}`} rel="next">Sau ›</Link>}
      </nav>}
    </main>
  </>;
}
