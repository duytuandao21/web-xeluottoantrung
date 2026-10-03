'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

const NavigationContext = createContext<{ pending: boolean; navigate: (href: string) => void } | null>(null);
export const useArticleSectionNavigation = () => useContext(NavigationContext);

export default function ArticleSectionMotion({ id, titleId, title, page, children, pagination }: {
  id: string; titleId: string; title: string; page: number; children: ReactNode; pagination: ReactNode;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousPage = useRef(page);
  const requested = useRef(false);
  const previousHeight = useRef(0);
  const [announcement, setAnnouncement] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const navigate = (href: string) => {
    if (pending) return;
    requested.current = true;
    const body = bodyRef.current;
    if (body) {
      previousHeight.current = body.getBoundingClientRect().height;
      body.style.minHeight = `${previousHeight.current}px`;
    }
    setAnnouncement('Đang tải bài viết…');
    startTransition(() => router.push(href, { scroll: false }));
  };

  useLayoutEffect(() => {
    const root = rootRef.current, body = bodyRef.current;
    if (!root || !body) return;
    const changed = previousPage.current !== page;
    previousPage.current = page;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const elements = [...(changed ? body : root).querySelectorAll<HTMLElement>(changed
      ? '.tt-article-preview,.tt-faq-empty' : 'h2,.tt-article-preview,.tt-faq-empty')];
    const animate = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      if (motion.matches || typeof element.animate !== 'function') return null;
      const animation = element.animate(frames, options);
      animations.add(animation);
      void animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      return animation;
    };
    const reveal = (element: HTMLElement, withAnimation = true) => {
      element.dataset.articleReveal = 'visible';
      if (withAnimation) animate(element, [{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }], {
        duration: 520, delay: Number(element.dataset.articleDelay || 0), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards',
      });
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        reveal(entry.target as HTMLElement); observer?.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' }) : null;

    if (changed) {
      body.style.minHeight = '';
      const height = body.getBoundingClientRect().height;
      const animation = animate(body, [{ opacity: 0, translate: '0 12px', height: `${previousHeight.current || height}px` }, { opacity: 1, translate: '0 0', height: `${height}px` }], {
        duration: 420, easing: 'cubic-bezier(.22,1,.36,1)',
      });
      if (animation) {
        body.style.overflow = 'clip';
        void animation.finished.then(() => { body.style.overflow = ''; }, () => undefined);
      }
      if (requested.current) {
        root.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
        root.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'start' });
      }
      setAnnouncement(`${title}: trang ${page}`);
      requested.current = false;
    }

    let cardIndex = 0;
    for (const element of elements) {
      element.dataset.articleDelay = element.matches('.tt-article-preview') ? String(cardIndex++ % 4 * 65) : '0';
      const bounds = element.getBoundingClientRect();
      if (motion.matches || !observer || bounds.bottom <= 0) reveal(element, false);
      else if (bounds.top < window.innerHeight - 24) reveal(element, !changed);
      else { element.dataset.articleReveal = 'pending'; observer.observe(element); }
    }
    const showFocused = (event: FocusEvent) => {
      const element = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-article-reveal="pending"]') : null;
      if (element) { reveal(element, false); observer?.unobserve(element); }
    };
    const reduceMotion = () => {
      if (!motion.matches) return;
      observer?.disconnect(); animations.forEach(animation => animation.cancel());
      elements.forEach(element => reveal(element, false)); body.style.overflow = '';
    };
    root.addEventListener('focusin', showFocused);
    motion.addEventListener('change', reduceMotion);
    return () => {
      observer?.disconnect(); animations.forEach(animation => animation.cancel());
      root.removeEventListener('focusin', showFocused); motion.removeEventListener('change', reduceMotion);
      elements.forEach(element => { delete element.dataset.articleReveal; delete element.dataset.articleDelay; });
      body.style.minHeight = ''; body.style.overflow = '';
    };
  }, [page, title]);

  useEffect(() => {
    if (!pending && requested.current) {
      requested.current = false;
      if (bodyRef.current) bodyRef.current.style.minHeight = '';
      setAnnouncement('');
    }
  }, [pending]);

  return <NavigationContext.Provider value={{ pending, navigate }}>
    <section ref={rootRef} id={id} className="tt-article-hub__section tt-article-motion" aria-labelledby={titleId} data-article-page={page} data-page-pending={pending || undefined}>
      <h2 id={titleId} tabIndex={-1}>{title}</h2>
      <div ref={bodyRef} className="tt-article-motion__body" aria-busy={pending}>{children}</div>
      {pagination}
      <span className="tt-article-motion__status" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </section>
  </NavigationContext.Provider>;
}
