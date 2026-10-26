import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Every selector, trigger and focus listener belongs to this one route instance. */
export function mountAboutStoryMotion(root: HTMLElement): () => void {
  const match = gsap.matchMedia();
  const context = gsap.context(() => {
    match.add({
      desktop: '(min-width: 901px) and (hover: hover) and (pointer: fine)',
      gallery: '(min-width: 901px) and (min-height: 740px) and (hover: hover) and (pointer: fine)',
      mobile: '(max-width: 900px), (hover: none), (pointer: coarse)',
      reduced: '(prefers-reduced-motion: reduce)',
    }, conditions => {
      if (conditions.conditions?.reduced) {
        root.removeAttribute('data-motion');
        return;
      }
      const desktop = Boolean(conditions.conditions?.desktop);
      root.dataset.motion = 'on';
      const focusedCleanup: Array<() => void> = [];

      const hero = root.querySelector<HTMLElement>('.tt-story__hero');
      const heroLines = hero?.querySelectorAll<HTMLElement>('h1, .tt-story__hero-lead, .tt-story__hero-body, .tt-story__hero-cta, .tt-story__hero-facts');
      if (hero && heroLines?.length) {
        // The text remains readable even if the enhancement arrives after first paint.
        gsap.fromTo(heroLines, { y: 22, opacity: 0.84 }, { y: 0, opacity: 1, duration: 0.8,
          stagger: 0.12, ease: 'power2.out', clearProps: 'transform,opacity' });
        const image = hero.querySelector<HTMLImageElement>('.tt-story__hero-picture img');
        const shade = hero.querySelector<HTMLElement>('.tt-story__hero-shade');
        if (image) gsap.fromTo(image, { scale: 1 }, { scale: 1.075, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
        if (shade) gsap.fromTo(shade, { opacity: 1 }, { opacity: 0.9, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      }

      root.querySelectorAll<HTMLElement>('.tt-story__timeline').forEach(timeline => {
        gsap.fromTo(timeline, { '--story-progress': 0 }, { '--story-progress': 1, ease: 'none',
          scrollTrigger: { trigger: timeline, start: 'top 65%', end: 'bottom 55%', scrub: true } });
      });
      root.querySelectorAll<HTMLElement>('.tt-story__milestone').forEach(item => {
        const text = item.querySelector<HTMLElement>('.tt-story__milestone-text');
        const media = item.querySelector<HTMLElement>('.tt-story__milestone-media');
        ScrollTrigger.create({ trigger: item, start: 'top 62%', end: 'bottom 43%',
          onToggle: self => item.classList.toggle('tt-story__milestone--active', self.isActive) });
        if (text) gsap.fromTo(text, { x: desktop ? 28 : 0, y: desktop ? 0 : 12, opacity: 0.76 },
          { x: 0, y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: item,
            start: 'top 86%', end: 'top 48%', scrub: true } });
        if (media) gsap.fromTo(media, { y: desktop ? 26 : 12, opacity: 0.78 },
          { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: item,
            start: 'top 85%', end: 'top 45%', scrub: true } });
      });

      const storySection = root.querySelector<HTMLElement>('.tt-story__stories');
      const storyViewport = storySection?.querySelector<HTMLElement>('.tt-story__story-viewport');
      const storyGrid = storySection?.querySelector<HTMLElement>('.tt-story__story-grid--sequence');
      const storyCards = storyGrid ? [...storyGrid.querySelectorAll<HTMLElement>('.tt-story__story-card')] : [];
      // A restored scroll position or deep link must not acquire pin spacing after paint.
      const storyTop = storySection ? storySection.getBoundingClientRect().top + window.scrollY : Infinity;
      const alreadyNearStories = window.scrollY >= storyTop - window.innerHeight * 1.2 ||
        window.location.hash.startsWith('#tt-story-stories');
      if (conditions.conditions?.gallery && !alreadyNearStories && storySection && storyViewport && storyGrid && storyCards.length > 1) {
        const travel = () => Math.max(0, storyGrid.scrollWidth - storyViewport.clientWidth);
        if (travel() > 80 && storyViewport.offsetHeight < window.innerHeight - 100) {
          storyViewport.dataset.pinned = 'true';
          focusedCleanup.push(() => storyViewport.removeAttribute('data-pinned'));
          const tween = gsap.to(storyGrid, { x: () => -travel(), ease: 'none',
            scrollTrigger: { trigger: storyViewport, pin: storyViewport, start: 'top 80px',
              end: () => `+=${Math.max(300, travel())}`, scrub: 0.55, invalidateOnRefresh: true } });
          const trigger = tween.scrollTrigger;
          const onFocus = (event: FocusEvent) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>('.tt-story__story-card');
            const index = card ? storyCards.indexOf(card) : -1;
            if (trigger && index >= 0) trigger.scroll(trigger.start +
              (storyCards.length === 1 ? 0 : index / (storyCards.length - 1)) * (trigger.end - trigger.start));
          };
          storySection.addEventListener('focusin', onFocus);
          focusedCleanup.push(() => storySection.removeEventListener('focusin', onFocus));
        }
      }

      const collage = root.querySelectorAll<HTMLElement>('.tt-story__collage figure');
      collage.forEach((figure, index) => gsap.fromTo(figure, { y: desktop ? 42 + index * 12 : 18,
        x: desktop ? (index % 2 ? 20 : -20) : 0, opacity: 0.72 },
      { x: 0, y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
        scrollTrigger: { trigger: figure, start: 'top 88%', toggleActions: 'play none none reverse' } }));

      const future = root.querySelector<HTMLElement>('.tt-story__future');
      const futureCopy = future?.querySelector<HTMLElement>('.tt-story__future-copy');
      const futureImage = future?.querySelector<HTMLImageElement>('.tt-story__future-media img');
      if (futureCopy) gsap.fromTo(futureCopy, { y: 24, opacity: 0.76 },
        { y: 0, opacity: 1, duration: 0.85, ease: 'power2.out',
          scrollTrigger: { trigger: future, start: 'top 82%', toggleActions: 'play none none reverse' } });
      if (futureImage) gsap.fromTo(futureImage, { scale: 1.08 }, { scale: 1, ease: 'none',
        scrollTrigger: { trigger: future, start: 'top 90%', end: 'center 45%', scrub: true } });

      requestAnimationFrame(() => { if (root.isConnected) ScrollTrigger.refresh(); });
      return () => {
        focusedCleanup.forEach(cleanup => cleanup());
        root.querySelectorAll('.tt-story__milestone--active').forEach(item => item.classList.remove('tt-story__milestone--active'));
        root.removeAttribute('data-motion');
      };
    });
  }, root);

  return () => { match.revert(); context.revert(); root.removeAttribute('data-motion'); };
}
