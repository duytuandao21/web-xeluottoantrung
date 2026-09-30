'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FuelPrice } from '@/lib/fuel-prices';

const number = new Intl.NumberFormat('vi-VN');

export default function FuelPriceViewer() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [prices, setPrices] = useState<FuelPrice[]>([]);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  const loadPrices = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus('loading');
    setError('');
    try {
      const response = await fetch('/api/fuel-prices', { cache: 'no-store', signal: controller.signal });
      const result = await response.json() as { prices?: FuelPrice[]; message?: string };
      if (!response.ok || !Array.isArray(result.prices)) throw new Error(result.message || 'Không thể tải bảng giá.');
      setPrices(result.prices);
      setStatus('success');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tải bảng giá.');
      setStatus('error');
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  useEffect(() => {
    void loadPrices();
    return () => request.current?.abort();
  }, [loadPrices]);

  return <section className="tt-fuel" aria-labelledby="tt-fuel-title">
    <div className="tt-fuel__panel">
      <div className="tt-fuel__table-heading">
        <h1 id="tt-fuel-title">Bảng giá xăng dầu</h1>
        {prices.length > 0 && <span>{prices.length} mặt hàng</span>}
      </div>

      <div className="tt-fuel__result" aria-live="polite">
        {status === 'loading' && prices.length === 0 && <div className="tt-fuel__message" role="status">Đang kết nối với Petrolimex...</div>}
        {status === 'error' && <div className="tt-fuel__message tt-fuel__message--error" role="alert">{error}</div>}
        {prices.length > 0 && <div className="tt-fuel__table-wrap">
          <table>
            <thead><tr><th scope="col">Mặt hàng</th><th scope="col">Vùng 1</th><th scope="col">Vùng 2</th><th scope="col">Ngày cập nhật</th></tr></thead>
            <tbody>{prices.map((item, index) => <tr key={`${item.name}-${index}`}>
              <th scope="row">{item.name}</th>
              <td data-label="Vùng 1">{item.zone1Price === null ? '—' : number.format(item.zone1Price)}</td>
              <td data-label="Vùng 2">{item.zone2Price === null ? '—' : number.format(item.zone2Price)}</td>
              <td data-label="Ngày cập nhật">{item.updatedDate || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>

      <div className="tt-fuel__footer">
        <p className="tt-fuel__source">Nguồn: <a href="https://www.petrolimex.com.vn/" target="_blank" rel="noopener noreferrer">Petrolimex</a>. Giá và đơn vị áp dụng theo từng mặt hàng tại hệ thống Petrolimex.</p>
        <button type="button" onClick={loadPrices} disabled={status === 'loading'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></svg>
          {status === 'loading' ? 'Đang cập nhật...' : 'Cập nhật giá'}
        </button>
      </div>
    </div>
  </section>;
}
