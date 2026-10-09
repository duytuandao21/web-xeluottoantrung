import ResponsiveImage from '@/components/common/ResponsiveImage';
import type { Accessory } from '@/lib/public-api';
import Link from 'next/link';

export default function AccessoryCard({ item }: { item: Accessory }) {
  return <article className="tt-accessories__card" data-accessory-id={item.id}>
    <Link href={`/phu-kien-o-to/${item.id}`} className="tt-accessories__image" aria-label={`Xem chi tiết ${item.name}`}>
      <ResponsiveImage profile="card" src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
    </Link>
    <div className="tt-accessories__price">{Number(item.price).toLocaleString('vi-VN')} đ</div>
    <div className="tt-accessories__body">
      <h3><Link href={`/phu-kien-o-to/${item.id}`} title={item.name}>{item.name}</Link></h3>
      <p className="tt-accessories__brand" title={`Thương hiệu: ${item.brand}`}>
        <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 3h-7L3 13l8 8 10-10V4a1 1 0 0 0-1-1Z"/><circle cx="16.5" cy="7.5" r="1.4"/></svg></span>
        <span className="tt-accessories__brand-text"><span className="tt-accessories__brand-label">Thương hiệu: </span><strong>{item.brand}</strong></span>
      </p>
    </div>
  </article>;
}
