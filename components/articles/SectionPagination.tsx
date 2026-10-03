'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { useArticleSectionNavigation } from './ArticleSectionMotion';
import { articleHubHref, articlePageLinks, type ArticlePageKey, type ArticlePages } from '@/lib/article-pagination';

export default function SectionPagination({ pages, pageKey, totalPages, label }: { pages: ArticlePages; pageKey: ArticlePageKey; totalPages: number; label: string }) {
  const navigation = useArticleSectionNavigation();
  if (totalPages < 2) return null;
  const current = pages[pageKey];
  const links = articlePageLinks(current, totalPages);
  const pageLink = (page: number, ariaLabel: string, text: string | number, rel?: string) => {
    const href = articleHubHref(pages, pageKey, page);
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (!navigation || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigation.navigate(href);
    };
    return <Link href={href} rel={rel} aria-label={ariaLabel} aria-disabled={navigation?.pending || undefined} onClick={onClick}>{text}</Link>;
  };
  return <nav className="tt-section-pagination" aria-label={`Phân trang ${label}`}>
    {current > 1 ? pageLink(current - 1, `Trang trước của ${label}`, '‹', 'prev') : <span aria-disabled="true">‹</span>}
    {links.map((page, index) => <span className="tt-section-pagination__group" key={page}>
      {index > 0 && page - links[index - 1] > 1 && <span className="tt-section-pagination__ellipsis">…</span>}
      {page === current ? <span className="is-active" aria-current="page">{page}</span> : pageLink(page, `${label}: trang ${page}`, page)}
    </span>)}
    {current < totalPages ? pageLink(current + 1, `Trang sau của ${label}`, '›', 'next') : <span aria-disabled="true">›</span>}
  </nav>;
}
