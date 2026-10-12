'use client';

import { useEffect } from 'react';

/** Controls only the existing homepage markup; no requests or carousel clones. */
export default function HomeServicesMotion() {
  useEffect(() => {
    const section = document.querySelector<HTMLElement>('.tt-home-services');
    if (!section) return;
    const tabs = [...section.querySelectorAll<HTMLElement>('.cap1 [role="tab"]')];
    const panels = [...section.querySelectorAll<HTMLElement>(':scope > .dichvu[data-service]')];
    if (!tabs.length || panels.length !== tabs.length) return;
    const mobile = window.matchMedia('(max-width: 640px)');
    const desktop = window.matchMedia('(min-width: 1025px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = Math.max(0, tabs.findIndex(tab => tab.classList.contains('active')));
    let timer = 0;
    let settleTimer = 0;
    let animation: Animation | undefined;
    let stepAnimations: Animation[] = [];
    let entrancePlayed = false;
    let visible = false;
    let touching = false;
    let manualScrolling = false;
    let focusInContent = false;
    const interval = () => mobile.matches ? 2_000 : 3_000;
    let deadline = performance.now() + interval();
    const list = () => panels[active].querySelector<HTMLElement>('.tt-home-service-steps');
    const cards = () => [...list()?.querySelectorAll<HTMLElement>('.tt-home-service-step') || []];
    const cancelStepAnimations = () => {
      stepAnimations.forEach(effect => effect.cancel());
      stepAnimations = [];
    };
    const revealSteps = () => {
      cancelStepAnimations();
      if (!desktop.matches || reducedMotion.matches) return;
      // Animate existing cards once per entrance/change; no per-frame JS or layout animation.
      stepAnimations = cards().map((card, index) => card.animate([
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 440, delay: index * 90, fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)' }));
    };
    const onEntrance = (event: Event) => {
      if (entrancePlayed || event.target !== list() || !desktop.matches || reducedMotion.matches) return;
      entrancePlayed = true;
      revealSteps();
    };
    const currentStep = () => {
      const viewport = list();
      if (!viewport || !mobile.matches) return 0;
      const items = cards();
      const first = items[0]?.offsetLeft || 0;
      return items.reduce((best, card, index) =>
        Math.abs(card.offsetLeft - first - viewport.scrollLeft) < Math.abs(items[best].offsetLeft - first - viewport.scrollLeft) ? index : best, 0);
    };
    const updateStep = () => {
      section.dataset.activeStep = String(currentStep());
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (!visible || document.hidden || reducedMotion.matches || touching || focusInContent) return;
      timer = window.setTimeout(advance, Math.max(0, deadline - performance.now()));
    };
    const pause = () => {
      deadline = performance.now() + 5_000;
      schedule();
    };
    const select = (index: number, manual: boolean) => {
      animation?.cancel();
      cancelStepAnimations();
      const changed = index !== active;
      const direction = index >= active ? 1 : -1;
      active = index;
      tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === active);
        tab.setAttribute('aria-selected', String(i === active));
        tab.tabIndex = i === active ? 0 : -1;
        panels[i].hidden = i !== active;
      });
      if (changed) {
        // Reset the newly selected service without moving the surrounding page.
        list()?.scrollTo({ left: 0, behavior: 'instant' });
        if (!reducedMotion.matches) animation = panels[active].animate([
          { opacity: 0, transform: `translateX(${direction * 14}px)` },
          { opacity: 1, transform: 'translateX(0)' },
        ], { duration: 320, easing: 'cubic-bezier(.22,.61,.36,1)' });
        revealSteps();
      }
      updateStep();
      deadline = performance.now() + (manual ? 5_000 : interval());
      schedule();
    };
    function advance() {
      const viewport = list();
      const items = cards();
      const step = currentStep();
      if (mobile.matches && viewport && step < items.length - 1) {
        viewport.scrollTo({ left: items[step + 1].offsetLeft - items[0].offsetLeft, behavior: 'smooth' });
        deadline = performance.now() + interval();
        schedule();
      } else select((active + 1) % tabs.length, false);
    }
    const onClick = (event: MouseEvent) => {
      const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('.cap1 [role="tab"]') : null;
      if (!tab) return;
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      event.preventDefault();
      // The legacy document handler still owns tabs on the other service pages.
      event.stopPropagation();
      select(index, true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const index = tabs.indexOf(event.target as HTMLElement);
      if (index < 0) return;
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      select(next, true);
      tabs[next].focus();
    };
    const inList = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('.tt-home-service-steps'));
    const onTouchStart = (event: TouchEvent) => {
      if (!mobile.matches || !inList(event.target)) return;
      touching = true;
      manualScrolling = true;
      animation?.cancel();
      // Stop an in-progress automated scroll before letting native touch take over.
      const viewport = list();
      viewport?.scrollTo({ left: viewport.scrollLeft, behavior: 'instant' });
      window.clearTimeout(timer);
    };
    const onTouchEnd = () => {
      if (!touching) return;
      touching = false;
      pause();
      settleScroll();
    };
    const settleScroll = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (!touching) manualScrolling = false;
        updateStep();
        schedule();
      }, 120);
    };
    const onScroll = (event: Event) => {
      if (event.target !== list()) return;
      // Native inertia may finish after touchend; count the five seconds from rest.
      if (manualScrolling) deadline = performance.now() + 5_000;
      settleScroll();
    };
    const onWheel = (event: WheelEvent) => {
      if (mobile.matches && inList(event.target) && Math.abs(event.deltaX) > 0) {
        manualScrolling = true;
        pause();
        settleScroll();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      focusInContent = event.target instanceof Element && Boolean(event.target.closest('.dichvu'));
      if (focusInContent) { cancelStepAnimations(); schedule(); }
    };
    const onFocusOut = (event: FocusEvent) => {
      focusInContent = event.relatedTarget instanceof Element && section.contains(event.relatedTarget) && Boolean(event.relatedTarget.closest('.dichvu'));
      if (!focusInContent) pause();
    };
    const onViewportChange = () => {
      animation?.cancel();
      cancelStepAnimations();
      window.clearTimeout(settleTimer);
      list()?.scrollTo({ left: 0, behavior: 'instant' });
      touching = false;
      manualScrolling = false;
      updateStep();
      deadline = performance.now() + interval();
      schedule();
    };
    const onVisibility = () => {
      if (!document.hidden) deadline = Math.max(deadline, performance.now() + interval());
      schedule();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) deadline = Math.max(deadline, performance.now() + interval());
      schedule();
    }, { threshold: .15 });
    observer.observe(section);
    section.addEventListener('click', onClick);
    section.addEventListener('tt-home-services-enter', onEntrance);
    section.addEventListener('keydown', onKeyDown);
    section.addEventListener('touchstart', onTouchStart, { passive: true });
    section.addEventListener('touchend', onTouchEnd, { passive: true });
    section.addEventListener('touchcancel', onTouchEnd, { passive: true });
    section.addEventListener('wheel', onWheel, { passive: true });
    section.addEventListener('focusin', onFocusIn);
    section.addEventListener('focusout', onFocusOut);
    const lists = panels.flatMap(panel => [...panel.querySelectorAll<HTMLElement>('.tt-home-service-steps')]);
    lists.forEach(viewport => viewport.addEventListener('scroll', onScroll, { passive: true }));
    mobile.addEventListener('change', onViewportChange);
    desktop.addEventListener('change', onViewportChange);
    reducedMotion.addEventListener('change', onViewportChange);
    document.addEventListener('visibilitychange', onVisibility);
    updateStep();
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(settleTimer);
      animation?.cancel();
      cancelStepAnimations();
      section.removeEventListener('click', onClick);
      section.removeEventListener('tt-home-services-enter', onEntrance);
      section.removeEventListener('keydown', onKeyDown);
      section.removeEventListener('touchstart', onTouchStart);
      section.removeEventListener('touchend', onTouchEnd);
      section.removeEventListener('touchcancel', onTouchEnd);
      section.removeEventListener('wheel', onWheel);
      section.removeEventListener('focusin', onFocusIn);
      section.removeEventListener('focusout', onFocusOut);
      lists.forEach(viewport => viewport.removeEventListener('scroll', onScroll));
      mobile.removeEventListener('change', onViewportChange);
      desktop.removeEventListener('change', onViewportChange);
      reducedMotion.removeEventListener('change', onViewportChange);
      document.removeEventListener('visibilitychange', onVisibility);
      delete section.dataset.activeStep;
    };
  }, []);
  return null;
}
