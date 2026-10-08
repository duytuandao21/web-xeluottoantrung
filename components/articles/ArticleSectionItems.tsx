import ResponsiveImage from '@/components/common/ResponsiveImage';
import Link from 'next/link';

export type ArticlePreview = {
  href: string;
  title: string;
  summary: string;
  imageUrl?: string | null;
};

export default function ArticleSectionItems({ items, kind }: { items: ArticlePreview[]; kind: 'news' | 'faq' | 'experience' }) {
  if (!items.length) return null;
  const readLabel = kind === 'faq' ? 'Đọc giải đáp' : 'Đọc bài viết';

  function preview(item: ArticlePreview, lead = false) {
    const hasImage = !!item.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(item.imageUrl);
    return <article key={item.href} className={`tt-article-preview${lead ? ' is-lead' : ''}${hasImage ? '' : ' is-text-only'}`}>
      {hasImage ? <Link href={item.href} className="tt-article-preview__image" tabIndex={-1} aria-hidden="true">
        <ResponsiveImage profile="card" sizes="(max-width:960px) calc(100vw - 32px), 640px" src={item.imageUrl!} alt="" loading="lazy" decoding="async" />
      </Link> : <span className="tt-article-preview__symbol" aria-hidden="true">
        {kind === 'faq' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /><path d="M8.8 8a3 3 0 0 1 5.8 1c0 2-3 2-3 4" /><path d="M11.6 16h.01" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>}
      </span>}
      <div className="tt-article-preview__content">
        <h3><Link href={item.href}>{item.title}</Link></h3>
        {item.summary && <p>{item.summary}</p>}
        <Link className="tt-article-preview__read" href={item.href} aria-label={`${readLabel}: ${item.title}`}>{readLabel}<span aria-hidden="true">→</span></Link>
      </div>
    </article>;
  }

  if (kind === 'experience') {
    return <div className="tt-article-layout is-experiences">{items.map(item => preview(item))}</div>;
  }

  if (kind === 'faq' && items.every(item => !item.imageUrl || !/^(https?:\/\/|\/(?!\/))/i.test(item.imageUrl))) {
    return <div className="tt-article-layout is-questions">{items.map(item => preview(item))}</div>;
  }

  return <div className={`tt-article-layout${items.length === 1 ? ' is-single' : ''}`}>
    {preview(items[0], true)}
    {items.length > 1 && <div className="tt-article-layout__list">{items.slice(1).map(item => preview(item))}</div>}
  </div>;
}
