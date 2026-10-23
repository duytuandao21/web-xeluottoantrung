import ImageMarkup from '@/components/common/ImageMarkup';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { getDrivingExperience, experienceSummary } from '@/lib/driving-experiences';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';
const SECTION_LABEL = 'Kinh nghiệm sử dụng xe ô tô';
const SECTION_HREF = '/bai-viet#muc-kinh-nghiem';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = await getDrivingExperience((await params).slug);
  if (!article) return { title: 'Không tìm thấy bài viết', robots: { index: false } };
  return routeMetadata(`/kinh-nghiem-su-dung-xe/${article.slug}`, { title: article.title, description: experienceSummary(article), alternates: { canonical: `/kinh-nghiem-su-dung-xe/${article.slug}` },
    openGraph: article.imageUrl ? { images: [article.imageUrl] } : undefined });
}

export default async function DrivingExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getDrivingExperience((await params).slug);
  if (!article) notFound();
  const $ = load(safeHtml(article.content || ''), {}, false);
  $('p').filter((_, element) => $(element).text().trim().length > 30).first().addClass('tt-article__lead');
  $('img').attr({ loading: 'lazy', decoding: 'async' });
  const date = article.publishedAt ? new Date(article.publishedAt) : null;
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Bài viết', href: '/bai-viet' }, { label: SECTION_LABEL, href: SECTION_HREF }, { label: article.title }]} />
    <main className="main_content main_fix tt-article" role="article" aria-labelledby="experience-title">
      <div className="tt-article__meta"><Link href={SECTION_HREF}>{SECTION_LABEL}</Link>
        {date && !Number.isNaN(date.getTime()) && <><span aria-hidden="true">·</span><time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)}</time></>}
      </div>
      <div className="title-main"><h1 id="experience-title">{article.title}</h1></div>
      {article.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(article.imageUrl) && !$('img[src]').toArray().some(element => $(element).attr('src') === article.imageUrl) &&
        <figure className="tt-article__hero"><ResponsiveImage profile="content" src={article.imageUrl} alt={article.title} decoding="async" /></figure>}
      <div className="tt-article__body" ><ImageMarkup html={$.html()} /></div>
    </main>
  </>;
}
