import type { Metadata } from 'next';
import { routeMetadata } from '@/lib/page-metadata';
import AccessoryListing from '@/components/accessories/AccessoryListing';
import AccessoryFilters, { AccessorySort } from '@/components/accessories/AccessoryFilters';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { allPublicLookups, publicApi, type Accessory, type AccessoryLookup, type PageResult } from '@/lib/public-api';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { return routeMetadata('/phu-kien-o-to', {
  title: 'Phụ kiện ô tô',
  description: 'Danh sách phụ kiện ô tô tại Toàn Trung.',
}); }

type PageProps = { searchParams: Promise<{ page?: string | string[]; brand?: string | string[]; category?: string | string[]; sort?: string | string[]; search?: string | string[] }> };

export default async function AccessoriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const [brands, categories] = await Promise.all([
    allPublicLookups<AccessoryLookup>('/accessory-brands'),
    allPublicLookups<AccessoryLookup>('/accessory-categories'),
  ]);
  const brand = first(params.brand)?.split(',').map(value => value.trim()).find(id => brands.some(item => item.id === id));
  const category = categories.find(item => item.id === first(params.category))?.id;
  const sort = ['price-asc', 'price-desc'].includes(first(params.sort) || '') ? first(params.sort)! : 'newest';
  const search = (first(params.search) || '').trim().slice(0, 120);
  const query = { brandId: brand, categoryId: category, sort, search };
  const result = await publicApi<PageResult<Accessory>>('/accessories', { page: 1, limit: 6, ...query });
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Phụ kiện ô tô' }]} />
    <main className="tt-accessories tt-accessories--listing">
      <div className="main_fix">
        <AccessoryFilters brands={brands} categories={categories} brand={brand} category={category} sort={sort} search={search} />
        <div className="tt-accessories__listing-title">
          <div className="tt-accessories__listing-title-text"><h1>Phụ kiện ô tô</h1><p>Có {result.meta.total} phụ kiện</p></div>
          <AccessorySort brand={brand} category={category} sort={sort} search={search} />
        </div>
        <AccessoryListing key={JSON.stringify(query)} query={query} initialResult={result} />
      </div>
    </main>
  </>;
}
