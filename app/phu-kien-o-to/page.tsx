import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AccessoryCard from '@/components/accessories/AccessoryCard';
import AccessoryFilters, { AccessorySort } from '@/components/accessories/AccessoryFilters';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { allPublicLookups, publicApi, type Accessory, type AccessoryLookup, type PageResult } from '@/lib/public-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Phụ kiện ô tô',
  description: 'Danh sách phụ kiện ô tô tại Toàn Trung.',
};

type PageProps = { searchParams: Promise<{ page?: string | string[]; brand?: string | string[]; category?: string | string[]; sort?: string | string[]; search?: string | string[] }> };

export default async function AccessoriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const rawPage = params.page;
  const requestedPage = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [brands, categories] = await Promise.all([
    allPublicLookups<AccessoryLookup>('/accessory-brands'),
    allPublicLookups<AccessoryLookup>('/accessory-categories'),
  ]);
  const brand = brands.find(item => item.id === first(params.brand))?.id;
  const category = categories.find(item => item.id === first(params.category))?.id;
  const sort = ['price-asc', 'price-desc'].includes(first(params.sort) || '') ? first(params.sort)! : 'newest';
  const search = (first(params.search) || '').trim().slice(0, 120);
  const queryBase = new URLSearchParams();
  if (brand) queryBase.set('brand', brand);
  if (category) queryBase.set('category', category);
  if (sort !== 'newest') queryBase.set('sort', sort);
  if (search) queryBase.set('search', search);
  const pageHref = (number: number) => {
    const query = new URLSearchParams(queryBase);
    if (number > 1) query.set('page', String(number));
    return `/phu-kien-o-to${query.size ? `?${query}` : ''}`;
  };
  const result = await publicApi<PageResult<Accessory>>('/accessories', { page, limit: 12, brandId: brand, categoryId: category, sort, search });
  if (page > 1 && page > result.meta.totalPages) redirect(result.meta.totalPages > 1
    ? pageHref(result.meta.totalPages) : pageHref(1));
  const pages = [...new Set([1, result.meta.totalPages,
    ...Array.from({ length: 5 }, (_, index) => result.meta.page - 2 + index)])]
    .filter(number => number > 0 && number <= result.meta.totalPages).sort((a, b) => a - b);
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Phụ kiện ô tô' }]} />
    <main className="tt-accessories tt-accessories--listing">
      <div className="main_fix">
        <AccessoryFilters brands={brands} categories={categories} brand={brand} category={category} sort={sort} search={search} />
        <div className="tt-accessories__listing-title">
          <div className="tt-accessories__listing-title-text"><h1>Phụ kiện ô tô</h1><p>Có {result.meta.total} phụ kiện</p></div>
          <AccessorySort brand={brand} category={category} sort={sort} search={search} />
        </div>
        {result.data.length ? <div className="tt-accessories__grid">{result.data.map(item => <AccessoryCard item={item} key={item.id} />)}</div>
          : <p className="tt-accessories__empty">{search || brand || category ? 'Không tìm thấy phụ kiện phù hợp.' : 'Phụ kiện đang được cập nhật.'}</p>}
        {result.meta.totalPages > 1 && <nav className="pagination-home car-pagination" aria-label="Phân trang danh sách phụ kiện">
          {result.meta.page > 1 ? <Link href={pageHref(result.meta.page - 1)} rel="prev">‹ Trước</Link>
            : <span aria-disabled="true">‹ Trước</span>}
          {pages.map((number, index) => <Fragment key={number}>
            {index > 0 && number - pages[index - 1] > 1 && <span className="car-pagination__ellipsis" aria-hidden="true">…</span>}
            <Link href={pageHref(number)} className={number === result.meta.page ? 'active' : undefined}
              aria-label={`Trang ${number}`} aria-current={number === result.meta.page ? 'page' : undefined}>{number}</Link>
          </Fragment>)}
          {result.meta.page < result.meta.totalPages ? <Link href={pageHref(result.meta.page + 1)} rel="next">Sau ›</Link>
            : <span aria-disabled="true">Sau ›</span>}
        </nav>}
      </div>
    </main>
  </>;
}
