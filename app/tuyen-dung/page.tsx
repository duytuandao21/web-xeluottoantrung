import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { allPublicLookups, type Recruitment } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { return routeMetadata('/tuyen-dung', { title: 'Tuyển dụng', description: 'Thông tin tuyển dụng tại Toàn Trung.' }); }

export default async function RecruitmentsPage() {
  const jobs = await allPublicLookups<Recruitment>('/recruitments');
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tuyển dụng' }]} />
    <main className="main_content main_fix tt-service-list tt-recruitment-list" aria-labelledby="recruitments-title">
      <div className="title-main"><h1 id="recruitments-title">Tuyển dụng</h1></div>
      {jobs.length ? <div className="tt-service-list__grid">{jobs.map(job => {
        const summary = job.excerpt || load(safeHtml(job.description), {}, false).text().replace(/\s+/g, ' ').trim();
        return <article className="tt-service-card" key={job.id}>
          <Link className="tt-service-card__link" href={`/tuyen-dung/${job.slug}`}>
            <div className="tt-service-card__media">{job.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(job.imageUrl)
              ? <ResponsiveImage profile="card" src={job.imageUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">TT</span>}</div>
            <div className="tt-service-card__content"><h2>{job.title}</h2><p>{summary.length > 180 ? `${summary.slice(0, 180).trimEnd()}…` : summary}</p><span className="tt-service-card__more">Đọc bài viết <span aria-hidden="true">→</span></span></div>
          </Link>
        </article>;
      })}</div> : <p className="tt-service-list__empty">Thông tin tuyển dụng đang được cập nhật.</p>}
    </main>
  </>;
}
