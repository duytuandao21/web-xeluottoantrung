'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Reveal carousel containers, leaving slide transforms and card hover effects independent.
const targets = [
  '.muaxe .title-main', '.muaxe .thuonghieu', '.muaxe .ngansach', '.home-buy-banner',
  '.banxe', '.item_qt', '.wap_sanpham .td_kp', '.wap_sanpham .loadthem_sp1',
  '.wap_sanpham .xemtatca', '.tt-accessories__heading', '.tt-accessories__carousel',
  '.tt-accessories__more', '.wap_dichvu .title-main', '.wap_dichvu .cap1',
  '.wap_dichvu .slick4321', '.wap_dichvu .xemtatca', '.wap_camnhan .title-main',
  '.wap_camnhan .camnhan', '.wap_camnhan .xemtatca2', '.tt-home-section-heading',
  '.tt-home-utility', '.tt-home-news-card', '.tt-home-news-more',
].join(',');

export default function HomeScrollReveal({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;
    const registered = new Set<HTMLElement>();
    let scanFrame = 0;
    const reveal = (element: HTMLElement) => {
      element.dataset.revealState = 'visible';
      observer.unobserve(element);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target as HTMLElement); });
    }, { threshold: 0, rootMargin: '0px 0px -48px 0px' });
    const scan = () => {
      scanFrame = 0;
      root.querySelectorAll<HTMLElement>(targets).forEach(element => {
        if (registered.has(element) || element.closest('.slick-cloned') || element.parentElement?.closest(targets)) return;
        registered.add(element);
        // Keep the initial viewport and any already-passed content visible immediately.
        const bounds = element.getBoundingClientRect();
        if (reducedMotion.matches || (bounds.height > 0 && bounds.top < window.innerHeight - 48)) {
          element.dataset.revealState = 'visible';
          return;
        }
        const staggerGroup = element.closest('.tt-home-utility-grid,.tt-home-news-grid,.quytrinh2');
        const siblings = staggerGroup ? [...staggerGroup.querySelectorAll<HTMLElement>(targets)] : [];
        element.style.setProperty('--reveal-delay', `${Math.max(0, siblings.indexOf(element)) % 4 * 75}ms`);
        element.dataset.revealState = 'pending';
        observer.observe(element);
      });
      for (const element of registered) if (!root.contains(element)) { observer.unobserve(element); registered.delete(element); }
    };
    scan();
    // Accessories are portaled in after mount; carousels also create responsive slide containers.
    const mutations = new MutationObserver(() => {
      if (!scanFrame) scanFrame = requestAnimationFrame(scan);
    });
    mutations.observe(root, { childList: true, subtree: true });
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const element = event.target.closest<HTMLElement>('[data-reveal-state="pending"]');
      if (element) reveal(element);
    };
    const onMotionChange = () => { if (reducedMotion.matches) registered.forEach(reveal); };
    root.addEventListener('focusin', onFocus);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(scanFrame);
      root.removeEventListener('focusin', onFocus);
      reducedMotion.removeEventListener('change', onMotionChange);
      registered.forEach(element => { delete element.dataset.revealState; element.style.removeProperty('--reveal-delay'); });
    };
  }, []);
  return <div className="tt-home-motion" ref={rootRef}>{children}</div>;
}
