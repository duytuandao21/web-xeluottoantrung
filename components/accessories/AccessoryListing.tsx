'use client';

import { useEffect, useRef, useState } from 'react';
import type { Accessory, PageResult } from '@/lib/public-api';
import { getPublic } from '@/lib/public-client';
import AccessoryCard from './AccessoryCard';

type Result = PageResult<Accessory>;
type Query = { brandId?: string; categoryId?: string; sort: string; search: string };

export default function AccessoryListing({ query, initialResult }: { query: Query; initialResult: Result }) {
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; pending.current = false; }, []);

  async function loadMore() {
    if (pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
      params.set('page', String(result.meta.page + 1));
      params.set('limit', '6');
      const next = await getPublic<Result>(`/accessories?${params}`, { signal: controller.signal, cache: 'no-store' });
      if (controller.signal.aborted || request.current !== controller) return;
      setResult(current => {
        const seen = new Set(current.data.map(item => item.id));
        const data = [...current.data];
        for (const item of next.data) if (!seen.has(item.id)) { seen.add(item.id); data.push(item); }
        return { data, meta: next.meta };
      });
    } catch {
      if (!controller.signal.aborted && request.current === controller) setError('Chưa thể tải thêm phụ kiện. Vui lòng thử lại.');
    } finally {
      if (request.current === controller) { request.current = null; pending.current = false; setLoading(false); }
    }
  }

  const hasMore = result.meta.page < result.meta.totalPages;
  return <div className="tt-accessories__results" aria-busy={loading}>
    {result.data.length ? <div className="tt-accessories__grid">{result.data.map(item => <AccessoryCard item={item} key={item.id} />)}</div>
      : <p className="tt-accessories__empty">{query.search || query.brandId || query.categoryId ? 'Không tìm thấy phụ kiện phù hợp.' : 'Phụ kiện đang được cập nhật.'}</p>}
    {(hasMore || error) && <div className="car-load-more tt-accessories__load-more">
      {error && <p className="car-load-more__error" role="alert">{error}</p>}
      <button type="button" className="car-load-more__button" onClick={() => void loadMore()} disabled={loading}>
        {loading ? <><span className="car-load-more__spinner" aria-hidden="true" />Đang tải...</> : error ? 'Thử lại' : 'Xem thêm'}
      </button>
    </div>}
    <span className="car-load-more__status" role="status" aria-live="polite" aria-atomic="true">
      {!loading ? `Đã hiển thị ${result.data.length} trên ${result.meta.total} phụ kiện.` : ''}
    </span>
  </div>;
}
