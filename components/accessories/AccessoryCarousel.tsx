'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { Accessory } from '@/lib/public-api';
import AccessoryCard from './AccessoryCard';

export default function AccessoryCarousel({ items }: { items: Accessory[] }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(4);
  const [paused, setPaused] = useState(false);
  const maxIndex = Math.max(0, items.length - visible);

  useEffect(() => { setHost(document.getElementById('tt-accessories-root')); }, []);
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const measure = () => {
      const first = track.firstElementChild as HTMLElement | null;
      if (!first) return;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const nextStep = first.getBoundingClientRect().width + gap;
      setStep(nextStep);
      setVisible(Math.max(1, Math.round((viewport.clientWidth + gap) / nextStep)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, [host, items.length]);
  useEffect(() => { setIndex(current => Math.min(current, maxIndex)); }, [maxIndex]);
  useEffect(() => {
    if (!host || maxIndex === 0 || paused) return;
    const interval = window.setInterval(() => setIndex(current => current >= maxIndex ? 0 : current + 1), 10_000);
    return () => window.clearInterval(interval);
  }, [host, maxIndex, paused]);

  if (!host) return null;
  const move = (direction: number) => setIndex(current => current + direction < 0 ? maxIndex : current + direction > maxIndex ? 0 : current + direction);
  return createPortal(
    <section className="tt-accessories" aria-labelledby="tt-accessories-title"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}>
      <div className="main_fix">
        <div className="tt-accessories__heading">
          <span className="tt-home-section-heading__line" aria-hidden="true" />
          <h2 id="tt-accessories-title">Phụ kiện ô tô</h2>
        </div>
        {items.length === 0 ? <p className="tt-accessories__empty">Phụ kiện đang được cập nhật.</p> : <div className="tt-accessories__carousel">
          <div className="tt-accessories__viewport" ref={viewportRef}>
            <div className="tt-accessories__track" ref={trackRef} style={{ transform: `translate3d(-${index * step}px,0,0)` }}>
              {items.map(item => <AccessoryCard item={item} key={item.id} />)}
            </div>
          </div>
          {maxIndex > 0 && <div className="tt-accessories__controls">
            <button className="tt-accessories__arrow tt-accessories__arrow--prev" type="button" onClick={() => move(-1)} aria-label="Xem phụ kiện trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button>
            <button className="tt-accessories__arrow tt-accessories__arrow--next" type="button" onClick={() => move(1)} aria-label="Xem phụ kiện tiếp theo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button>
          </div>}
        </div>}
        <p className="tt-accessories__more"><Link className="tt-home-news-all tt-accessories__more-button" href="/phu-kien-o-to">Xem tất cả phụ kiện</Link></p>
      </div>
    </section>, host,
  );
}
