import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { cache } from 'react';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { optionalPublicApi, type Service } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const getService = cache(async (slug: string) => (slugPattern.test(slug) || uuidPattern.test(slug)) && slug.length <= 240
  ? optionalPublicApi<Service>(`/services/${slug}`) : null);

function articleBody(content: string) {
  const $ = load(safeHtml(content), {}, false);
  $('p').each((_, element) => {
    const paragraph = $(element);
    const children = paragraph.children();
    const label = paragraph.text().trim();
    if (children.length === 1 && children.first().is('strong,b') && label === children.first().text().trim() && label.length < 100)
      paragraph.replaceWith($('<h2></h2>').text(label));
  });
  $('p').filter((_, element) => $(element).text().trim().length > 30).first().addClass('tt-article__lead');
  $('img').attr({ loading: 'lazy', decoding: 'async' });
  return $.html();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const service = await getService((await params).slug);
  if (!service) return { title: 'Không tìm thấy dịch vụ', robots: { index: false } };
  const summary = load(safeHtml(service.description), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title: service.title,
    description: summary,
    alternates: { canonical: `/dich-vu/${service.slug}` },
    openGraph: service.imageUrl ? { images: [service.imageUrl] } : undefined,
  };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getService(slug);
  if (!service) notFound();
  if (uuidPattern.test(slug)) permanentRedirect(`/dich-vu/${service.slug}`);
  const body = articleBody(service.description);
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Dịch vụ', href: '/dich-vu' }, { label: service.title }]} />
    <main className="main_content main_fix tt-article tt-service-article" role="article" aria-labelledby="service-title">
      <div className="tt-article__meta"><Link href="/dich-vu">Dịch vụ</Link></div>
      <div className="title-main"><h1 id="service-title">{service.title}</h1></div>
      {service.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(service.imageUrl) && !body.includes(service.imageUrl) &&
        <figure className="tt-article__hero"><img src={service.imageUrl} alt={service.title} decoding="async" /></figure>}
      <div className="tt-article__body" dangerouslySetInnerHTML={{ __html: body }} />
    </main>
  </>;
}
