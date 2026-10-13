'use client';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { PromotionAd as Ad } from '@/lib/promotions';
import usePromotionDialog from './usePromotionDialog';
import './promotions.css';

export default function PromotionAd({ promotion, onClose }: { promotion: Ad; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  usePromotionDialog(dialog, true, promotion.endsAt, onClose);
  return createPortal(<dialog ref={dialog} className="tt-promo-ad" aria-labelledby="tt-promo-ad-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if(event.target === event.currentTarget) onClose(); }}>
    <h2 id="tt-promo-ad-title" className="tt-promo-sr-only">{promotion.title}</h2>
    <Link href={`/khuyen-mai?chuong-trinh=${encodeURIComponent(promotion.id)}`} onClick={onClose} aria-label={`Xem chương trình: ${promotion.title}`}>
      <ResponsiveImage src={promotion.imageUrl} profile="content" alt={promotion.title} loading="eager" />
    </Link>
    <button data-promo-close type="button" className="tt-promo-close" onClick={onClose} aria-label="Đóng quảng cáo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
  </dialog>, document.body);
}
