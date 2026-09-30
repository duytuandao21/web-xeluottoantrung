'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AccessoryLookup } from '@/lib/public-api';

type Props = { brands: AccessoryLookup[]; categories: AccessoryLookup[]; brand?: string; category?: string; sort: string; search: string };

export default function AccessoryFilters({ brands, categories, brand, category, sort, search }: Props) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const categoryTrack = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState(search);
  useEffect(() => { setKeyword(search); }, [search]);
  useEffect(() => {
    const row = categoryTrack.current;
    if (!row) return;
    if (!category) { row.scrollTo({ left: 0, behavior: 'instant' }); return; }
    const selected = row.querySelector<HTMLElement>('.is-selected');
    if (selected) row.scrollTo({
      left: row.scrollLeft + selected.getBoundingClientRect().left - row.getBoundingClientRect().left - 8,
      behavior: 'instant',
    });
  }, [category]);
  const href = (nextBrand?: string, nextCategory?: string, nextSort = sort, nextSearch = search) => {
    const query = new URLSearchParams();
    if (nextBrand) query.set('brand', nextBrand);
    if (nextCategory) query.set('category', nextCategory);
    if (nextSort !== 'newest') query.set('sort', nextSort);
    if (nextSearch.trim()) query.set('search', nextSearch.trim());
    return `/phu-kien-o-to${query.size ? `?${query}` : ''}`;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(href(brand, category, sort, keyword));
  };
  return <div className="tt-accessory-filters" aria-label="Lọc phụ kiện ô tô">
    <div className="tt-accessory-filters__search-row">
      <form className="tt-accessory-filters__search" role="search" data-skip-legacy-submit onSubmit={submit}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
        <input aria-label="Tìm phụ kiện" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm kiếm theo tên hoặc thương hiệu phụ kiện..." maxLength={120} />
        <button type="submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><span>Tìm kiếm</span></button>
      </form>
      <Link href="/phu-kien-o-to" className="tt-accessory-filters__reset" onClick={() => { setKeyword(''); categoryTrack.current?.scrollTo({ left: 0, behavior: 'instant' }); }} aria-label="Làm mới: xóa tìm kiếm và bộ lọc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg><span>Làm mới</span>
      </Link>
    </div>
    <div className="tt-accessory-filters__brands">
      <button type="button" className="tt-accessory-filters__arrow" aria-label="Xem thương hiệu phía trước" onClick={() => track.current?.scrollBy({ left: -360, behavior: 'smooth' })}>‹</button>
      <div className="tt-accessory-filters__brand-track" ref={track}>
        {brands.map(item => <Link key={item.id} href={href(brand === item.id ? undefined : item.id, category)} className={`tt-accessory-filters__brand ${brand === item.id ? 'is-selected' : ''}`} aria-current={brand === item.id ? 'true' : undefined}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="tt-accessory-filters__brand-fallback" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>}
          <span>{item.name}</span>
        </Link>)}
      </div>
      <button type="button" className="tt-accessory-filters__arrow" aria-label="Xem thương hiệu phía sau" onClick={() => track.current?.scrollBy({ left: 360, behavior: 'smooth' })}>›</button>
    </div>
    <div className="tt-accessory-filters__categories" aria-label="Danh mục phụ kiện" ref={categoryTrack}>
        <Link href={href(brand)} className={!category ? 'is-selected' : ''} aria-current={!category ? 'true' : undefined}>Tất cả</Link>
        {categories.map(item => <Link key={item.id} href={href(brand, item.id)} className={category === item.id ? 'is-selected' : ''} aria-current={category === item.id ? 'true' : undefined}>{item.name}</Link>)}
    </div>
  </div>;
}

export function AccessorySort({ brand, category, sort, search }: Pick<Props, 'brand' | 'category' | 'sort' | 'search'>) {
  const router = useRouter();
  const changeSort = (value: string) => {
    const query = new URLSearchParams();
    if (brand) query.set('brand', brand);
    if (category) query.set('category', category);
    if (value !== 'newest') query.set('sort', value);
    if (search) query.set('search', search);
    router.push(`/phu-kien-o-to${query.size ? `?${query}` : ''}`);
  };
  return <label className="car-sort tt-accessory-filters__sort">Sắp xếp
    <select aria-label="Sắp xếp phụ kiện" value={sort} onChange={event => changeSort(event.target.value)}>
      <option value="newest">Mới nhất</option>
      <option value="price-asc">Giá từ thấp đến cao</option>
      <option value="price-desc">Giá từ cao đến thấp</option>
    </select>
  </label>;
}
