'use client';
import ResponsiveImage from '@/components/common/ResponsiveImage';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getPublic } from '@/lib/public-client';
import { searchImage, type SearchResults as Results } from '@/lib/product-search';

export default function SearchResults({ query, initialResult }: { query: string; initialResult: Results }) {
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const loadMore = async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(false);
    try {
      const next = await getPublic<Results>(`/search?${new URLSearchParams({ q: query, page: String(result.meta.page + 1), limit: '12' })}`, { signal: controller.signal, cache: 'no-store' });
      if (!controller.signal.aborted) setResult(current => {
        const seen = new Set(current.data.map(item => `${item.kind}:${item.id}`));
        return { ...next, data: [...current.data, ...next.data.filter(item => !seen.has(`${item.kind}:${item.id}`))] };
      });
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) { request.current = null; setLoading(false); } }
  };
  return <div className="tt-search-results" aria-busy={loading}>
    <p className="tt-search-results__count" role="status">{query ? `Có ${result.meta.total} sản phẩm phù hợp` : 'Nhập tên xe hoặc phụ kiện để tìm kiếm.'}</p>
    {result.data.length ? <div className="tt-search-results__list">{result.data.map(item => <Link key={`${item.kind}:${item.id}`} href={item.href} prefetch={false} className="tt-search-results__item">
      <ResponsiveImage profile="thumbnail" src={searchImage(item.imageUrl)} alt="" sizes="120px" width="120" height="88" loading="lazy" decoding="async" onError={event => {
        const image = event.currentTarget;
        if (image.src !== new URL(searchImage(null), location.origin).href) image.src = searchImage(null);
      }} />
      <div><span className="tt-search-results__kind">{item.kind === 'car' ? 'Ô tô' : 'Phụ kiện ô tô'}</span><h2>{item.name}</h2><strong>{Number(item.price).toLocaleString('vi-VN')} đ</strong></div>
      <span className="tt-search-results__arrow" aria-hidden="true">→</span>
    </Link>)}</div> : query && <p className="tt-search-results__empty">Không có kết quả phù hợp.</p>}
    {(result.meta.page < result.meta.totalPages || error) && <div className="car-load-more">
      {error && <p className="car-load-more__error" role="alert">Chưa thể tải thêm kết quả. Vui lòng thử lại.</p>}
      <button type="button" className="car-load-more__button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Đang tải...' : error ? 'Thử lại' : 'Xem thêm'}</button>
    </div>}
  </div>;
}
