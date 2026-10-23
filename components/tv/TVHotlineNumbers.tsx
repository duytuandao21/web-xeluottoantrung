'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/** A separate clock and fixed-size number slot; never updates the car buffers. */
export default function TVHotlineNumbers({ phones, seconds }: { phones: string[]; seconds: number }) {
  const container = useRef<HTMLElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  const second = useRef<HTMLSpanElement>(null);
  const [slots, setSlots] = useState<[string, string]>([phones[0] || '', '']);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const box = container.current;
    const measure = document.createElement('canvas').getContext('2d');
    if (!box || !measure) return;
    let live = true;
    const fit = () => {
      if (!live || !box.clientWidth) return;
      const style = getComputedStyle(box);
      measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // All digits use tabular widths in CSS. Fit the longest number once for
      // this list/viewport; the outer slot keeps exactly the same dimensions.
      const width = Math.max(1, ...phones.map(phone => measure.measureText(phone.replace(/\d/g, '0')).width));
      box.style.setProperty('--tv-number-font-size', `${parseFloat(style.fontSize) * Math.min(1, (box.clientWidth - 2) / width)}px`);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(box); void document.fonts.ready.then(fit);
    return () => { live = false; observer.disconnect(); };
  }, [phones]);
  useEffect(() => {
    if (phones.length < 2) return;
    let disposed = false, busy = false, index = 0, slot = 0, frame = 0;
    let animation: ReturnType<(typeof import('gsap'))['gsap']['timeline']> | undefined;
    const refs = [first, second];
    const library = import('gsap').then(module => module.gsap).catch(() => null);
    const timer = window.setInterval(() => {
      if (disposed || busy || document.hidden) return;
      busy = true;
      const nextIndex = (index + 1) % phones.length;
      const nextSlot = 1 - slot;
      setSlots(previous => nextSlot === 0 ? [phones[nextIndex], previous[1]] : [previous[0], phones[nextIndex]]);
      const start = async () => {
        if (disposed) return;
        const incoming = refs[nextSlot].current;
        const outgoing = refs[slot].current;
        if (!incoming || !outgoing || incoming.textContent !== phones[nextIndex]) {
          frame = requestAnimationFrame(() => void start()); return;
        }
        const gsap = await library;
        if (disposed) return;
        const finish = () => {
          if (disposed) return;
          slot = nextSlot; index = nextIndex;
          flushSync(() => setActive(slot));
          gsap?.set([incoming, outgoing], { clearProps: 'opacity,visibility,zIndex' });
          busy = false;
        };
        if (!gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
        animation = gsap.timeline({ onComplete: finish });
        animation.to(outgoing, { opacity: 0, duration: .22, ease: 'power2.inOut' }, 0)
          .fromTo(incoming, { autoAlpha: 0, zIndex: 2 }, { autoAlpha: 1, duration: .4, ease: 'power2.inOut' }, 0);
      };
      frame = requestAnimationFrame(() => void start());
    }, seconds * 1000);
    return () => { disposed = true; clearInterval(timer); cancelAnimationFrame(frame); animation?.kill(); };
  }, [phones, seconds]);
  return <strong ref={container} className="tv-hotline__numbers" aria-label="Số điện thoại tư vấn">
    <span ref={first} className={`tv-hotline__number${active === 0 ? ' tv-hotline__number--active' : ''}`} aria-hidden={active !== 0}>{slots[0]}</span>
    <span ref={second} className={`tv-hotline__number${active === 1 ? ' tv-hotline__number--active' : ''}`} aria-hidden={active !== 1}>{slots[1]}</span>
  </strong>;
}
