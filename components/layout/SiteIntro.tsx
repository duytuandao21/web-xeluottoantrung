'use client';

import { useEffect, useRef } from 'react';

const INTRO_LOAD_DURATION = 800;

export default function SiteIntro({ logoUrl }: { logoUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const teardownTimerRef = useRef(0);

  useEffect(() => {
    window.clearTimeout(teardownTimerRef.current);
    const root = rootRef.current;
    const logo = logoRef.current;
    const progress = progressRef.current;
    if (!root || !logo || !progress || document.documentElement.dataset.siteIntro !== 'loading') return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const page = document.querySelector<HTMLElement>('.wapper');
    const previousInert = page?.inert ?? false;
    if (page) page.inert = true;
    const animations: Animation[] = [];
    let target: HTMLImageElement | undefined;
    let previousVisibility = '';
    let finished = false;
    let flying = false;
    let flightTimer = 0;
    const stop = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(holdTimer);
      window.clearTimeout(flightTimer);
      animations.forEach(animation => animation.cancel());
      if (target) target.style.visibility = previousVisibility;
      if (page) page.inert = previousInert;
    };
    const finish = () => { stop(); delete document.documentElement.dataset.siteIntro; };
    const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = element.animate(frames, { fill: 'forwards', ...options });
      animations.push(animation);
      return animation;
    };
    animate(progress, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: INTRO_LOAD_DURATION, easing: 'linear' });
    const holdTimer = window.setTimeout(() => {
      if (finished) return;
      target = [...document.querySelectorAll<HTMLImageElement>('[data-header-logo]')].find(image => {
        const rect = image.getBoundingClientRect();
        return !image.closest('[aria-hidden="true"]') && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.left < window.innerWidth && rect.top >= 0 && rect.top < window.innerHeight;
      });
      if (!target || reducedMotion.matches) {
        animate(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
        flightTimer = window.setTimeout(finish, 160);
        return;
      }
      const start = logo.getBoundingClientRect();
      const end = target.getBoundingClientRect();
      previousVisibility = target.style.visibility;
      target.style.visibility = 'hidden';
      flying = true;
      document.documentElement.dataset.siteIntro = 'flying';
      animate(logo, [
        { transform: 'translate(0, 0) scale(1, 1)' },
        { transform: `translate(${end.left - start.left}px, ${end.top - start.top}px) scale(${end.width / start.width}, ${end.height / start.height})` },
      ], { duration: 720, easing: 'cubic-bezier(.65, 0, .25, 1)' });
      const backdrop = root.querySelector('.tt-site-intro__backdrop');
      const bar = root.querySelector('.tt-site-intro__progress');
      if (backdrop) animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 100 });
      if (bar) animate(bar, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
      flightTimer = window.setTimeout(finish, 720);
    }, INTRO_LOAD_DURATION);

    const blockScroll = (event: Event) => { if (!finished) event.preventDefault(); };
    const onKey = (event: KeyboardEvent) => {
      if (finished) return;
      if (event.key === 'Escape') finish();
      else if (['Tab', ' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.preventDefault();
    };
    const onResize = () => { if (flying) finish(); };
    document.addEventListener('wheel', blockScroll, { passive: false });
    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', finish);
    logo.addEventListener('error', finish);
    if (logo.complete && logo.naturalWidth === 0) finish();
    return () => {
      stop();
      // Allow React's development remount to restart the intro; a real unmount clears it.
      teardownTimerRef.current = window.setTimeout(() => { delete document.documentElement.dataset.siteIntro; }, 0);
      document.removeEventListener('wheel', blockScroll);
      document.removeEventListener('touchmove', blockScroll);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', finish);
      logo.removeEventListener('error', finish);
    };
  }, []);

  return <div className="tt-site-intro" ref={rootRef} role="status" aria-label="Đang mở website Toàn Trung">
    <div className="tt-site-intro__backdrop" aria-hidden="true" />
    <div className="tt-site-intro__center">
      <img className="tt-site-intro__logo" ref={logoRef} src={logoUrl} alt="Toàn Trung" width="1600" height="640" loading="eager" decoding="sync" />
      <div className="tt-site-intro__progress" aria-hidden="true"><div ref={progressRef} /></div>
    </div>
  </div>;
}
