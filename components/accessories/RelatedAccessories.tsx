'use client';

import { useEffect, useRef, useState } from 'react';
import type { Accessory } from '@/lib/public-api';
import AccessoryCard from './AccessoryCard';

export default function RelatedAccessories({ items }: { items: Accessory[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      setCanScroll(element.scrollWidth > element.clientWidth + 2);
      setAtStart(element.scrollLeft <= 2);
      setAtEnd(element.scrollLeft + element.clientWidth >= element.scrollWidth - 2);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [items.length]);

  if (!items.length) return null;
  return <section className="tt-accessory-related" aria-labelledby="tt-accessory-related-title">
    <div className="main_fix">
      <h2 id="tt-accessory-related-title" className="vehicle-detail-heading">Có thể bạn quan tâm</h2>
      <div className="tt-accessory-related__carousel">
        <div className="tt-accessory-related__viewport" ref={viewport}>
          <div className="tt-accessory-related__track">{items.map(item => <AccessoryCard item={item} key={item.id} />)}</div>
        </div>
        {canScroll && <div className="tt-accessories__controls">
          <button className="tt-accessories__arrow tt-accessories__arrow--prev" type="button" disabled={atStart} onClick={() => viewport.current?.scrollBy({ left: -viewport.current.clientWidth, behavior: 'smooth' })} aria-label="Xem phụ kiện trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button>
          <button className="tt-accessories__arrow tt-accessories__arrow--next" type="button" disabled={atEnd} onClick={() => viewport.current?.scrollBy({ left: viewport.current.clientWidth, behavior: 'smooth' })} aria-label="Xem phụ kiện tiếp theo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button>
        </div>}
      </div>
    </div>
  </section>;
}
