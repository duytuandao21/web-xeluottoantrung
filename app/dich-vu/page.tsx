import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { allPublicLookups, type Service } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { return routeMetadata('/dich-vu', {
  title: 'Dịch vụ',
  description: 'Tìm hiểu các dịch vụ của Auto Toàn Trung.',
}); }

function excerpt(html: string) {
  const text = load(safeHtml(html), {}, false).text().replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text;
}

export default async function ServicesPage() {
  const services = await allPublicLookups<Service>('/services');
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Dịch vụ' }]} />
    <main className="main_content main_fix tt-service-list" aria-labelledby="services-title">
      <div className="title-main"><h1 id="services-title">Dịch vụ</h1></div>
      {services.length ? <div className="tt-service-list__grid">
        {services.map(service => <article className="tt-service-card" key={service.id}>
          <Link href={`/dich-vu/${service.slug}`} className="tt-service-card__link" aria-label={`Xem dịch vụ ${service.title}`}>
            <div className="tt-service-card__media">
              {service.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(service.imageUrl)
                ? <img src={service.imageUrl} alt="" loading="lazy" decoding="async" />
                : <span aria-hidden="true">TT</span>}
            </div>
            <div className="tt-service-card__content"><h2>{service.title}</h2><p>{excerpt(service.description)}</p><span className="tt-service-card__more">Tìm hiểu thêm <span aria-hidden="true">→</span></span></div>
          </Link>
        </article>)}
      </div> : <p className="tt-service-list__empty">Thông tin dịch vụ đang được cập nhật.</p>}
    </main>
  </>;
}
