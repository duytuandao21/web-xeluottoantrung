'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import CarCard from '@/components/car/CarCard';
import type { Car } from '@/types/car';
import { recommendationApi, type RecommendationResult } from '@/lib/car-recommendations';
import { isNewArrival } from '@/lib/car-new-arrival';
export default function SurveyResults({ result: initialResult, capability, event, restart, headingRef }: { result: RecommendationResult; capability?: string; event: (type: string, carId?: string) => void; restart: () => void; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const router = useRouter();
  const [result, setResult] = useState(initialResult), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const more = async () => {
    if (request.current || !result.hasMore) return;
    if (!capability) { setError('Không đọc được phiên khảo sát. Vui lòng làm lại khảo sát.'); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const page = await recommendationApi<RecommendationResult>(`sessions/${result.sessionId}/results`, { body: { capability, offset: result.nextOffset }, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(old => {
        const unavailable = new Set(page.unavailableCarIds), retained = old.results.filter(item => !unavailable.has(item.car.id)), seen = new Set(retained.map(item => item.car.id));
        return { ...page, results: [...retained, ...page.results.filter(item => !seen.has(item.car.id))] };
      });
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Không thể tải thêm xe. Vui lòng thử lại.'); }
    finally { if (!controller.signal.aborted) setBusy(false); if (request.current === controller) request.current = null; }
  };
  const money = (price: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(price / 1000000)} triệu`;
  return <section className="tt-needs-results" aria-labelledby="tt-needs-results-title">
    <header className="tt-needs-results__heading">
      <div className="tt-needs-results__heading-row">
        <h2 id="tt-needs-results-title" ref={headingRef} tabIndex={-1}>{result.results.length ? 'Xe phù hợp với nhu cầu của bạn' : 'Chưa có xe phù hợp trong kho'}</h2>
        <div className="tt-needs-results__actions"><Link className="tt-date-button" href="/san-pham">Xem toàn bộ kho xe</Link><button className="tt-date-button tt-date-button--secondary" type="button" onClick={restart}>Làm lại khảo sát</button></div>
      </div>
      {!result.results.length && <p>Hiện chưa tìm được xe đáp ứng điều kiện bạn chọn. Bạn có thể chủ động đổi ngân sách hoặc yêu cầu bắt buộc để tìm lại.</p>}
      {result.unavailableCarIds.length > 0 && <p role="status">Một số xe trong kết quả trước đã thay đổi giá, thông tin hoặc không còn bán. Làm lại khảo sát để cập nhật gợi ý.</p>}
    </header>
    <div className="tt-needs-results__grid">{result.results.map(item => {
      const car: Car = { id: item.car.slug, className: 'item tt-needs-car', imageClass: 'img_sp', nameClass: 'name_sp', name: item.car.name, title: item.car.name, href: `/${encodeURIComponent(item.car.slug)}`,
        originalPrice: item.car.originalPrice,
        createdAt: item.car.createdAt, newArrival: item.car.newArrival, isNewArrival: item.car.newArrival === true && isNewArrival(item.car.createdAt),
        images: [{ src: item.car.cover || '/thumbs/90x90x2/assets/images/noimage.png', alt: item.car.name }], priceHtml: `<b>${money(item.car.price)}</b>`, compare: true,
        specs: [{ icon: '/assets/images/km.png', alt: 'Km', text: item.car.mileage === null ? 'Chưa rõ' : `${item.car.mileage.toLocaleString('vi-VN')} km` }, ...(item.car.seatCount ? [{ icon: '/assets/images/socho.png', alt: 'Số chỗ', text: `${item.car.seatCount} chỗ` }] : []), { icon: '/assets/images/hopso.png', alt: 'Hộp số', text: item.car.transmission.name || '—' }, { icon: '/assets/images/nhienlieu.png', alt: 'Nhiên liệu', text: item.car.fuel || '—' }, { icon: '/assets/images/bienso.png', alt: 'Năm sản xuất', text: String(item.car.year) }] };
      return <article className="tt-needs-result-card" key={item.car.id} onClick={e => {
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement;
        if (target.closest('button,input,select,label,[role=button]')) return;
        if (target.closest('a[href],.car-card-gallery__track p')) { event('car_clicked', item.car.id); return; }
        event('car_clicked', item.car.id);
        router.push(car.href);
      }}>
        <div className="tt-needs-result-card__score">Mức độ phù hợp <strong>{item.score}/100</strong></div>
        <CarCard car={car} />
        <div className="tt-needs-result-card__explanation"><ul>{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div>
      </article>;
    })}</div>
    {(result.hasMore || error) && <div className="car-load-more">
      {error && <p className="car-load-more__error" role="alert">{error}</p>}
      <button type="button" className="car-load-more__button" disabled={busy} onClick={() => void more()}>{busy ? <><span className="car-load-more__spinner" aria-hidden="true" />Đang tải...</> : error ? 'Thử lại' : 'Xem thêm'}</button>
    </div>}
    <span className="car-load-more__status" role="status" aria-live="polite" aria-atomic="true">Đã hiển thị {result.results.length} trên {result.totalAvailable} xe phù hợp.</span>
  </section>;
}
