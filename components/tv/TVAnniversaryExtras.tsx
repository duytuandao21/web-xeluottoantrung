'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TVAnniversarySlideConfig } from '@/lib/tv-anniversary-settings';

// Fixed, unequal phases produce a natural pattern without random hydration,
// DOM churn, particle spawning or a JavaScript animation loop.
export const TVAnniversaryConfetti = memo(function TVAnniversaryConfetti() {
  return <div className="tv-event-confetti" aria-hidden="true">
    {[20, 23, 26, 29, 32, 65, 67, 69, 71, 73, 77, 81].map((left, index) => <i key={left}
      className="tv-event-animated" style={{ left: `${left}%`, top: `${12 + index % 3 * 24}%`,
        '--event-duration': `${11 + index * .8}s`, '--event-delay': `${-index * 2.3}s`,
        '--event-color': ['#d9aa42', '#fff', '#e95656'][index % 3] } as CSSProperties}/>)}
  </div>;
});

export function TVAnniversarySparkles() {
  return <div className="tv-event-sparkles" aria-hidden="true">
    {[[3, 12], [18, 80], [31, 13], [76, 3], [97, 75]].map(([left, top], index) => <i key={index}
      className="tv-event-animated" style={{ left: `${left}%`, top: `${top}%`,
        '--event-duration': `${7.3 + index * 1.9}s`, '--event-delay': `${-index * 2.7}s` } as CSSProperties}/>)}
  </div>;
}

export const TVGratitude = memo(function TVGratitude({ layoutKey, messages, seconds }: { layoutKey: string; messages: string[]; seconds: number }) {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const unit = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  useEffect(() => {
    const node = root.current;
    const footer = node?.closest('.tv-footer');
    if (!node || !footer) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      const bounds = footer.getBoundingClientRect();
      const count = footer.querySelector('.tv-brand-summary--active .tv-brand-summary__count');
      const phone = footer.querySelector('.tv-hotline__icon');
      if (!phone) return;
      const gap = innerWidth * .012;
      const left = (count?.getBoundingClientRect().right ?? bounds.left) - bounds.left + gap;
      const right = phone.getBoundingClientRect().left - bounds.left - gap;
      node.style.setProperty('--gratitude-left', `${left}px`);
      node.style.setProperty('--gratitude-width', `${Math.max(0, right - left)}px`);
      const unitWidth = unit.current?.getBoundingClientRect().width || 0;
      const viewportWidth = viewport.current?.clientWidth || 0;
      if (unitWidth <= 0 || viewportWidth <= 0) { node.dataset.fit = 'false'; return; }
      // Each half fills the viewport even with one very short message. Two
      // identical halves translate by exactly one half for a seamless join.
      const repeat = Math.min(24,Math.ceil(viewportWidth / unitWidth));
      setCopies(previous=>previous===repeat ? previous : repeat);
      const pixelsPerSecond = parseFloat(getComputedStyle(node).fontSize) * 14 / seconds;
      node.style.setProperty('--tv-gratitude-duration',`${unitWidth * repeat / pixelsPerSecond}s`);
      node.dataset.fit = String(unit.current?.parentElement?.childElementCount === repeat);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(footer);
    if (viewport.current) observer.observe(viewport.current);
    if (unit.current) observer.observe(unit.current);
    for (const element of footer.querySelectorAll('.tv-hotline, .tv-brand-summary__count')) observer.observe(element);
    void document.fonts.ready.then(fit);
    fit();
    return () => { live = false; observer.disconnect(); };
  }, [layoutKey, messages, seconds, copies]);
  return <div className="tv-gratitude" ref={root}>
    <svg className="tv-gratitude__arrows" viewBox="0 0 36 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 3 6 6-6 6m11-12 6 6-6 6m11-12 6 6-6 6"/></svg>
    <div className="tv-gratitude__viewport" ref={viewport}>
      <div className="tv-gratitude__track tv-event-animated">
        {[0,1].map(group=><div key={group} className="tv-gratitude__group" aria-hidden={group===1 ? true : undefined}>
          {Array.from({length:copies},(_,index)=><div key={index} ref={group===0 && index===0 ? unit : undefined} className="tv-gratitude__sequence" aria-hidden={index>0 ? true : undefined}>
            {messages.map((message,i)=><span key={i} className="tv-gratitude__item"><svg className="tv-gratitude__star" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><path d="m8 0 2.4 7.6L16 10l-5.6 2.4L8 20l-2.4-7.6L0 10l5.6-2.4Z"/></svg><span className="tv-gratitude__text">{message}</span></span>)}
          </div>)}
        </div>)}
      </div>
    </div>
  </div>;
});

/** Kept mounted so the photo is decoded once and reused across interludes. */
export function TVAnniversarySlide({ visible, onReady, slide }: { visible: boolean; slide: TVAnniversarySlideConfig; onReady: (url: string, status: 'loading' | 'ready' | 'failed') => void }) {
  const image = useRef<HTMLImageElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    let live = true;
    let decoding = false;
    setLoaded(false); onReady(slide.imageUrl, 'loading');
    const finish = (ready: boolean) => {
      if (!live) return;
      clearTimeout(timeout);
      setLoaded(ready); onReady(slide.imageUrl, ready ? 'ready' : 'failed');
    };
    const load = () => {
      if (decoding || !element.complete || !element.naturalWidth) return;
      decoding = true;
      void element.decode().then(() => finish(true)).catch(() => finish(false));
    };
    const error = () => finish(false);
    const timeout = setTimeout(error, 12_000);
    element.addEventListener('load', load); element.addEventListener('error', error);
    if (element.complete) { if (element.naturalWidth) load(); else error(); }
    return () => {
      live = false; clearTimeout(timeout);
      element.removeEventListener('load', load); element.removeEventListener('error', error);
    };
  }, [onReady, slide.imageUrl]);
  useEffect(() => {
    const node = copy.current;
    if (!node) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      node.style.setProperty('--tv-tribute-scale','1');
      for (let i=0; i<3 && node.scrollHeight > node.clientHeight + 1; i++) {
        const scale = Number(node.style.getPropertyValue('--tv-tribute-scale'));
        node.style.setProperty('--tv-tribute-scale',String(Math.max(.4,scale * node.clientHeight / node.scrollHeight * .94)));
      }
    };
    const observer = new ResizeObserver(fit); observer.observe(node);
    void document.fonts.ready.then(fit); fit();
    return () => { live=false; observer.disconnect(); };
  }, [slide.title, slide.highlight, slide.body]);
  return <section className="tv-anniversary-slide" data-visible={visible && loaded} aria-hidden={!visible || !loaded}
    aria-label="Kỷ niệm 4 năm thành lập Auto Toàn Trung" inert={!visible || !loaded}>
    <div className="tv-anniversary-slide__photo">
      {/* Existing local asset; no inventory/API read or generated substitute. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={slide.imageUrl} alt="Showroom Auto Toàn Trung" decoding="async"/>
      <span>Auto Toàn Trung · Đồng hành cùng bạn</span>
    </div>
    <div className="tv-anniversary-slide__copy" ref={copy}>
      <div className="tv-anniversary-slide__seal" aria-label="4 năm, 2022–2026"><strong>4</strong><span>NĂM</span><small>2022 – 2026</small></div>
      <p className="tv-anniversary-slide__eyebrow">KỶ NIỆM THÀNH LẬP</p>
      <h2>{slide.title}<br/><em>{slide.highlight}</em></h2>
      <p>{slide.body}</p>
      <span className="tv-anniversary-slide__signature">Auto Toàn Trung</span>
    </div>
  </section>;
}
