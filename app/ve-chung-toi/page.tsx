import type { Metadata } from 'next';
import { cache } from 'react';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { publicApi } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';

type Introduction = { key: string; title: string; body?: string | null; imageUrl?: string | null };

const introductions = cache(async () => {
  return publicApi<Introduction[]>('/content', { group: 'quan-ly-gioi-thieu' });
});

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

export async function generateMetadata(): Promise<Metadata> {
  const [first] = await introductions();
  const summary = first?.body ? load(safeHtml(first.body), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return {
    title: first?.title || 'Về chúng tôi',
    description: summary || 'Tìm hiểu về Auto Toàn Trung.',
    openGraph: first?.imageUrl ? { images: [first.imageUrl] } : undefined,
  };
}

export default async function AboutPage() {
  const entries = await introductions();
  const [first, ...rest] = entries;
  const firstBody = first ? articleBody(first.body || '') : '';
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Về chúng tôi' }]} />
    <main className="main_content main_fix tt-article tt-about" role="article" aria-labelledby="tt-about-title">
      <div className="title-main"><h1 id="tt-about-title">{first?.title || 'Về chúng tôi'}</h1></div>
      {first ? <>
        {first.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(first.imageUrl) && !firstBody.includes(first.imageUrl) &&
          <figure className="tt-article__hero"><img src={first.imageUrl} alt={first.title} decoding="async" /></figure>}
        <div className="tt-article__body" dangerouslySetInnerHTML={{ __html: firstBody }} />
        {rest.map(entry => {
          const body = articleBody(entry.body || '');
          return <section className="tt-about__section" key={entry.key} aria-labelledby={`about-${entry.key}`}>
            <h2 id={`about-${entry.key}`}>{entry.title}</h2>
            {entry.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(entry.imageUrl) && !body.includes(entry.imageUrl) &&
              <figure className="tt-article__hero"><img src={entry.imageUrl} alt={entry.title} loading="lazy" decoding="async" /></figure>}
            <div className="tt-article__body" dangerouslySetInnerHTML={{ __html: body }} />
          </section>;
        })}
      </> : <p className="tt-about__empty">Nội dung giới thiệu đang được cập nhật.</p>}
    </main>
  </>;
}
