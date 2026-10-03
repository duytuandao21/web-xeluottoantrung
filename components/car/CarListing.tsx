'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CarCard from './CarCard';
import { carToCard } from '@/lib/car-view';
import { getPublic } from '@/lib/public-client';
import type { PageResult, PublicCar } from '@/lib/public-api';
import { useSaleAccess } from '@/components/sale/SaleAccess';

type Result = PageResult<PublicCar>;
type SearchCars = (query: URLSearchParams, signal: AbortSignal) => Promise<Result>;
type Query = Record<string, string | number | undefined>;

export default function CarListing({ query, initialResult }: { query: Query; initialResult: Result }) {
  const sale = useSaleAccess();
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key !== 'page' && key !== 'limit' && value !== undefined && value !== '') params.set(key, String(value));
    }
    return params.toString();
  }, [query]);
  const saleSearch = Boolean(sale?.authorized && query.search?.toString().trim());

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('#keyword');
    if (!input) return;
    const original = input.placeholder;
    if (sale?.authorized) input.placeholder = 'Tìm kiếm theo hãng xe, dòng xe hoặc biển số xe...';
    return () => { input.placeholder = original; };
  }, [sale?.authorized, queryString]);

  return <CarListingResults key={`${queryString}:${saleSearch ? 'sale' : 'public'}`}
    query={queryString} initialResult={saleSearch ? undefined : initialResult}
    searchCars={saleSearch ? sale?.searchCars : undefined} />;
}

function CarListingResults({ query, initialResult, searchCars }: { query: string; initialResult?: Result; searchCars?: SearchCars }) {
  const [state, setState] = useState<{ result?: Result; loading: boolean; error: string }>({
    result: initialResult, loading: !initialResult, error: '',
  });
  const requestRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const loadPage = useCallback(async (page: number, append: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const params = new URLSearchParams(query);
      params.set('page', String(page));
      params.set('limit', '6');
      const next = searchCars ? await searchCars(params, controller.signal)
        : await getPublic<Result>(`/cars?${params}`, { signal: controller.signal, cache: 'no-store' });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setState(current => {
        const existing = append ? current.result?.data || [] : [];
        const seen = new Set(existing.map(car => car.slug));
        const data = [...existing];
        for (const car of next.data) if (!seen.has(car.slug)) { seen.add(car.slug); data.push(car); }
        return { result: { data, meta: next.meta }, loading: false, error: '' };
      });
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) setState(current => ({
        ...current, loading: false, error: 'Chưa thể tải danh sách xe. Vui lòng thử lại.',
      }));
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; pendingRef.current = false; }
    }
  }, [query, searchCars]);

  useEffect(() => {
    if (!initialResult) void loadPage(1, false);
    return () => { requestRef.current?.abort(); requestRef.current = null; pendingRef.current = false; };
  }, [initialResult, loadPage]);

  const result = state.result;
  const total = result?.meta.total;
  useEffect(() => {
    if (total === undefined) return;
    const count = document.querySelector<HTMLElement>('.td_dem span');
    if (!count) return;
    const previous = count.textContent;
    count.textContent = String(total);
    return () => { count.textContent = previous; };
  }, [total]);

  const hasMore = Boolean(result && result.meta.page < result.meta.totalPages);
  return <div className="wap_item vehicle-results" aria-busy={state.loading}>
    {result?.data.map(car => <CarCard key={car.slug} car={carToCard(car)} />)}
    {!result && state.loading && <p className="vehicle-results__message" role="status">Đang tìm xe...</p>}
    {result && !result.data.length && <p className="vehicle-results__message" role="status">Chưa có xe phù hợp</p>}
    {(hasMore || state.error) && <div className="car-load-more">
      {state.error && <p className="car-load-more__error" role="alert">{state.error}</p>}
      <button type="button" className="car-load-more__button" disabled={state.loading}
        onClick={() => void loadPage((result?.meta.page || 0) + 1, Boolean(result))}>
        {state.loading ? <><span className="car-load-more__spinner" aria-hidden="true" />Đang tải...</> : state.error ? 'Thử lại' : 'Xem thêm'}
      </button>
    </div>}
    <span className="car-load-more__status" role="status" aria-live="polite" aria-atomic="true">
      {result && !state.loading ? `Đã hiển thị ${result.data.length} trên ${result.meta.total} xe.` : ''}
    </span>
  </div>;
}
