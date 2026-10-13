'use client';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { PageResult } from '@/lib/public-api';
import { promotionLabels, type Promotion } from '@/lib/promotions';
import './promotions.css';
const PromotionDetail = dynamic(() => import('./PromotionDetail'), { ssr: false });

export default function PromotionListing({ result, selectedId }: { result: PageResult<Promotion>; selectedId?: string }) {
  const [selected, setSelected] = useState<string | null>(selectedId || null);
  return <>
    <div className="tt-promotions-grid">{result.data.map(promotion => <article className="tt-promotion-card" key={promotion.id}>
      <button type="button" className="tt-promotion-card__trigger" onClick={() => setSelected(promotion.id)} aria-haspopup="dialog" aria-label={`Xem chương trình: ${promotion.title}`}>
        <div className="tt-promotion-card__image"><ResponsiveImage src={promotion.imageUrl} profile="card" sizes="(max-width:600px) calc(100vw - 32px), (max-width:960px) 45vw, 400px" alt="" loading="lazy" decoding="async" />
        </div>
        <span className={`tt-promo-status is-${promotion.status}`}>{promotionLabels[promotion.status]}</span>
        <h2>{promotion.title}</h2>
      </button>
    </article>)}</div>
    {!result.data.length && <div className="tt-promotions-empty"><h2>Chương trình đang được cập nhật</h2><p>Các ưu đãi và sự kiện mới sẽ được Toàn Trung cập nhật tại đây.</p></div>}
    {result.meta.totalPages > 1 && <nav className="tt-promotions-pagination" aria-label="Phân trang khuyến mãi">
      {result.meta.page > 1 && <Link href={`/khuyen-mai?page=${result.meta.page - 1}`} aria-label="Trang trước">‹</Link>}
      {Array.from({ length: result.meta.totalPages }, (_, index) => index + 1).filter(page => page === 1 || page === result.meta.totalPages || Math.abs(page - result.meta.page) <= 2).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span className="tt-promotions-pagination__gap">…</span>}<Link href={`/khuyen-mai?page=${page}`} aria-current={page === result.meta.page ? 'page' : undefined} aria-label={`Trang ${page}`}>{page}</Link></span>)}
      {result.meta.page < result.meta.totalPages && <Link href={`/khuyen-mai?page=${result.meta.page + 1}`} aria-label="Trang sau">›</Link>}
    </nav>}
    {selected && <PromotionDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
  </>;
}
