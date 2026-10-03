import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import Link from 'next/link';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { optionalPublicApi, type Recruitment } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';
const getRecruitment = cache(async (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240
  ? optionalPublicApi<Recruitment>(`/recruitments/${slug}`) : null);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const job = await getRecruitment((await params).slug);
  if (!job) return { title: 'Không tìm thấy bài tuyển dụng', robots: { index: false } };
  return routeMetadata(`/tuyen-dung/${job.slug}`, { title: job.title, description: job.excerpt || load(safeHtml(job.description), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 160),
    alternates: { canonical: `/tuyen-dung/${job.slug}` }, openGraph: job.imageUrl ? { images: [job.imageUrl] } : undefined });
}

export default async function RecruitmentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getRecruitment(slug);
  if (!job) notFound();
  if (slug !== job.slug) permanentRedirect(`/tuyen-dung/${job.slug}`);
  const $ = load(safeHtml(job.description), {}, false);
  $('p').filter((_, element) => $(element).text().trim().length > 30).first().addClass('tt-article__lead');
  $('img').attr({ loading: 'lazy', decoding: 'async' });
  const date = job.createdAt ? new Date(job.createdAt) : null;
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tuyển dụng', href: '/tuyen-dung' }, { label: job.title }]} />
    <main className="main_content main_fix tt-article" role="article" aria-labelledby="recruitment-title">
      <div className="tt-article__meta"><Link href="/tuyen-dung">Tuyển dụng</Link>{date && !Number.isNaN(date.getTime()) && <><span aria-hidden="true">·</span><time dateTime={date.toISOString()}>{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)}</time></>}</div>
      <div className="title-main"><h1 id="recruitment-title">{job.title}</h1></div>
      {job.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(job.imageUrl) && !$('img[src]').toArray().some(element => $(element).attr('src') === job.imageUrl) &&
        <figure className="tt-article__hero"><img src={job.imageUrl} alt={job.title} decoding="async" /></figure>}
      <div className="tt-article__body" dangerouslySetInnerHTML={{ __html: $.html() }} />
    </main>
  </>;
}
