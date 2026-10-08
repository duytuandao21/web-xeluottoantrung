import ImageMarkup from '@/components/common/ImageMarkup';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { getFaq, faqSummary } from '@/lib/faqs';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const faq = await getFaq((await params).slug);
  if (!faq) return { title: 'Không tìm thấy câu hỏi', robots: { index: false } };
  return routeMetadata(`/cau-hoi/${faq.slug}`, { title: faq.question, description: faqSummary(faq), alternates: { canonical: `/cau-hoi/${faq.slug}` },
    openGraph: faq.imageUrl ? { images: [faq.imageUrl] } : undefined });
}

export default async function FaqArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const faq = await getFaq((await params).slug);
  if (!faq) notFound();
  const $ = load(safeHtml(faq.answer), {}, false);
  $('p').filter((_, element) => $(element).text().trim().length > 30).first().addClass('tt-article__lead');
  $('img').attr({ loading: 'lazy', decoding: 'async' });
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Bài viết', href: '/bai-viet' }, { label: 'Câu hỏi thường gặp', href: '/bai-viet#muc-cau-hoi' }, { label: faq.question }]} />
    <main className="main_content main_fix tt-article" role="article" aria-labelledby="faq-title">
      <div className="tt-article__meta"><Link href="/bai-viet#muc-cau-hoi">Câu hỏi thường gặp</Link></div>
      <div className="title-main"><h1 id="faq-title">{faq.question}</h1></div>
      {faq.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(faq.imageUrl) && !$('img[src]').toArray().some(element => $(element).attr('src') === faq.imageUrl) &&
        <figure className="tt-article__hero"><ResponsiveImage profile="content" src={faq.imageUrl} alt={faq.question} decoding="async" /></figure>}
      <div className="tt-article__body" ><ImageMarkup html={$.html()} /></div>
    </main>
  </>;
}
