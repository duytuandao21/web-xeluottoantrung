"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import CarCard from '@/components/car/CarCard';
import { carToCard } from '@/lib/car-view';
import type { PageResult, PublicCar } from '@/lib/public-api';
import { useSaleAccess } from './SaleAccess';

type SearchState = { key: string; result?: PageResult<PublicCar>; error?: string };

export default function SaleSearchResults({ query, children }: {
  query: Record<string, string | number | undefined>;
  children: ReactNode;
}) {
  const sale = useSaleAccess();
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return params.toString();
  }, [query]);
  const active = Boolean(sale?.authorized && query.search?.toString().trim());
  const searchCars = sale?.searchCars;
  const [state, setState] = useState<SearchState | null>(null);

  useEffect(() => {
    if (!active || !searchCars) return;
    const controller = new AbortController();
    setState(null);
    searchCars(new URLSearchParams(queryString), controller.signal)
      .then(result => { if (!controller.signal.aborted) setState({ key: queryString, result }); })
      .catch(error => {
        if (!controller.signal.aborted) setState({ key: queryString, error: error instanceof Error ? error.message : 'Không thể tìm xe.' });
      });
    return () => controller.abort();
  }, [active, queryString, searchCars]);

  const current = active && state?.key === queryString ? state : null;
  const result = current?.result;
  useEffect(() => {
    if (!result) return;
    const count = document.querySelector<HTMLElement>('.td_dem span');
    if (!count) return;
    const previous = count.textContent;
    count.textContent = String(result.meta.total);
    return () => { count.textContent = previous; };
  }, [result]);

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('#keyword');
    if (!input) return;
    const original = input.placeholder;
    if (sale?.authorized) input.placeholder = 'Tìm kiếm theo hãng xe, dòng xe hoặc biển số xe...';
    return () => { input.placeholder = original; };
  }, [sale?.authorized, queryString]);

  const pageHref = (page: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set('page', String(page));
    return `${window.location.pathname}?${params}`;
  };
  const pages = result ? [...new Set([1, result.meta.totalPages,
    ...Array.from({ length: 5 }, (_, index) => result.meta.page - 2 + index)])]
    .filter(page => page > 0 && page <= result.meta.totalPages).sort((a, b) => a - b) : [];

  return <div className="wap_item" data-sale-search-active={active ? 'true' : undefined} aria-busy={active && !current}>
    {!active ? children : current?.error
      ? <div className="alert alert-warning" role="alert">{current.error}</div>
      : !result
        ? <div className="alert alert-info" role="status">Đang tìm xe...</div>
        : result.data.length
          ? result.data.map(car => <CarCard key={car.slug} car={carToCard(car)} />)
          : <div className="alert alert-warning" role="status">Chưa có xe phù hợp</div>}
    {result && result.meta.totalPages > 1 && <nav className="pagination-home car-pagination" aria-label="Phân trang danh sách xe">
      {result.meta.page > 1 ? <a href={pageHref(result.meta.page - 1)}>‹ Trước</a> : <span aria-disabled="true">‹ Trước</span>}
      {pages.map((page, index) => <Fragment key={page}>
        {index > 0 && page - pages[index - 1] > 1 && <span className="car-pagination__ellipsis" aria-hidden="true">…</span>}
        <a href={pageHref(page)} className={page === result.meta.page ? 'active' : undefined}
          aria-label={`Trang ${page}`} aria-current={page === result.meta.page ? 'page' : undefined}>{page}</a>
      </Fragment>)}
      {result.meta.page < result.meta.totalPages ? <a href={pageHref(result.meta.page + 1)}>Sau ›</a> : <span aria-disabled="true">Sau ›</span>}
    </nav>}
  </div>;
}
