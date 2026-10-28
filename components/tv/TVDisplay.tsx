'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { responsiveImage } from '@/lib/image-delivery';
import { prepareTVImage, tvImage, tvPrice, TV_REFRESH_INTERVAL } from '@/lib/tv-images';
import { tvPages, tvNextPage } from '@/lib/tv-pages';
import type { TVCar, TVSnapshot, TVHotline, TVBrand } from '@/types/tv';
import TVHotlineNumbers from './TVHotlineNumbers';
import { TVAnniversaryBadge, TVAnniversaryTrim } from './TVAnniversary';
import { TVAnniversaryConfetti, TVAnniversarySlide, TVGratitude } from './TVAnniversaryExtras';
import { TV_ANNIVERSARY, waitForTVVisibleTime } from '@/lib/tv-anniversary';
import { defaultTVAnniversary, parseTVAnniversary, type TVAnniversarySettings } from '@/lib/tv-anniversary-settings';
import TVMusicPlayer from './TVMusicPlayer';
import { defaultTVMusic, parseTVMusic } from '@/lib/tv-music-settings';

type Batch = { snapshot: TVSnapshot; page: number; token: number };
type Slot = 0 | 1;

// Set to true to show the original price again on /TV.
const SHOW_ORIGINAL_PRICE = false;
// Shared by both locations, sized for the larger footer logo to avoid two candidates.
const TV_BRAND_IMAGE_SIZES = '(orientation: portrait) 10vw, 6.5vw';

