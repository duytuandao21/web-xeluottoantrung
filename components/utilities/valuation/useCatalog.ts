'use client';
import { useEffect, useRef, useState } from 'react';
import { valuationApi, type CatalogResult } from '@/lib/valuation';

export default function useCatalog<T>(path: string | null, version: string, epoch: number) {
  const cache = useRef(new Map<string, T[]>()), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data: T[]; error: string }>({ key: '', data: [], error: '' });
  const cacheKey = `${epoch}:${version}:${path}`, key = `${cacheKey}:${retry}`;
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController(), cached = cache.current.get(cacheKey);
    if (cached) { queueMicrotask(() => { if (!abort.signal.aborted) setState({ key, data: cached, error: '' }); }); }
    else valuationApi<CatalogResult<T>>(path, { signal: abort.signal }).then(result => {
      if (abort.signal.aborted) return;
      if ((result.configurationKey ?? result.policyVersion) !== version) throw new Error('Danh mục vừa được cập nhật. Vui lòng chọn “Cập nhật danh mục” để tải thông tin mới.');
      if (!Array.isArray(result.data)) throw new Error('Không đọc được danh mục. Vui lòng thử lại.');
      cache.current.set(cacheKey, result.data); setState({ key, data: result.data, error: '' });
    }).catch(error => { if (!abort.signal.aborted) setState({ key, data: [], error: error instanceof Error ? error.message : 'Không tải được danh mục.' }); });
    return () => abort.abort();
  }, [path, version, epoch, retry, key, cacheKey]);
  return { data: path && state.key === key ? state.data : [], loading: !!path && state.key !== key, error: path && state.key === key ? state.error : '',
    retry: () => { cache.current.delete(cacheKey); setRetry(value => value + 1); } };
}
