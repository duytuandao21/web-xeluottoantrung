import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { load } from 'cheerio';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import SectionPagination from '@/components/articles/SectionPagination';
import ArticleSectionItems from '@/components/articles/ArticleSectionItems';
import ArticleSectionMotion from '@/components/articles/ArticleSectionMotion';
import { publicApi, type Article, type Faq, type PageResult } from '@/lib/public-api';
import { routeMetadata } from '@/lib/page-metadata';
import { faqSummary } from '@/lib/faqs';
import { experienceSummary } from '@/lib/driving-experiences';
import { safeHtml } from '@/lib/safe-html';
import { ARTICLE_PAGE_KEYS, articlePageNumber, articleHubHref, type ArticlePages } from '@/lib/article-pagination';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 4;

export async function generateMetadata(): Promise<Metadata> {
  return routeMetadata('/bai-viet', { title: 'Bài viết', description: 'Tin tức, kinh nghiệm sử dụng xe ô tô và giải đáp câu hỏi thường gặp tại Toàn Trung.' });
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const pages: ArticlePages = { 'tin-tuc-page': articlePageNumber(query['tin-tuc-page']), 'cau-hoi-page': articlePageNumber(query['cau-hoi-page']), 'kinh-nghiem-page': articlePageNumber(query['kinh-nghiem-page']) };
  const [news, faqs, experiences] = await Promise.all([
    publicApi<PageResult<Article>>('/articles', { page: pages['tin-tuc-page'], limit: PAGE_SIZE }),
    publicApi<PageResult<Faq>>('/faqs', { page: pages['cau-hoi-page'], limit: PAGE_SIZE }),
    publicApi<PageResult<Article>>('/driving-experiences', { page: pages['kinh-nghiem-page'], limit: PAGE_SIZE }),
  ]);
  const totals: ArticlePages = { 'tin-tuc-page': Math.max(1, news.meta.totalPages), 'cau-hoi-page': Math.max(1, faqs.meta.totalPages), 'kinh-nghiem-page': Math.max(1, experiences.meta.totalPages) };
  const corrected = ARTICLE_PAGE_KEYS.find(key => pages[key] > totals[key]);
  if (corrected) {
    const clampedPages = { ...pages };
    for (const key of ARTICLE_PAGE_KEYS) clampedPages[key] = Math.min(pages[key], totals[key]);
    redirect(articleHubHref(clampedPages, corrected, totals[corrected]));
  }
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Bài viết' }]} />
    <main className="main_content main_fix tt-article-hub" aria-label="Bài viết">
      <ArticleSectionMotion id="muc-tin-tuc" titleId="news-section-title" title="Tin tức" page={pages['tin-tuc-page']}
        pagination={<SectionPagination key="news-pagination" pages={pages} pageKey="tin-tuc-page" totalPages={news.meta.totalPages} label="Tin tức" />}>
        {news.data.length ? <ArticleSectionItems kind="news" items={news.data.map(article => ({
          href: `/${article.slug}`, title: article.title, imageUrl: article.imageUrl,
          summary: article.excerpt || load(safeHtml(article.content || ''), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 180),
        }))} /> : <p className="tt-faq-empty">Tin tức đang được cập nhật.</p>}
      </ArticleSectionMotion>
      <ArticleSectionMotion id="muc-cau-hoi" titleId="faq-section-title" title="Câu hỏi thường gặp" page={pages['cau-hoi-page']}
        pagination={<SectionPagination key="faq-pagination" pages={pages} pageKey="cau-hoi-page" totalPages={faqs.meta.totalPages} label="Câu hỏi thường gặp" />}>
        {faqs.data.length ? <ArticleSectionItems kind="faq" items={faqs.data.map(faq => ({
          href: `/cau-hoi/${faq.slug}`, title: faq.question, imageUrl: faq.imageUrl, summary: faqSummary(faq),
          faq: { slug: faq.slug, answer: faq.answer },
        }))} /> : <p className="tt-faq-empty">Các câu hỏi đang được cập nhật.</p>}
      </ArticleSectionMotion>
      <ArticleSectionMotion id="muc-kinh-nghiem" titleId="experience-section-title" title="Kinh nghiệm sử dụng xe ô tô" page={pages['kinh-nghiem-page']}
        pagination={<SectionPagination key="experience-pagination" pages={pages} pageKey="kinh-nghiem-page" totalPages={experiences.meta.totalPages} label="Kinh nghiệm sử dụng xe ô tô" />}>
        {experiences.data.length ? <ArticleSectionItems kind="experience" items={experiences.data.map(article => ({
          href: `/kinh-nghiem-su-dung-xe/${article.slug}`, title: article.title, imageUrl: article.imageUrl,
          summary: experienceSummary(article),
        }))} /> : <p className="tt-faq-empty">Các bài viết kinh nghiệm sử dụng xe đang được cập nhật.</p>}
      </ArticleSectionMotion>
    </main>
  </>;
}
