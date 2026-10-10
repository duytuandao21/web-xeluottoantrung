'use client';
import ResponsiveImage from '@/components/common/ResponsiveImage';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getPublic } from '@/lib/public-client';
import { searchImage, searchResultsHref, type SearchSuggestions as Suggestions } from '@/lib/product-search';

const selector = '#keyword, input[data-product-search], input[type="search"]';
const popupId = 'tt-product-search-popup';
const listId = 'tt-product-search-options';
const empty: Suggestions = { keywords: [], items: [], total: 0 };
type SearchCutout = { left: number; top: number; right: number; bottom: number; radius: number; viewportWidth: number; viewportHeight: number };
const searchAnchorSelector = '.vehicle-search, .tt-accessory-filters__search, .tt-search-page__form, .search';
function headerBottomAt(viewportTop: number) {
  return [...document.querySelectorAll<HTMLElement>('.wap_header, .menu_mobi')].reduce((bottom, header) => {
    const rect = header.getBoundingClientRect();
    return rect.width && rect.height && rect.top <= viewportTop && getComputedStyle(header).visibility !== 'hidden'
      ? Math.max(bottom, rect.bottom) : bottom;
  }, viewportTop);
}
function backdropPath(cutout: SearchCutout) {
  const { left, top, right, bottom, radius: r, viewportWidth, viewportHeight } = cutout;
  return `path(evenodd, "M 0 0 H ${viewportWidth} V ${viewportHeight} H 0 Z
    M ${left + r} ${top} H ${right - r} A ${r} ${r} 0 0 1 ${right} ${top + r}
    V ${bottom - r} A ${r} ${r} 0 0 1 ${right - r} ${bottom}
    H ${left + r} A ${r} ${r} 0 0 1 ${left} ${bottom - r}
    V ${top + r} A ${r} ${r} 0 0 1 ${left + r} ${top} Z")`.replace(/\n\s*/g, ' ');
}
const optionId = (index: number) => `${listId}-${index}`;
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}
function TrendingIcon() {
  return <svg className="tt-search-suggestions__trending-icon" viewBox="-4 -2 148 184" fill="currentColor" aria-hidden="true">
    <path d="M84 3C80-1 75 1 70 5C45 24 40 42 54 58C58 68 52 76 43 76C33 76 30 68 32 60L37 48Q39 40 32 45C25 55 20 61 12 74C-2 95-3 116 5 135L25 114L39 128L81 87L73 80Q71 78 75 77L107 70Q111 69 109 74L101 104Q100 108 97 105L89 97L39 147L25 133L9 149C23 169 45 177 65 177C105 177 139 145 138 109C138 85 124 68 111 51C96 30 86 22 86 8Q87 4 84 3Z" />
  </svg>;
}

