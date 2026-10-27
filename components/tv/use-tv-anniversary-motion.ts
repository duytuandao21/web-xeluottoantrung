'use client';

import { useEffect, type RefObject } from 'react';

// A screen can receive new settings or toggle the event without replaying its
// entrance. Weak references do not retain screens after leaving /TV.
const openedScreens = new WeakSet<HTMLElement>();

export function useTVAnniversaryMotion(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const screen = root.closest<HTMLElement>('.tv-screen') || root;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;
    const enabled = () => !disposed && !document.hidden && !reduced.matches;
    const reset = () => {
      generation++;
      clearTimeout(timer);
      stop?.(); stop = undefined;
    };
    const begin = async () => {
      if (!enabled()) return;
      const version = generation;
      const [{ gsap }] = await Promise.all([import('gsap'), document.fonts.ready]);
      if (version !== generation || !enabled()) return;
      const number = root.querySelector<HTMLElement>('.tv-anniversary-badge__number');
      const gold = number?.querySelector('strong');
      const face = root.querySelector<HTMLElement>('.tv-anniversary-ribbon-wrap');
      const glint = face?.querySelector<SVGRectElement>('.tv-anniversary-ribbon-glint');
      const label = root.querySelector<HTMLElement>('.tv-anniversary-badge__label');
      const years = root.querySelector<HTMLElement>('.tv-anniversary-badge__years');
      if (!number || !gold || !face || !glint || !label || !years) return;
      const context = gsap.context(() => {
        // A paused timeline plus one timeout leaves no repeating animation or
        // frame loop running during the 28-second rest between light sweeps.
        const schedule = () => {
          if (enabled()) timer = setTimeout(() => { if (enabled()) shine.restart(); }, 28_000);
        };
        const shine = gsap.timeline({ paused: true, onComplete: schedule });
        shine.fromTo(glint, { x: -130 }, { x: 660, duration: 1.35, ease: 'sine.inOut' }, 0)
          .fromTo(gold, { '--tv-anniversary-glint': '140%' },
            { '--tv-anniversary-glint': '-40%', duration: 1.35, ease: 'sine.inOut' }, 0);
        if (openedScreens.has(screen)) { schedule(); return; }
        openedScreens.add(screen);
        // All content is readable before JS/library/fonts are ready. Only the
        // decorative SVG unfolds; text never collapses with the ribbon.
        const intro = gsap.timeline({ onComplete: schedule });
        intro.fromTo(number, { scale: .96, opacity: .72 },
          { scale: 1, opacity: 1, duration: .65, ease: 'power2.out' }, 0)
          .fromTo(face, { scaleX: .72, opacity: .5, transformOrigin: '50% 50%' },
            { scaleX: 1, opacity: 1, duration: .8, ease: 'power2.out' }, 0)
          .fromTo([label, years], { opacity: .8 }, { opacity: 1, duration: .45 }, .2)
          .set([number, face, label, years], { clearProps: 'transform,opacity,transformOrigin' });
      }, root);
      stop = () => context.revert();
    };
    const synchronize = () => {
      reset();
      // Missing animation support keeps the existing static design available.
      void begin().catch(() => { stop?.(); stop = undefined; });
    };
    synchronize();
    document.addEventListener('visibilitychange', synchronize);
    reduced.addEventListener('change', synchronize);
    return () => {
      disposed = true; reset();
      document.removeEventListener('visibilitychange', synchronize);
      reduced.removeEventListener('change', synchronize);
    };
  }, [rootRef]);
}
