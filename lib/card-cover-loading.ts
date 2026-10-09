// Keep native lazy loading during the initial render. After the user scrolls,
// request only covers within 800px of the viewport, using their existing srcset.
// One observer serves all cards; no gallery API calls or extra image elements.
const pending = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;
let scrolling = false;

function start() {
  scrolling = true;
  pending.forEach(element => observer?.observe(element));
}

export function observeCardCover(viewport: HTMLElement): () => void {
  if (!('IntersectionObserver' in window)) return () => {};
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        element.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach(image => {
          // Completed covers need no scheduling change. Offscreen requests
          // stay low priority, leaving visible images and page assets first.
          if (!image.complete && image.getBoundingClientRect().top >= window.innerHeight) image.fetchPriority = 'low';
          image.loading = 'eager';
        });
        observer?.unobserve(element);
      }
    }, { rootMargin: '800px 0px', threshold: 0 });
    window.addEventListener('scroll', start, { passive: true, once: true });
  }
  pending.add(viewport);
  if (scrolling) observer.observe(viewport);
  return () => {
    observer?.unobserve(viewport);
    pending.delete(viewport);
    if (pending.size === 0) {
      observer?.disconnect();
      observer = undefined;
      scrolling = false;
      window.removeEventListener('scroll', start);
    }
  };
}
