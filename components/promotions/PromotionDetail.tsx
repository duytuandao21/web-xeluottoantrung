'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { promotionDate, promotionLabels, type Promotion } from '@/lib/promotions';
import usePromotionDialog from './usePromotionDialog';
import './promotions.css';

export default function PromotionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), imageFrame = useRef<HTMLDivElement>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [height, setHeight] = useState(540);
  usePromotionDialog(dialog);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/promotions/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(async response => { const data = await response.json(); if(!response.ok) throw new Error(data.message || 'Không tải được chương trình.'); return data as Promotion; })
      .then(data => { if(!controller.signal.aborted) { setPromotion(data); setError(''); } })
      .catch(failure => { if(!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không tải được chương trình.'); });
    return () => controller.abort();
  }, [id, retry]);
  const measure = useCallback(() => {
    const frame = imageFrame.current, image = frame?.querySelector('img');
    if(frame && image?.naturalWidth && image.naturalHeight) setHeight(Math.max(280, Math.min(720, frame.clientWidth * image.naturalHeight / image.naturalWidth)));
  }, []);
  useEffect(() => {
    const frame = imageFrame.current; if(!frame) return;
    const observer = new ResizeObserver(measure); observer.observe(frame); measure();
    return () => observer.disconnect();
  }, [promotion?.id, measure]);
  return createPortal(<dialog ref={dialog} className="tt-promo-detail" aria-labelledby="tt-promo-detail-title" style={{ '--promo-detail-height': `${height}px` } as CSSProperties}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
      if(event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if(event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <button data-promo-close type="button" className="tt-promo-close" onClick={onClose} aria-label="Đóng chương trình"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    {!promotion ? <div className="tt-promo-detail__loading"><h2 id="tt-promo-detail-title">Chi tiết chương trình</h2>{error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div> : <p role="status">Đang tải chương trình...</p>}</div> : <div className="tt-promo-detail__layout">
      <div ref={imageFrame} className="tt-promo-detail__image"><ResponsiveImage src={promotion.imageUrl} profile="content" alt={promotion.title} loading="eager" onLoad={measure} /></div>
      <div className="tt-promo-detail__content" tabIndex={0} aria-label="Nội dung chương trình, có thể cuộn">
        <span className={`tt-promo-status is-${promotion.status}`}>{promotionLabels[promotion.status]}</span>
        <h2 id="tt-promo-detail-title">{promotion.title}</h2>
        <div className="tt-promo-detail__dates"><strong>Ngày áp dụng</strong><span>Từ {promotionDate(promotion.startsAt)}</span><span>Đến {promotionDate(promotion.endsAt)}</span></div>
        <div className="tt-promo-detail__body" dangerouslySetInnerHTML={{ __html: promotion.content || '<p>Xem thông tin chương trình trong ảnh.</p>' }} />
      </div>
    </div>}
  </dialog>, document.body);
}