function Icon({ kind }: { kind: 'year' | 'mileage' | 'fuel' | 'phone' }) {
  const paths = {
    year: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2m4 0h2"/></>,
    mileage: <><path d="M4 19a9 9 0 1 1 16 0H4Z"/><path d="m12 14 5-5M6 14h1m10 0h1M9 7l1 1"/><circle cx="12" cy="14" r="1"/></>,
    fuel: <><path d="M4 21V4h10v17M4 10h10M2 21h14m-2-10h2c2 0 2 2 2 3v3a2 2 0 0 0 4 0V9l-4-4m2 2v4h2"/></>,
    phone: <path d="M7 3 4 5c-2 2 1 8 4 11s9 6 11 4l2-3-5-3-2 2c-2-1-5-4-6-6l2-2-3-5Z"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

/** The masthead is independent of the two rotating car buffers. */
const TVMasthead = memo(function TVMasthead({ logoUrl, siteName, title, logoRef, brands, anniversary, eventConfig, children }: {
  logoUrl: string; siteName: string; title: string;
  anniversary: boolean;
  eventConfig: TVAnniversarySettings;
  logoRef: RefObject<HTMLImageElement | null>; brands: TVBrand[]; children: ReactNode;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const headingTextRef = useRef<HTMLHeadingElement>(null);
  const lastLogo = useRef(logoUrl);
  const logo = useMemo(() => responsiveImage(logoUrl, 'logo', '22vw'), [logoUrl]);
  useEffect(() => {
    if (lastLogo.current === logoUrl) return;
    lastLogo.current = logoUrl;
    const controller = new AbortController();
    if (logoRef.current) void prepareTVImage(logoRef.current, controller.signal);
    return () => controller.abort();
  }, [logoUrl, logoRef]);
  useEffect(() => {
    let live = true;
    const fit = () => {
      if (!live) return;
      for (const text of [headingTextRef.current]) {
        if (!text?.parentElement) continue;
        text.style.removeProperty('font-size');
        const width = text.clientWidth;
        if (width > 0 && text.scrollWidth > width) {
          const base = parseFloat(getComputedStyle(text).fontSize);
          text.style.fontSize = `${base * (width - 2) / text.scrollWidth}px`;
        }
      }
    };
    const observer = new ResizeObserver(fit);
    if (headingRef.current) observer.observe(headingRef.current);
    void document.fonts.ready.then(fit);
    return () => { live = false; observer.disconnect(); };
  }, [title, anniversary]);
  return <header className="tv-masthead">
    {anniversary && <><TVAnniversaryTrim position="header" silk={eventConfig.silk}/>{eventConfig.confetti && <TVAnniversaryConfetti/>}</>}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={logoRef} className="tv-logo" src={logo.src} srcSet={logo.srcSet} sizes={logo.sizes} alt={siteName}
      data-tv-original={logo.original} data-tv-fallback="/upload/photo/logo-tt-gold-6981.webp" />
    <div className="tv-heading" ref={headingRef}>{anniversary && <TVAnniversaryBadge sparkles={eventConfig.sparkles}/>}<h1 ref={headingTextRef}>{title}</h1><div className="tv-brand-ribbon">
      {/* Overlapping invisible labels size the ribbon to its widest brand without loading any images. */}
      {brands.map(brand => <div key={brand.slug} className="tv-brand-measure" data-logo={Boolean(brand.imageUrl)} aria-hidden="true">
        <strong>{brand.name}</strong></div>)}
      {children}</div></div>
    <div className="tv-qr"><span>Quét mã<br className="tv-qr__break"/> xem xe</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/TV/QR-xeluottoantrung.svg" alt="Quét mã QR để xem website Xe Lướt Toàn Trung" width="200" height="200"/>
    </div>
  </header>;
});

/** Keep the phone timer independent of the car buffers and their transitions. */
const TVHotlinePanel = memo(function TVHotlinePanel({ title, hotlines, seconds }: {
  title: string; hotlines: TVHotline[]; seconds: number;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const phoneKey = hotlines.map(contact => contact.phone).join('|');
  const phones = useMemo(() => phoneKey.split('|'), [phoneKey]);
  useEffect(() => {
    let live = true;
    const fit = () => {
      const text = titleRef.current;
      if (!live || !text) return;
      text.style.removeProperty('font-size');
      if (text.clientWidth > 0 && text.scrollWidth > text.clientWidth) {
        const base = parseFloat(getComputedStyle(text).fontSize);
        text.style.fontSize = `${base * (text.clientWidth - 2) / text.scrollWidth}px`;
      }
    };
    const observer = new ResizeObserver(fit);
    // Observe the fixed footer region, not the text's intrinsic flex width.
    const region = titleRef.current?.closest('.tv-hotline');
    if (region) observer.observe(region);
    void document.fonts.ready.then(fit);
    return () => { live = false; observer.disconnect(); };
  }, [title]);
  return <div className="tv-hotline"><span className="tv-hotline__icon"><Icon kind="phone"/></span>
    <div><span ref={titleRef}>{title}</span>
      <TVHotlineNumbers key={`${phoneKey}:${seconds}`} phones={phones} seconds={seconds}/></div>
  </div>;
});

function CarTile({ car }: { car: TVCar }) {
  const image = tvImage(car);
  const [, brand = '', model = ''] = /^(\S+)([\s\S]*)$/.exec(car.name.trim()) || [];
  const priced = car.price > 0;
  const discounted = priced && car.originalPrice !== null && car.originalPrice > car.price;
  const price = priced ? tvPrice(car.price) : 'Liên hệ';
  return <article className="tv-car" data-tv-card data-car-slug={car.slug}>
    <div className="tv-car__image">
      {/* Native responsive discovery; preparation waits for this actual image/decode. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} srcSet={image.srcSet} sizes={image.sizes} alt={car.name} decoding="async" loading="eager"
        data-tv-asset data-tv-original={image.original} data-tv-missing={car.cover ? undefined : 'true'} />
      <span className="tv-car__image-failed">Ảnh chưa sẵn sàng</span>
    </div>
    <div className="tv-car__content">
      <h2 title={car.name}><span><strong className="tv-car__brand">{brand}</strong>{model}</span></h2>
      <div className="tv-car__body">
        <dl className="tv-car__specs">
          <div><dt><Icon kind="year"/><span>Năm</span></dt><dd>{car.year || '—'}</dd></div>
          <div><dt><Icon kind="mileage"/><span>Odo</span></dt><dd>{car.mileage == null ? 'Chưa cập nhật' : `${car.mileage.toLocaleString('vi-VN')} km`}</dd></div>
          <div><dt><Icon kind="fuel"/><span>Nhiên liệu</span></dt><dd>{car.fuel}</dd></div>
        </dl>
        <div className={`tv-car__price${!priced || price.length > 6 ? ' tv-car__price--long' : ''}`}>
          {SHOW_ORIGINAL_PRICE && discounted && <del>{tvPrice(car.originalPrice!)} <span>triệu</span></del>}
          <strong>{price}</strong>{priced && <span>triệu đồng</span>}
        </div>
      </div>
    </div>
  </article>;
}

function Board({ batch, boardRef, active }: { batch: Batch; boardRef: RefObject<HTMLDivElement | null>; active: boolean }) {
  const cars = tvPages(batch.snapshot)[batch.page]?.cars || [];
  return <div ref={boardRef} className={`tv-board${active ? ' tv-board--active' : ''}`} data-token={batch.token}
    aria-hidden={!active} inert={!active}>
    <div className="tv-board__grid">{cars.map(car => <CarTile key={`${batch.token}:${car.slug}:${car.cover}`} car={car}/>)}</div>
  </div>;
}

function BrandBadge({ batch, badgeRef, active }: { batch: Batch; badgeRef: RefObject<HTMLDivElement | null>; active: boolean }) {
  const brand = tvPages(batch.snapshot)[batch.page]?.brand;
  const image = brand?.imageUrl ? responsiveImage(brand.imageUrl, 'logo', TV_BRAND_IMAGE_SIZES) : null;
  return <div ref={badgeRef} className={`tv-brand${active ? ' tv-brand--active' : ''}`} data-token={batch.token}
    data-brand-slug={brand?.slug} aria-hidden={!active} inert={!active}>
    {image && /* eslint-disable-next-line @next/next/no-img-element */
      <img key={`${brand!.slug}:${brand!.imageUrl}`} src={image.src} srcSet={image.srcSet} sizes={image.sizes} alt="" decoding="async" loading="eager"
        data-tv-brand-asset data-tv-original={image.original} data-tv-optional="true"/>}
    <strong>{brand?.name}</strong>
  </div>;
}

function BrandSummary({ batch, summaryRef, active }: { batch: Batch; summaryRef: RefObject<HTMLDivElement | null>; active: boolean }) {
  const page = tvPages(batch.snapshot)[batch.page];
  const brand = page?.brand;
  // Match the masthead candidate exactly so the browser can reuse its request/cache.
  const image = brand?.imageUrl ? responsiveImage(brand.imageUrl, 'logo', TV_BRAND_IMAGE_SIZES) : null;
  const count = page?.brandCarCount || 0;
  return <div ref={summaryRef} className={`tv-brand-summary${active ? ' tv-brand-summary--active' : ''}`}
    data-token={batch.token} data-brand-slug={brand?.slug} data-brand-count={count}
    aria-label={brand ? `${brand.name}: ${count} xe đang bán` : undefined} aria-hidden={!active} inert={!active}>
    <span className="tv-brand-summary__logo" data-has-logo={Boolean(image)}>
      {image && /* eslint-disable-next-line @next/next/no-img-element */
        <img key={`${brand!.slug}:${brand!.imageUrl}`} src={image.src} srcSet={image.srcSet} sizes={image.sizes} alt=""
          loading="eager" decoding="async" data-tv-brand-asset data-tv-original={image.original} data-tv-optional="true"/>}
    </span>
    <span className="tv-brand-summary__count"><strong>{count.toLocaleString('vi-VN')}</strong> xe đang bán</span>
  </div>;
}

export default function TVDisplay({ initial, unavailable = false }: { initial: TVSnapshot; unavailable?: boolean }) {
  const screenRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const firstBrandRef = useRef<HTMLDivElement>(null);
  const secondBrandRef = useRef<HTMLDivElement>(null);
  const firstSummaryRef = useRef<HTMLDivElement>(null);
  const secondSummaryRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const pending = useRef<TVSnapshot | null>(null);
  const eventImageReady = useRef<string | null>(null);
  const failedImageUrls = useRef(new Set<string>());
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [eventCursor, setEventCursor] = useState(0);
  const onEventImageReady = useCallback((url: string, status: 'loading' | 'ready' | 'failed') => {
    eventImageReady.current = status === 'ready' ? url : null;
    if (status === 'failed') { failedImageUrls.current.add(url); setFailedImages([...failedImageUrls.current]); }
  }, []);
  const [celebrating, setCelebrating] = useState(false);
  const [slots, setSlots] = useState<[Batch, Batch | null]>([{ snapshot: initial, page: 0, token: 0 }, null]);
  const [active, setActive] = useState<Slot>(0);
  const [ready, setReady] = useState(false);
  const [stale, setStale] = useState(unavailable);
  const [snapshot, setSnapshot] = useState(initial);
  const displayBrands = useMemo(() => [...new Map(tvPages(snapshot).map(item => [item.brand.slug, item.brand])).values()], [snapshot]);
  const eventConfig = snapshot.anniversary || defaultTVAnniversary;
  const eventSlides = eventConfig.slides.filter(item=>item.enabled && item.imageUrl && !failedImages.includes(item.imageUrl));
  const eventCandidate = eventSlides[eventCursor % eventSlides.length];
  useEffect(() => {
    // Retry failed photos at most once per existing snapshot refresh, not per
    // car/interlude. This also recovers after a temporary network outage.
    failedImageUrls.current.clear(); setFailedImages([]);
  }, [snapshot.updatedAt]);

  useEffect(() => {
    const screen = screenRef.current;
    const synchronize = () => { if (screen) screen.dataset.motionPaused = String(document.hidden); };
    synchronize();
    document.addEventListener('visibilitychange', synchronize);
    return () => document.removeEventListener('visibilitychange', synchronize);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let checking = false;
    const refresh = async () => {
      if (checking || document.hidden) { timer = setTimeout(refresh, TV_REFRESH_INTERVAL); return; }
      checking = true;
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 20_000);
      try {
        const response = await fetch('/api/tv', { cache: 'no-store', signal: request.signal });
        if (!response.ok) throw new Error('TV inventory unavailable');
        const data: TVSnapshot = await response.json();
        if (!Array.isArray(data.cars) || !Array.isArray(data.brands) || data.brands.some(brand => !brand?.slug || !brand.name) ||
          data.cars.some(car => !car?.brandSlug || !data.brands.some(brand => brand.slug === car.brandSlug)) ||
          !data.updatedAt || typeof data.logo !== 'string' || typeof data.title !== 'string' ||
          typeof data.hotlineTitle !== 'string' || (data.theme !== undefined && data.theme !== 'standard' && data.theme !== 'anniversary-4') ||
          !Array.isArray(data.hotlines) || !data.hotlines.length ||
          data.hotlines.some(item => !item || !/^\+?\d{9,12}$/.test(item.phone)) ||
          !Number.isInteger(data.carIntervalSeconds) || data.carIntervalSeconds < 5 || data.carIntervalSeconds > 300 ||
          !Number.isInteger(data.hotlineIntervalSeconds) || data.hotlineIntervalSeconds < 2 || data.hotlineIntervalSeconds > 120)
          throw new Error('Invalid TV snapshot');
        data.anniversary = parseTVAnniversary(data.anniversary);
        try { data.music = parseTVMusic(data.music); } catch { data.music = defaultTVMusic; }
        if (!controller.signal.aborted) { pending.current = data; setStale(false); }
      } catch { if (!controller.signal.aborted) setStale(true); }
      finally {
        clearTimeout(timeout); controller.signal.removeEventListener('abort', abort);
        checking = false; if (!controller.signal.aborted) timer = setTimeout(refresh, TV_REFRESH_INTERVAL);
      }
    };
    timer = setTimeout(refresh, TV_REFRESH_INTERVAL);
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const firstBatch: Batch = { snapshot: initial, page: 0, token: initialized.current ? ++sequence.current : 0 };
    if (initialized.current) {
      // Effects can restart after new server props or a development refresh.
      // Recreate the matching buffers instead of waiting forever for token 0.
      pending.current = null;
      setSlots([firstBatch, null]); setActive(0); setSnapshot(initial); setReady(false); setStale(unavailable); setCelebrating(false); setEventCursor(0);
    }
    initialized.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let animation: ReturnType<(typeof import('gsap'))['gsap']['timeline']> | undefined;
    const wait = (ms: number) => new Promise<void>(resolve => {
      const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
      timers.add(timer);
    });
    const boards = [firstRef, secondRef];
    const badges = [firstBrandRef, secondBrandRef];
    const summaries = [firstSummaryRef, secondSummaryRef];
    const gsapPromise = import('gsap').then(module => module.gsap).catch(() => null);
    let preparedLogo = initial.logo;
    const prepare = async (slot: Slot, batch: Batch) => {
      // React commits the staged board before loading/decode is checked.
      while (!signal.aborted && (boards[slot].current?.dataset.token !== String(batch.token) ||
        badges[slot].current?.dataset.token !== String(batch.token) || summaries[slot].current?.dataset.token !== String(batch.token))) await wait(16);
      if (signal.aborted) return;
      await Promise.all([...boards[slot].current!.querySelectorAll<HTMLImageElement>('img[data-tv-asset]'),
        ...badges[slot].current!.querySelectorAll<HTMLImageElement>('img[data-tv-brand-asset]'),
        ...summaries[slot].current!.querySelectorAll<HTMLImageElement>('img[data-tv-brand-asset]')]
        .map(image => prepareTVImage(image, signal)));
      if (!signal.aborted && batch.snapshot.logo !== preparedLogo) {
        const asset = responsiveImage(batch.snapshot.logo, 'logo', '22vw');
        const image = new Image();
        image.dataset.tvOriginal = asset.original;
        image.dataset.tvFallback = '/upload/photo/logo-tt-gold-6981.webp';
        if (asset.sizes) image.sizes = asset.sizes;
        if (asset.srcSet) image.srcset = asset.srcSet;
        image.src = asset.src;
        await prepareTVImage(image, signal);
        preparedLogo = batch.snapshot.logo;
      }
    };
    const run = async () => {
      let current = initial;
      let currentPage = 0;
      let slot: Slot = 0;
      let completedCarPages = 0;
      let tributeIndex = 0;
      await Promise.all([prepare(slot, firstBatch), document.fonts.ready,
        logoRef.current ? prepareTVImage(logoRef.current, signal) : Promise.resolve()]);
      if (signal.aborted) return;
      setReady(true);
      while (!signal.aborted) {
        const period = wait(current.carIntervalSeconds * 1000);
        let planned = pending.current || current;
        let nextPage = tvNextPage(current, currentPage, planned);
        const other: Slot = slot === 0 ? 1 : 0;
        const stage = async () => {
          const batch = { snapshot: planned, page: nextPage, token: ++sequence.current };
          setSlots(previous => { const copy = [...previous] as [Batch, Batch | null]; copy[other] = batch; return copy; });
          await prepare(other, batch);
        };
        if (nextPage !== currentPage || planned !== current) await stage();
        await period;
        while (!signal.aborted && document.hidden) await wait(1000);
        if (signal.aborted) return;
        if (pending.current && pending.current !== planned) {
          planned = pending.current; nextPage = tvNextPage(current, currentPage, planned); await stage();
        }
        // Interludes never enter tvPages()/tvNextPage() or consume a car index.
        // The outgoing car page remains underneath until the next is ready.
        let interlude = false;
        const event = current.anniversary || defaultTVAnniversary;
        const nextEvent = planned.anniversary || defaultTVAnniversary;
        const eligible = event.slides.filter(item=>item.enabled && item.imageUrl && !failedImageUrls.current.has(item.imageUrl));
        const candidate = eligible[tributeIndex % eligible.length];
        if (current.theme === 'anniversary-4' && planned.theme === 'anniversary-4' && event.slideEnabled && nextEvent.slideEnabled && current.cars.length) {
          completedCarPages = Math.min(completedCarPages + 1, event.pagesBetweenSlides);
          if (completedCarPages >= event.pagesBetweenSlides && candidate && eventImageReady.current === candidate.imageUrl) {
            completedCarPages = 0; interlude = true;
            flushSync(() => setCelebrating(true));
            await waitForTVVisibleTime(event.slideSeconds * 1000, signal);
            if (signal.aborted) return;
            // Refresh can finish during the interlude. Prepare that snapshot
            // before revealing cars, using the same existing page resolver.
            if (pending.current && pending.current !== planned) {
              planned = pending.current; nextPage = tvNextPage(current, currentPage, planned); await stage();
            }
            while (!signal.aborted && document.hidden) await wait(1000);
          }
        } else completedCarPages = 0;
        if (signal.aborted) return;
        const revealCars = async () => {
          if (!interlude) return;
          flushSync(() => setCelebrating(false));
          await waitForTVVisibleTime(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : TV_ANNIVERSARY.fadeMilliseconds, signal);
          if (!signal.aborted) { tributeIndex++; setEventCursor(tributeIndex); }
        };
        if (planned === current && nextPage === currentPage) { await revealCars(); continue; }
        if (signal.aborted) return;
        const incoming = boards[other].current!;
        const outgoing = boards[slot].current!;
        const gsap = await gsapPromise;
        if (signal.aborted) return;
        if (!interlude && gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await new Promise<void>(resolve => {
            animation = gsap.timeline({ onComplete: resolve });
            // Keep every slot stationary. The outgoing board stays opaque under
            // the fade, so neither a blank frame nor a vertical slide appears.
            animation.fromTo(incoming, { autoAlpha: 0, zIndex: 2 },
              { autoAlpha: 1, duration: .7, ease: 'power2.inOut' }, 0);
            const before = tvPages(current)[currentPage]?.brand;
            const after = tvPages(planned)[nextPage]?.brand;
            if (before?.slug !== after?.slug || before?.name !== after?.name || before?.imageUrl !== after?.imageUrl) {
              animation.fromTo(badges[other].current, { autoAlpha: 0, zIndex: 2 },
                { autoAlpha: 1, duration: .7, ease: 'power2.inOut' }, 0);
              animation.to(badges[slot].current, { autoAlpha: 0, duration: .7, ease: 'power2.inOut' }, 0);
            }
            if (before?.slug !== after?.slug || before?.imageUrl !== after?.imageUrl ||
              tvPages(current)[currentPage]?.brandCarCount !== tvPages(planned)[nextPage]?.brandCarCount) {
              animation.fromTo(summaries[other].current, { autoAlpha: 0, zIndex: 2 },
                { autoAlpha: 1, duration: .7, ease: 'power2.inOut' }, 0);
              animation.to(summaries[slot].current, { autoAlpha: 0, duration: .7, ease: 'power2.inOut' }, 0);
            }
          });
        }
        if (signal.aborted) return;
        const oldBadge = badges[slot].current;
        const oldSummary = summaries[slot].current;
        slot = other; current = planned; currentPage = nextPage;
        if (pending.current === planned) pending.current = null;
        flushSync(() => { setActive(slot); setSnapshot(current); });
        // Commit the active class before clearing opacity to avoid a blank frame.
        gsap?.set([outgoing, incoming, oldBadge, badges[slot].current, oldSummary, summaries[slot].current], { clearProps: 'opacity,visibility,zIndex' });
        await revealCars();
      }
    };
    void run().catch(() => { if (!signal.aborted) { setStale(true); setReady(true); } });
    return () => {
      controller.abort(); timers.forEach(clearTimeout); animation?.kill();
      for (const ref of [...boards, ...badges, ...summaries]) {
        for (const property of ['opacity', 'visibility', 'z-index']) ref.current?.style.removeProperty(property);
      }
    };
  }, [initial, unavailable]);

  const anniversary = snapshot.theme === 'anniversary-4';
  return <main className="tv-screen" data-theme={anniversary ? 'anniversary-4' : 'standard'} ref={screenRef}>
    <TVMusicPlayer music={snapshot.music} ready={ready && snapshot.cars.length > 0}/>
    <TVMasthead logoUrl={snapshot.logo} siteName={snapshot.siteName} title={snapshot.title}
      logoRef={logoRef} brands={displayBrands} anniversary={anniversary} eventConfig={eventConfig}>
      <BrandBadge batch={slots[0]} badgeRef={firstBrandRef} active={active === 0}/>
      {slots[1] && <BrandBadge batch={slots[1]} badgeRef={secondBrandRef} active={active === 1}/>}
    </TVMasthead>
    <section className="tv-stage" data-ready={ready} aria-label="Danh sách xe đang bán">
      <Board batch={slots[0]} boardRef={firstRef} active={active === 0}/>
      {slots[1] && <Board batch={slots[1]} boardRef={secondRef} active={active === 1}/>}
      {anniversary && eventConfig.slideEnabled && eventCandidate && <TVAnniversarySlide key={eventCandidate.imageUrl} slide={eventCandidate} visible={celebrating} onReady={onEventImageReady}/>}</section>
    {!ready && <div className="tv-preparing" role="status"><span/>Đang chuẩn bị hình ảnh và bảng giá…</div>}
    {ready && snapshot.cars.length === 0 && <div className="tv-empty"><strong>{stale ? 'Chưa tải được danh sách xe' : 'Danh sách xe đang được cập nhật'}</strong><p>{stale ? 'Màn hình sẽ tự kết nối lại.' : 'Vui lòng liên hệ hotline để được tư vấn.'}</p></div>}
    <footer className="tv-footer">
      {anniversary && <TVAnniversaryTrim position="footer"/>}
      <div className="tv-pagination">
        <div className="tv-brand-summaries">
          <BrandSummary batch={slots[0]} summaryRef={firstSummaryRef} active={active === 0}/>
          {slots[1] && <BrandSummary batch={slots[1]} summaryRef={secondSummaryRef} active={active === 1}/>}
        </div>
        {stale && <small>Kết nối gián đoạn · Dữ liệu lúc {new Date(snapshot.updatedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</small>}</div>
      <TVHotlinePanel title={snapshot.hotlineTitle} hotlines={snapshot.hotlines} seconds={snapshot.hotlineIntervalSeconds}/>
      {anniversary && eventConfig.gratitude && <TVGratitude messages={eventConfig.messages} seconds={eventConfig.messageSeconds} layoutKey={`${active}:${slots[active]?.token}:${snapshot.hotlineTitle}:${snapshot.hotlines.map(item => item.phone).join('|')}`}/>}
    </footer>
  </main>;
}
