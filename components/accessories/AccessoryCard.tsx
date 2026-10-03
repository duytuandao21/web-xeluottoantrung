import type { Accessory } from '@/lib/public-api';
import Link from 'next/link';

export default function AccessoryCard({ item }: { item: Accessory }) {
  return <article className="tt-accessories__card" data-accessory-id={item.id}>
    <Link href={`/phu-kien-o-to/${item.id}`} className="tt-accessories__image" aria-label={`Xem chi tiết ${item.name}`}>
      <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
    </Link>
    <div className="tt-accessories__price">{Number(item.price).toLocaleString('vi-VN')} đ</div>
    <div className="tt-accessories__body">
      <h3><Link href={`/phu-kien-o-to/${item.id}`} title={item.name}>{item.name}</Link></h3>
      <p className="tt-accessories__brand" title={`Thương hiệu: ${item.brand}`}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V11l6 4v-4l6 4V5h6v16H3Z"/><path d="M7 18h.01M12 18h.01M17 18h.01" strokeWidth="2.8"/></svg></span><span className="tt-accessories__brand-text"><span className="tt-accessories__brand-label">Thương hiệu: </span><strong>{item.brand}</strong></span></p>
    </div>
  </article>;
}
