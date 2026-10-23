'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { formatCarDiscount } from '@/lib/car-view';
import { isNewArrival } from '@/lib/car-new-arrival';
import MobileMenuIcon from './MobileMenuIcon';
import './buy-menu.css';

type Section = 'all' | 'new-arrivals' | 'discounts';
export type MenuCar = { slug: string; name: string; cover: string | null; price: number; originalPrice: number | null; createdAt?: string };
type Brand = { label: string; href?: string };
type CachedCars = { data?: MenuCar[]; expires: number; pending?: Promise<MenuCar[]> };
// Two bounded entries shared by both header variants. No request before a car
// tab opens; rapid tab switches and reopening reuse the same pending read.
const carReads = new Map<Exclude<Section, 'all'>, CachedCars>();
function readCars(section: Exclude<Section, 'all'>): Promise<MenuCar[]> {
  const old = carReads.get(section);
  if (old?.pending) return old.pending;
  if (old?.data && old.expires > Date.now()) return Promise.resolve(old.data);
  const entry: CachedCars = { expires: 0 };
  entry.pending = fetch(`/api/car-menu?section=${section}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then(async response => {
      if (!response.ok) throw Error('Menu cars unavailable');
      const result = await response.json() as { data: MenuCar[] };
      if (!Array.isArray(result.data)) throw Error('Invalid menu cars');
      entry.data = result.data.slice(0, 3);
      entry.expires = Date.now() + 30_000;
      return entry.data;
    }).finally(() => { entry.pending = undefined; });
  carReads.set(section, entry);
  return entry.pending;
}
const sections = [
  { key: 'all', label: 'Tất cả sản phẩm', icon: 'Tất cả sản phẩm' },
  { key: 'new-arrivals', label: 'Xe mới về', icon: 'Mua xe' },
  { key: 'discounts', label: 'Đang giảm giá', icon: 'Đang giảm giá' },
] as const;
const listingHref = (section: Section) => section === 'all' ? '/san-pham' : `/san-pham?${section === 'new-arrivals' ? 'xe-moi-ve' : 'dang-giam-gia'}=true`;
const money = new Intl.NumberFormat('vi-VN');

export default function BuyMenu({ brands, mobile = false, active = false, close, onOpen }: { brands: Brand[]; mobile?: boolean; active?: boolean; close: () => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>('all');
  const [cars, setCars] = useState<MenuCar[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLLIElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const pointerActive = useRef(false);
  const previousHeight = useRef<number | null>(null);
  const heightAnimation = useRef<Animation | null>(null);
  const id = useId();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => { pinned.current = false; setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open || mobile) return;
    const header = root.current?.closest('.wap_header');
    if (!header) return;
    const position = () => root.current?.style.setProperty('--tt-buy-top', `${header.getBoundingClientRect().bottom}px`);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(header);
    return () => observer.disconnect();
  }, [open, mobile]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) { pinned.current = false; setOpen(false); } };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { pinned.current = false; setOpen(false); trigger.current?.focus(); } };
    const releasePointer = () => { pointerActive.current = false; };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerup', releasePointer);
    document.addEventListener('pointercancel', releasePointer);
    return () => {
      pointerActive.current = false;
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerup', releasePointer); document.removeEventListener('pointercancel', releasePointer);
    };
  }, [open]);
  useEffect(() => {
    if (!open || section === 'all') return;
    let cancelled = false;
    setCars(null); setError(false);
    readCars(section).then(data => { if (!cancelled) setCars(data); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [open, section, retry]);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useLayoutEffect(() => {
    heightAnimation.current?.cancel();
    const panel = root.current?.querySelector<HTMLElement>('.tt-buy-panel');
    if (!panel || mobile) { previousHeight.current = null; return; }
    const height = panel.getBoundingClientRect().height;
    const old = previousHeight.current;
    previousHeight.current = height;
    if (old && Math.abs(old - height) > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      heightAnimation.current = panel.animate([{ height: `${old}px` }, { height: `${height}px` }], { duration: 220, easing: 'ease-out' });
    return () => heightAnimation.current?.cancel();
  }, [open, section, cars, error, mobile]);
  const cancelHover = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  const toggleMenu = () => {
    cancelHover();
    if (mobile) { if (!open) onOpen(); setOpen(value => !value); }
    else { pinned.current = !pinned.current; setOpen(pinned.current); }
  };
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      event.currentTarget.hasAttribute('download') || event.currentTarget.target && event.currentTarget.target !== '_self') return;
    event.preventDefault();
    cancelHover();
    // Start navigation before unmounting the link and its enclosing popup.
    router.push(event.currentTarget.getAttribute('href') || '/san-pham');
    pinned.current = false; setOpen(false); close();
  };
  const changeSection = (next: Section) => { if (next === section) return; setCars(null); setError(false); setSection(next); };
  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    changeSection(sections[next].key);
    root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const orderedBrands = ['Toyota', 'Honda', 'Ford', 'KIA', 'Vinfast', 'Mazda', 'Hyundai', 'Mitsubishi', 'Suzuki', 'Subaru', 'Lexus', 'BMW', 'Mercedes', 'Chevrolet', 'Peugeot', 'Nissan']
    .map(name => brands.find(brand => brand.label.trim().toLowerCase() === name.toLowerCase())).filter((brand): brand is Brand => !!brand);
  const columns = [orderedBrands.slice(0, 5), orderedBrands.slice(5, 10), orderedBrands.slice(10)];
  const visibleCars = section === 'new-arrivals' ? cars?.filter(car => isNewArrival(car.createdAt)) : cars;
  return <li ref={root} className={`tt-buy-menu has-submenu has-direct-link${open ? ' is-open' : ''}`}
    onPointerDownCapture={() => { pointerActive.current = true; cancelHover(); }}
    onPointerUpCapture={() => { pointerActive.current = false; }}
    onPointerCancelCapture={() => { pointerActive.current = false; }}
    onPointerEnter={event => { if (!mobile && event.pointerType === 'mouse') { cancelHover(); setOpen(true); } }}
    onPointerLeave={event => { if (!mobile && !pinned.current && !pointerActive.current && event.pointerType === 'mouse') { cancelHover(); hoverTimer.current = setTimeout(() => setOpen(false), 160); } }}
    // A touch browser may clear focus after pointerup but before its compatibility
    // click. A null destination must not unmount the link before activation.
    // Outside pointerdown and Escape already handle dismissal without a focus target.
    onBlur={event => { if (event.relatedTarget !== null && !pointerActive.current && !event.currentTarget.contains(event.relatedTarget)) { pinned.current = false; setOpen(false); } }}>
    <a ref={trigger} role="button" tabIndex={0} className={active || pathname === '/san-pham' || open ? 'active' : ''} aria-haspopup="true" aria-controls={id} aria-expanded={open}
      onClick={toggleMenu} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMenu(); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); if (mobile && !open) onOpen(); setOpen(true); }
      }}>
      {mobile && <MobileMenuIcon name="Mua xe" />}Mua xe
    </a>
    {mobile && <button type="button" className={`mobile-submenu-toggle${open ? ' is-expanded' : ''}`} aria-label="Danh sách mua xe" aria-controls={id} aria-expanded={open} onClick={() => { if (!open) onOpen(); setOpen(value => !value); }}><span className="mobile-menu-chevron" aria-hidden="true" /></button>}
    {open && <div id={id} className="tt-buy-panel" aria-label="Danh mục mua xe">
      <div className="tt-buy-tabs" role="tablist" aria-label="Khám phá xe">
        {sections.map((tab, index) => <button key={tab.key} id={`${id}-${tab.key}`} type="button" role="tab" aria-selected={section === tab.key} aria-controls={`${id}-content`} tabIndex={section === tab.key ? 0 : -1} onClick={() => changeSection(tab.key)} onKeyDown={event => tabKeys(event, index)}>
          <MobileMenuIcon name={tab.icon} inheritColor /><span>{tab.label}</span>
        </button>)}
        <Link prefetch={false} className="tt-buy-survey" href="/tien-ich/mua-xe-theo-nhu-cau" onClick={navigate}><MobileMenuIcon name="Mua xe theo nhu cầu" inheritColor /><span>Mua xe theo nhu cầu</span></Link>
      </div>
      <div key={section} id={`${id}-content`} className="tt-buy-content" role="tabpanel" aria-labelledby={`${id}-${section}`}>
        <div className="tt-buy-heading"><Link prefetch={false} href={listingHref(section)} onClick={navigate} aria-label={section === 'all' ? 'Xem tất cả sản phẩm' : section === 'new-arrivals' ? 'Xem tất cả xe mới về' : 'Xem tất cả xe đang giảm giá'}>Xem tất cả ›</Link></div>
        {section === 'all' ? <div className="tt-buy-brands">{columns.map((column, index) => <div key={index}>{column.map(brand => <Link prefetch={false} key={brand.href} href={brand.href || '/san-pham'} onClick={navigate} className={pathname === brand.href ? 'is-active' : ''}><span>{brand.label.trim()}</span><span aria-hidden="true">›</span></Link>)}</div>)}</div>
          :
            <div className="tt-buy-cars" aria-busy={cars === null && !error}>
              {error ? <div className="tt-buy-message" role="alert"><p>Chưa tải được xe. Vui lòng thử lại.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
                : cars === null ? <><span className="tt-buy-sr" role="status">Đang tải xe…</span>{[0, 1, 2].map(index => <div key={index} className="tt-buy-skeleton" aria-hidden="true"><div /><span /><span /></div>)}</>
                : !visibleCars?.length ? <p className="tt-buy-message">{section === 'discounts' ? 'Hiện chưa có xe đang giảm giá.' : 'Hiện chưa có xe mới về.'}</p>
                : visibleCars.map(car => <Link prefetch={false} key={car.slug} href={`/${car.slug}`} className="tt-buy-car" onClick={navigate}>
                  <div className="tt-buy-car-image"><ResponsiveImage profile="card" sizes={mobile ? '110px' : '(max-width: 1200px) 29vw, 310px'} src={car.cover || '/thumbs/90x90x2/assets/images/noimage.png'} alt={car.name} loading="lazy" decoding="async" /><span>{section === 'new-arrivals' ? 'Mới về' : formatCarDiscount(car.price, car.originalPrice)}</span></div>
                  <div className="tt-buy-car-copy"><h3>{car.name}</h3>{section === 'discounts' && car.originalPrice && <del>{money.format(car.originalPrice)} đ</del>}<strong>{car.price > 0 ? `${money.format(car.price)} đ` : 'Liên hệ'}</strong></div>
                </Link>)}
            </div>
          }
      </div>
      {!mobile && <Link prefetch={false} href={listingHref('new-arrivals')} className="tt-buy-banner" onClick={navigate} aria-label="Khám phá xe mới về"><ResponsiveImage src="/images/xe-moi-ve-menu-v1.webp" alt="Khám phá ngay xe mới về — Cập nhật liên tục những mẫu xe hot nhất" loading="lazy" decoding="async" /></Link>}
    </div>}
  </li>;
}
