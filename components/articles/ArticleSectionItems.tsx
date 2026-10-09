import ResponsiveImage from '@/components/common/ResponsiveImage';
import Link from 'next/link';
import type { ReactNode } from 'react';
import ImageMarkup from '@/components/common/ImageMarkup';
import { faqDialogHtml, faqDialogId } from '@/lib/faqs';

export type ArticlePreview = {
  href: string;
  title: string;
  summary: string;
  imageUrl?: string | null;
  faq?: { slug: string; answer: string };
};

export default function ArticleSectionItems({ items, kind }: { items: ArticlePreview[]; kind: 'news' | 'faq' | 'experience' }) {
  if (!items.length) return null;
  const readLabel = kind === 'faq' ? 'Đọc giải đáp' : 'Đọc bài viết';

  function action(item: ArticlePreview, children: ReactNode, className?: string, decorative = false, ariaLabel?: string) {
    const props = { className, tabIndex: decorative ? -1 : undefined, 'aria-hidden': decorative || undefined, 'aria-label': ariaLabel };
    if (kind === 'faq' && item.faq) {
      const id = faqDialogId(item.faq.slug);
      return <button {...props} type="button" className={`tt-faq-trigger ${className || ''}`} data-src={`#${id}`} aria-haspopup="dialog" aria-controls={id}>{children}</button>;
    }
    return <Link {...props} href={item.href}>{children}</Link>;
  }

  function preview(item: ArticlePreview, lead = false) {
    const hasImage = !!item.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(item.imageUrl);
    return <article key={item.href} className={`tt-article-preview${lead ? ' is-lead' : ''}${hasImage ? '' : ' is-text-only'}`}>
      {hasImage ? action(item, <>
        <ResponsiveImage profile="card" sizes="(max-width:960px) calc(100vw - 32px), 640px" src={item.imageUrl!} alt="" loading="lazy" decoding="async" />
      </>, 'tt-article-preview__image', true) : <span className="tt-article-preview__symbol" aria-hidden="true">
        {kind === 'faq' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z" /><path d="M8.8 8a3 3 0 0 1 5.8 1c0 2-3 2-3 4" /><path d="M11.6 16h.01" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>}
      </span>}
      <div className="tt-article-preview__content">
        <h3>{action(item, item.title)}</h3>
        {item.summary && <p>{item.summary}</p>}
        {action(item, <>{readLabel}<span aria-hidden="true">→</span></>, 'tt-article-preview__read', false, `${readLabel}: ${item.title}`)}
      </div>
      {kind === 'faq' && item.faq && <ImageMarkup html={faqDialogHtml({ ...item.faq, question: item.title })} />}
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