// Delegation also covers inputs in migrated HTML. A body portal avoids clipping.
export default function SearchSuggestions() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams().toString();
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [term, setTerm] = useState('');
  const [response, setResponse] = useState<{ term: string; data: Suggestions } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [cutout, setCutout] = useState<SearchCutout | null>(null);
  const [layerSize, setLayerSize] = useState<{ width: number; height: number; compact: boolean } | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const openingScroll = useRef<{ field: HTMLInputElement; x: number; y: number; height: number; time: number } | null>(null);
  const cancelRestore = useRef<(() => void) | null>(null);
  const lockedAnchor = useRef<{ node: HTMLElement; top: number; shift: number; position: string; previous: (readonly [string, string, string])[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef(-1);
  const data = response?.term === term && !composing ? response.data : empty;
  const keywordColumns = (position?.width || 0) >= 600 ? 3 : 2;
  const keywords = data.keywords.slice(0, term.trim() || layerSize?.compact ? keywordColumns * 2 : 8);
  const loading = !error && (response?.term !== term || composing);
  const latest = useRef({ data, term, keywords });
  latest.current = { data, term, keywords };
  const chooseActive = useCallback((index: number) => { activeRef.current = index; setActive(index); }, []);
  const dismiss = useCallback(() => { inputRef.current = null; setField(null); setPosition(null); setCutout(null); chooseActive(-1); }, [chooseActive]);
  const closeSearch = useCallback(() => {
    const input = inputRef.current;
    dismiss();
    input?.blur();
  }, [dismiss]);
  const chooseKeyword = useCallback((value: string) => {
    const input = inputRef.current;
    if (!input) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTerm(value); chooseActive(-1); input.focus({ preventScroll: true });
  }, [chooseActive]);

  useEffect(() => { dismiss(); }, [pathname, params, dismiss]);
  useEffect(() => () => cancelRestore.current?.(), []);
  useEffect(() => {
    const rememberScroll = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.matches(selector) && target !== inputRef.current) {
        cancelRestore.current?.();
        openingScroll.current = { field: target, x: window.scrollX, y: window.scrollY,
          height: window.visualViewport?.height || window.innerHeight, time: performance.now() };
      }
    };
    const open = (input: HTMLInputElement) => {
      cancelRestore.current?.();
      if (inputRef.current !== input && (openingScroll.current?.field !== input || performance.now() - openingScroll.current.time > 1500)) {
        openingScroll.current = { field: input, x: window.scrollX, y: window.scrollY,
          height: window.visualViewport?.height || window.innerHeight, time: performance.now() };
      }
      inputRef.current = input; setField(input); setTerm(input.value.slice(0, 120));
      setComposing(false); chooseActive(-1);
    };
    const inSearchAnchor = (target: EventTarget | null) => target instanceof Node &&
      (inputRef.current?.closest(searchAnchorSelector) || inputRef.current)?.contains(target);
    const focus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.matches(selector)) { open(target); return; }
      if (target instanceof Node && document.getElementById(popupId)?.contains(target)) return;
      if (inSearchAnchor(target)) return;
      dismiss();
    };
    const clickInput = (event: MouseEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(selector) && !inputRef.current) open(event.target);
      // Let the existing button/link receive its click before scroll restoration
      // moves the original form back to its pre-popup location.
      else if (event.target instanceof Element && event.target.closest('button, a') && inSearchAnchor(event.target)) closeSearch();
    };
    const input = (event: Event) => {
      if (event.target !== inputRef.current || (event instanceof InputEvent && event.isComposing)) return;
      setTerm(inputRef.current?.value.slice(0, 120) || ''); chooseActive(-1);
    };
    const compositionStart = (event: CompositionEvent) => { if (event.target === inputRef.current) setComposing(true); };
    const compositionEnd = (event: CompositionEvent) => { if (event.target === inputRef.current) { setComposing(false); input(event); } };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !inSearchAnchor(event.target) && !document.getElementById(popupId)?.contains(event.target)) closeSearch();
    };
    const key = (event: KeyboardEvent) => {
      if (event.target !== inputRef.current || !inputRef.current || event.isComposing || event.keyCode === 229) return;
      const { data: current, keywords: tags } = latest.current;
      const count = tags.length + current.items.length;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
        event.preventDefault(); event.stopPropagation();
        const index = activeRef.current < 0 ? (event.key === 'ArrowDown' ? 0 : count - 1)
          : (activeRef.current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
        chooseActive(index);
        requestAnimationFrame(() => document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' }));
      } else if (event.key === 'Enter') {
        if (activeRef.current >= 0 && activeRef.current < count) {
          event.preventDefault(); event.stopPropagation();
          if (activeRef.current < tags.length) chooseKeyword(tags[activeRef.current]);
          else { router.push(current.items[activeRef.current - tags.length].href); dismiss(); }
        } else dismiss(); // Existing search buttons and form submissions keep their behavior.
      }
    };
    document.addEventListener('focusin', focus); document.addEventListener('click', clickInput);
    document.addEventListener('pointerdown', rememberScroll, true);
    document.addEventListener('input', input); document.addEventListener('compositionstart', compositionStart);
    document.addEventListener('compositionend', compositionEnd); document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    // A visitor can focus the server-rendered field before React finishes loading.
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.matches(selector)) open(document.activeElement);
    return () => {
      document.removeEventListener('focusin', focus); document.removeEventListener('click', clickInput);
      document.removeEventListener('pointerdown', rememberScroll, true);
      document.removeEventListener('input', input); document.removeEventListener('compositionstart', compositionStart);
      document.removeEventListener('compositionend', compositionEnd); document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key, true);
    };
  }, [dismiss, closeSearch, chooseActive, chooseKeyword, router]);

  useLayoutEffect(() => {
    if (!field) return;
    const body = document.body;
    const root = document.documentElement;
    const original = openingScroll.current?.field === field ? openingScroll.current :
      { x: window.scrollX, y: window.scrollY, height: window.visualViewport?.height || window.innerHeight };
    openingScroll.current = null;
    const originalUrl = window.location.href;
    const anchor = field.closest(searchAnchorSelector) || field;
    const bounds = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const visibleTop = headerBottomAt(viewportTop) + 16;
    // Align on every opening before showing the backdrop and locking the page.
    if (Math.abs(bounds.top - visibleTop) > 1) {
      window.scrollTo({ left: window.scrollX, top: Math.max(0, window.scrollY + bounds.top - visibleTop), behavior: 'instant' });
    }
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - root.clientWidth;
    const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'];
    const previous = properties.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)] as const);
    const rootProperties = ['overflow', 'overscroll-behavior'];
    const previousRoot = rootProperties.map(name => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)] as const);
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    // Fixed body also locks page scrolling on iOS, preserving the current location.
    body.style.position = 'fixed'; body.style.top = `${-scrollY}px`; body.style.left = `${-scrollX}px`;
    body.style.width = '100%'; body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${padding + scrollbar}px`;
    root.style.overflow = 'hidden'; root.style.overscrollBehavior = 'none';
    const mobileAnchor = field.closest<HTMLElement>('.vehicle-search-row, .tt-accessory-filters__search-row') || anchor as HTMLElement;
    lockedAnchor.current = { node: mobileAnchor, top: parseFloat(getComputedStyle(mobileAnchor).top) || 0, shift: 0,
      position: getComputedStyle(mobileAnchor).position,
      previous: ['position', 'top', 'z-index'].map(name => [name, mobileAnchor.style.getPropertyValue(name), mobileAnchor.style.getPropertyPriority(name)] as const) };
    return () => {
      const savedAnchor = lockedAnchor.current;
      savedAnchor?.previous.forEach(([name, value, priority]) => value ? savedAnchor.node.style.setProperty(name, value, priority) : savedAnchor.node.style.removeProperty(name));
      lockedAnchor.current = null;
      previous.forEach(([name, value, priority]) => value ? body.style.setProperty(name, value, priority) : body.style.removeProperty(name));
      previousRoot.forEach(([name, value, priority]) => value ? root.style.setProperty(name, value, priority) : root.style.removeProperty(name));
      const restore = () => {
        if (!inputRef.current && window.location.href === originalUrl &&
          (Math.abs(window.scrollX - original.x) > .5 || Math.abs(window.scrollY - original.y) > .5)) {
          window.scrollTo({ left: original.x, top: original.y, behavior: 'instant' });
        }
      };
      restore();
      // Safari may finish keyboard panning after blur. Correct only after that
      // transition settles, and relinquish ownership on navigation/new input.
      const viewport = window.visualViewport;
      if (!window.matchMedia('(max-width: 767px)').matches || !viewport ||
        viewport.height >= original.height - 1 && Math.abs(viewport.offsetTop) < 1) return;
      let settled = 0, deadline = 0;
      const stop = () => {
        clearTimeout(settled); clearTimeout(deadline);
        viewport.removeEventListener('resize', changed); viewport.removeEventListener('scroll', changed);
        window.removeEventListener('resize', changed);
        for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown']) document.removeEventListener(name, stop, true);
        if (cancelRestore.current === stop) cancelRestore.current = null;
      };
      const changed = () => {
        clearTimeout(settled);
        settled = window.setTimeout(() => {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLElement && focused.isContentEditable)) restore();
          stop();
        }, 120);
      };
      cancelRestore.current?.(); cancelRestore.current = stop;
      viewport.addEventListener('resize', changed); viewport.addEventListener('scroll', changed);
      window.addEventListener('resize', changed);
      for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown']) document.addEventListener(name, stop, { capture: true, passive: true });
      deadline = window.setTimeout(stop, 1500);
    };
  }, [field]);

  useLayoutEffect(() => {
    if (!field) return;
    let frame = 0;
    let trackUntil = performance.now() + 1000;
    const update = () => {
      frame = 0;
      if (!field.isConnected) { dismiss(); return; }
      const layer = layerRef.current;
      if (!layer) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      const mobileAnchor = window.innerWidth <= 767 ? field.closest('.vehicle-search-row, .tt-accessory-filters__search-row') : null;
      const searchAnchor = field.closest(searchAnchorSelector) || field;
      const anchor = mobileAnchor || searchAnchor;
      // Keep the document frozen. Only the original search row follows the
      // visible viewport; its footprint and the desktop layout stay unchanged.
      const savedAnchor = lockedAnchor.current;
      if (mobile && savedAnchor) {
        const targetTop = headerBottomAt(viewportTop) + 16;
        const baseTop = searchAnchor.getBoundingClientRect().top - savedAnchor.shift;
        const shift = targetTop - baseTop;
        if (savedAnchor.position === 'static') savedAnchor.node.style.position = 'relative';
        savedAnchor.node.style.zIndex = '10061';
        if (Math.abs(shift - savedAnchor.shift) > .5) {
          savedAnchor.node.style.top = `${savedAnchor.top + shift}px`; savedAnchor.shift = shift;
        }
      } else if (savedAnchor) {
        savedAnchor.previous.forEach(([name, value, priority]) => value ? savedAnchor.node.style.setProperty(name, value, priority) : savedAnchor.node.style.removeProperty(name));
        savedAnchor.shift = 0;
      }
      const bounds = anchor.getBoundingClientRect();
      const searchBounds = searchAnchor.getBoundingClientRect();
      const oldOrigin = layer.getBoundingClientRect();
      // Measure the fixed layer's actual origin, including WebKit viewport
      // panning, before converting viewport coordinates into layer coordinates.
      layer.style.left = mobile ? `${viewportLeft - oldOrigin.left + (parseFloat(layer.style.left) || 0)}px` : '';
      layer.style.top = mobile ? `${viewportTop - oldOrigin.top + (parseFloat(layer.style.top) || 0)}px` : '';
      const origin = layer.getBoundingClientRect();
      const layerWidth = mobile ? viewportWidth : Math.max(window.innerWidth, viewportRight - origin.left);
      const layerHeight = mobile ? viewportHeight : Math.max(window.innerHeight, viewportBottom - origin.top);
      const compact = mobile && viewportHeight <= 500;
      const width = Math.min(bounds.width, viewportWidth - 24);
      const left = Math.max(viewportLeft + 12, Math.min(bounds.left, viewportRight - width - 12));
      const top = bounds.bottom + 8;
      const radius = parseFloat(getComputedStyle(searchAnchor).borderTopLeftRadius) || parseFloat(getComputedStyle(field).borderTopLeftRadius) || 10;
      const nextCutout = { left: searchBounds.left - origin.left - 5, top: searchBounds.top - origin.top - 5,
        right: searchBounds.right - origin.left + 5, bottom: searchBounds.bottom - origin.top + 5,
        radius: Math.min(radius + 5, (searchBounds.height + 10) / 2, (searchBounds.width + 10) / 2),
        viewportWidth: layerWidth, viewportHeight: layerHeight };
      const nextPosition = { left: left - origin.left, top: top - origin.top, width,
        maxHeight: Math.max(0, Math.min(720, viewportBottom - top - 12)) };
      setLayerSize(current => current?.width === layerWidth && current.height === layerHeight && current.compact === compact ? current : { width: layerWidth, height: layerHeight, compact });
      setCutout(current => current && Object.keys(nextCutout).every(key => current[key as keyof SearchCutout] === nextCutout[key as keyof SearchCutout]) ? current : nextCutout);
      setPosition(current => current && Object.keys(nextPosition).every(key => current[key as keyof typeof nextPosition] === nextPosition[key as keyof typeof nextPosition]) ? current : nextPosition);
      if (performance.now() < trackUntil) frame = requestAnimationFrame(update);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && document.getElementById(popupId)?.contains(event.target)) return;
      schedule();
    };
    const viewportChanged = () => { trackUntil = performance.now() + 500; schedule(); };
    const resize = new ResizeObserver(schedule); resize.observe(field); resize.observe(document.body); update();
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('scroll', viewportChanged);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', viewportChanged); window.visualViewport?.removeEventListener('scroll', viewportChanged);
    };
  }, [field, dismiss]);

  useLayoutEffect(() => {
    if (!field) return;
    const anchor = field.closest<HTMLElement>('.vehicle-search-row, .tt-accessory-filters__search-row') ||
      field.closest<HTMLElement>(searchAnchorSelector) || field;
    const hadGuardClass = anchor.classList.contains('tt-search-anchor--open');
    anchor.classList.add('tt-search-anchor--open');
    let gesture: { target: Node; x: number; y: number; lastY: number } | null = null;
    const start = (event: TouchEvent) => {
      gesture = null;
      if (inputRef.current !== field || !window.matchMedia('(max-width: 767px)').matches ||
        event.touches.length !== 1 || !(event.target instanceof Node)) return;
      const touch = event.touches[0];
      gesture = { target: event.target, x: touch.clientX, y: touch.clientY, lastY: touch.clientY };
    };
    const move = (event: TouchEvent) => {
      if (!gesture || inputRef.current !== field || !window.matchMedia('(max-width: 767px)').matches) return;
      if (event.touches.length !== 1) { gesture = null; return; }
      const touch = event.touches[0];
      const delta = gesture.lastY - touch.clientY;
      gesture.lastY = touch.clientY;
      const distance = Math.abs(touch.clientY - gesture.y);
      // Preserve taps, long presses, horizontal caret gestures and pinch zoom.
      // Vertical swipes on the original field must not pan Safari's viewport.
      if (distance < 4 || distance <= Math.abs(touch.clientX - gesture.x) || !delta) return;
      const target = gesture.target instanceof Element ? gesture.target : gesture.target.parentElement;
      const list = document.getElementById(popupId)?.contains(target) ? target?.closest<HTMLElement>(`#${listId}`) : null;
      const max = list ? Math.max(0, list.scrollHeight - list.clientHeight) : 0;
      const top = list ? Math.max(0, Math.min(max, list.scrollTop)) : 0;
      // CSS containment is insufficient on affected iOS versions. Only cancel
      // moves that would leave this scroller; consume any remaining valid distance.
      if ((!list || max <= 1 || top + delta < 0 || top + delta > max) && event.cancelable) {
        event.preventDefault();
        if (list && max > 1) list.scrollTop = Math.max(0, Math.min(max, top + delta));
      }
    };
    const end = () => { gesture = null; };
    // The original search row is outside the body portal. Capture only while
    // open so gestures there (including the backdrop cutout) are covered too.
    document.addEventListener('touchstart', start, { capture: true, passive: true });
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', end, true); document.addEventListener('touchcancel', end, true);
    return () => {
      document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true); document.removeEventListener('touchcancel', end, true);
      if (!hadGuardClass) anchor.classList.remove('tt-search-anchor--open');
    };
  }, [field]);

  useEffect(() => {
    setResponse(null); setError(false); chooseActive(-1);
    if (!field || composing) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let disposed = false;
    const timer = window.setTimeout(() => {
      void getPublic<Suggestions>(`/search/suggestions?${new URLSearchParams({ q: term.trim().slice(0, 120) })}`, { signal: controller.signal, cache: 'no-store' })
        .then(result => { if (!disposed) setResponse({ term, data: { ...result, items: result.items.slice(0, 5) } }); })
        .catch(() => { if (!disposed) setError(true); })
        .finally(() => { if (!disposed) window.clearTimeout(timeout); });
    }, term.trim() ? 160 : 0);
    return () => { disposed = true; window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort(); };
  }, [field, term, retry, composing, chooseActive]);

  useEffect(() => {
    if (!field) return;
    const attributes = ['role', 'autocomplete', 'aria-autocomplete', 'aria-controls', 'aria-expanded', 'aria-activedescendant', 'aria-haspopup'];
    const previous = attributes.map(name => [name, field.getAttribute(name)] as const);
    field.setAttribute('role', 'combobox'); field.setAttribute('autocomplete', 'off');
    field.setAttribute('aria-autocomplete', 'list'); field.setAttribute('aria-controls', listId);
    field.setAttribute('aria-haspopup', 'listbox'); field.setAttribute('aria-expanded', 'true');
    return () => previous.forEach(([name, value]) => value === null ? field.removeAttribute(name) : field.setAttribute(name, value));
  }, [field]);
  useEffect(() => {
    if (!field) return;
    if (active < 0) field.removeAttribute('aria-activedescendant'); else field.setAttribute('aria-activedescendant', optionId(active));
  }, [active, field]);

  if (!field) return null;
  const hasQuery = Boolean(term.trim());
  // Leave the original search field clear and clickable through the backdrop.
  const backdropClip = cutout ? backdropPath(cutout) : undefined;
  return createPortal(<div ref={layerRef} className={`tt-search-layer${layerSize?.compact ? ' tt-search-layer--compact' : ''}`} style={{ width: layerSize?.width, height: layerSize?.height }}>
  {position && cutout && <><div className="tt-search-backdrop" style={{ clipPath: backdropClip }} aria-hidden="true"
    // Keep the backdrop mounted through pointerup; consume the click before
    // restoring page scroll so the same tap cannot reach a background action.
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onClick={event => { event.preventDefault(); event.stopPropagation(); closeSearch(); }} />
  <section id={popupId} className="tt-search-suggestions" style={position} aria-label="Gợi ý tìm kiếm">
    <div className="tt-search-suggestions__heading"><TrendingIcon /><span>Tìm kiếm thịnh hành</span>
      <button type="button" aria-label="Đóng gợi ý tìm kiếm" onClick={closeSearch}>×</button>
    </div>
    <div className="tt-search-suggestions__options" id={listId} role="listbox" aria-label="Gợi ý từ khóa và sản phẩm" aria-busy={loading}>
      {loading ? <p className="tt-search-suggestions__message" role="status"><span className="tt-search-suggestions__spinner" />Đang tìm kiếm...</p>
        : error ? <div className="tt-search-suggestions__message" role="alert">Chưa thể tải gợi ý. <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
        : <>
          {keywords.length ? <div className="tt-search-suggestions__tags" style={{ gridTemplateColumns: `repeat(${keywordColumns}, minmax(0, 1fr))` }} role="group" aria-label="Từ khóa liên quan">
            {keywords.map((keyword, index) => <button key={keyword} id={optionId(index)} type="button" role="option" aria-selected={index === active}
              className={`tt-search-suggestions__keyword${index === active ? ' is-active' : ''}`} onMouseEnter={() => chooseActive(index)} onClick={() => chooseKeyword(keyword)} title={keyword}><span>{keyword}</span></button>)}
          </div> : <p className="tt-search-suggestions__tag-empty">{hasQuery ? 'Chưa có từ khóa liên quan.' : 'Nhập tên xe hoặc phụ kiện để tìm kiếm.'}</p>}
          <div className="tt-search-suggestions__product-heading" role="presentation"><SearchIcon /><span>Gợi ý sản phẩm</span></div>
          {data.items.length ? hasQuery ? data.items.map((item, index) => <Link key={`${item.kind}:${item.id}`} id={optionId(keywords.length + index)} href={item.href} prefetch={false}
          role="option" aria-selected={keywords.length + index === active} className={`tt-search-suggestions__product${keywords.length + index === active ? ' is-active' : ''}`} onMouseEnter={() => chooseActive(keywords.length + index)} onClick={dismiss}>
          <ResponsiveImage profile="thumbnail" src={searchImage(item.imageUrl)} alt="" sizes="64px" width="64" height="48" decoding="async" onError={event => {
            const image = event.currentTarget;
            if (image.src !== new URL(searchImage(null), location.origin).href) image.src = searchImage(null);
          }} />
          <span title={item.name}>{item.name}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </Link>) : <div className="tt-search-suggestions__recommendations" style={{ gridTemplateColumns: `repeat(${(position.width >= 600) ? 4 : 2}, minmax(0, 1fr))` }} role="group" aria-label="Xe và phụ kiện được gợi ý">
          {data.items.map((item, index) => <Link key={`${item.kind}:${item.id}`} id={optionId(keywords.length + index)} href={item.href} prefetch={false}
            role="option" aria-selected={keywords.length + index === active} className={`tt-search-suggestions__card${keywords.length + index === active ? ' is-active' : ''}`} onMouseEnter={() => chooseActive(keywords.length + index)} onClick={dismiss}>
            <div className="tt-search-suggestions__card-image"><ResponsiveImage profile="card" src={searchImage(item.imageUrl)} alt="" sizes="(max-width:600px) calc((100vw - 60px) / 2), 320px" width="240" height="150" decoding="async" onError={event => {
              const image = event.currentTarget;
              if (image.src !== new URL(searchImage(null), location.origin).href) image.src = searchImage(null);
            }} /><span>{item.kind === 'car' ? 'Ô tô' : 'Phụ kiện'}</span></div>
            <strong>{Number(item.price).toLocaleString('vi-VN')} đ</strong><span className="tt-search-suggestions__card-name" title={item.name}>{item.name}</span>
          </Link>)}
        </div> : <p className="tt-search-suggestions__message" role="status">{hasQuery ? 'Không có kết quả phù hợp.' : 'Sản phẩm đang được cập nhật.'}</p>}
        </>}
    </div>
    {hasQuery && !loading && !error && data.items.length > 0 && <Link className="tt-search-suggestions__all" href={searchResultsHref(term)} prefetch={false} onClick={dismiss}>Xem tất cả kết quả <span aria-hidden="true">→</span></Link>}
  </section></>}
  </div>, document.body);
}
