import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import SearchResults from '@/components/search/SearchResults';
import { publicApi } from '@/lib/public-api';
import type { SearchResults as Results } from '@/lib/product-search';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Kết quả tìm kiếm', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ keyword?: string | string[] }> }) {
  const params = await searchParams;
  const query = (Array.isArray(params.keyword) ? params.keyword[0] : params.keyword || '').trim().slice(0, 120);
  let failure = false;
  const result = query ? await publicApi<Results>('/search', { q: query, page: 1, limit: 12 }).catch(() => { failure = true; return null; }) : null;
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tìm kiếm' }]} />
    <main className="main_fix tt-search-page">
      <h1>Kết quả tìm kiếm</h1>
      <form className="tt-search-page__form" action="/tim-kiem" role="search" data-skip-legacy-submit>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        <input type="search" name="keyword" data-product-search defaultValue={query} placeholder="Tìm kiếm tên xe hoặc phụ kiện ô tô..." aria-label="Tìm kiếm sản phẩm" maxLength={120} />
        <button type="submit">Tìm kiếm</button>
      </form>
      {failure ? <p className="tt-search-results__empty" role="alert">Chưa thể tải kết quả. Vui lòng thử tìm kiếm lại.</p>
        : <SearchResults key={query} query={query} initialResult={result || { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } }} />}
    </main>
  </>;
}
