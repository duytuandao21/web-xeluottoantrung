'use client';
import ResponsiveImage from '@/components/common/ResponsiveImage';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { getPublic } from '@/lib/public-client';
import type { CarDetail } from '@/lib/public-api';
import { formatCarPrice } from '@/lib/car-view';

const STORAGE_KEY = 'tt-car-comparison';
type Selection = { slug: string; name: string; image: string };
type Result = { car?: CarDetail; error?: boolean };
const fallbackImage = '/thumbs/90x90x2/assets/images/noimage.png';
const text = (value: unknown) => value === null || value === undefined || value === '' ? 'Chưa cập nhật' : String(value);

function comparisonRows(cars: CarDetail[]) {
  const rows: { label: string; values: string[] }[] = [
    { label: 'Giá', values: cars.map(car => formatCarPrice(car.price)) },
    { label: 'Hãng xe', values: cars.map(car => text(car.brand?.name)) },
    { label: 'Dòng xe', values: cars.map(car => text(car.model?.name)) },
    { label: 'Phiên bản', values: cars.map(car => text(car.version)) },
    { label: 'Năm sản xuất', values: cars.map(car => text(car.year)) },
    { label: 'ODO', values: cars.map(car => car.mileage == null ? 'Chưa cập nhật' : `${car.mileage.toLocaleString('vi-VN')} km`) },
    { label: 'Nhiên liệu', values: cars.map(car => text(car.fuel)) },
    { label: 'Hộp số', values: cars.map(car => text(car.transmission)) },
    { label: 'Số ghế', values: cars.map(car => text(car.seatCount)) },
    { label: 'Kiểu dáng', values: cars.map(car => text(car.bodyType)) },
    { label: 'Màu ngoại thất', values: cars.map(car => text(car.color)) },
    { label: 'Showroom', values: cars.map(car => text(car.branch?.name)) },
    { label: 'Tình trạng', values: cars.map(car => car.status === 'sold' ? 'Đã bán' : car.status === 'deposit' ? 'Đã nhận cọc' : 'Đang bán') },
  ];
  const seen = new Set(rows.map(row => row.label.toLocaleLowerCase('vi')));
  for (const car of cars) for (const spec of car.specifications || []) {
    const label = spec.label.trim();
    const normalized = label.toLocaleLowerCase('vi');
    // Plate information stays in the authenticated sale flow.
    if (!label || seen.has(normalized) || /biển số|license|plate/i.test(`${label} ${spec.key}`)) continue;
    seen.add(normalized);
    rows.push({ label, values: cars.map(item => text(item.specifications?.find(value => value.key === spec.key || value.label.trim().toLocaleLowerCase('vi') === normalized)?.value)) });
  }
  return rows;
}

export default function CarComparison() {
  const pathname = usePathname();
  const query = useSearchParams();
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const selectedRef = useRef(selected);
  const enabledRef = useRef(enabled);
  const dialogRef = useRef<HTMLDivElement>(null);

  const updateSelection = (next: Selection[]) => { selectedRef.current = next; setSelected(next); setMessage(''); };
  const updateEnabled = (value: boolean) => { enabledRef.current = value; setEnabled(value); setMessage(''); if (!value) setOpen(false); };

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && Array.isArray(stored.selected)) {
        const unique = new Set<string>();
        const valid = stored.selected.filter((item: Selection) => {
          if (!item || typeof item.slug !== 'string' || !item.slug || typeof item.name !== 'string' || typeof item.image !== 'string' || unique.has(item.slug)) return false;
          unique.add(item.slug); return true;
        }).slice(0, 2);
        updateSelection(valid);
        updateEnabled(stored.enabled === true);
      }
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, selected })); } catch { /* Storage is optional. */ }
  }, [ready, enabled, selected]);

  useEffect(() => {
    setOpen(false);
    setMessage('');
    const sync = () => {
      const exists = !!document.querySelector('.c_sosanh');
      setAvailable(exists);
      document.body.classList.toggle('ss', exists && enabledRef.current);
      document.querySelectorAll<HTMLElement>('.c_sosanh').forEach(element => {
        element.setAttribute('role', 'switch');
        element.setAttribute('aria-label', 'Chọn xe để so sánh');
        element.setAttribute('aria-checked', String(enabledRef.current));
        element.tabIndex = 0;
      });
      document.querySelectorAll<HTMLElement>('.id_ss').forEach(element => {
        const active = selectedRef.current.some(item => item.slug === element.dataset.id);
        element.classList.toggle('id_ss_active', active);
        element.setAttribute('aria-pressed', String(active));
        element.setAttribute('aria-label', `${active ? 'Bỏ' : 'Chọn'} ${element.closest('.item')?.querySelector('h3')?.textContent || 'xe'} ${active ? 'khỏi' : 'để'} so sánh`);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.querySelector('.wapper') || document.body, { childList: true, subtree: true });
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.c_sosanh')) { event.preventDefault(); updateEnabled(!enabledRef.current); sync(); return; }
      const control = target.closest<HTMLElement>('.id_ss');
      if (!control || !enabledRef.current) return;
      event.preventDefault();
      const slug = control.dataset.id;
      const card = control.closest('.item');
      if (!slug || !card) return;
      const current = selectedRef.current;
      if (current.some(item => item.slug === slug)) updateSelection(current.filter(item => item.slug !== slug));
      else if (current.length >= 2) { setMessage('Bạn đã chọn 2 xe. Hãy bỏ một xe để chọn xe khác.'); setCollapsed(false); return; }
      else updateSelection([...current, { slug, name: card.querySelector('h3')?.textContent?.trim() || 'Xe', image: (card.querySelector<HTMLImageElement>('.slick-slide[data-current="true"] img') || card.querySelector<HTMLImageElement>('.img_sp img'))?.src || fallbackImage }]);
      setCollapsed(false);
      sync();
    };
    const key = (event: KeyboardEvent) => {
      if (['Enter', ' '].includes(event.key) && event.target instanceof HTMLElement && event.target.matches('.c_sosanh,.id_ss')) { event.preventDefault(); event.target.click(); }
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    return () => { observer.disconnect(); document.removeEventListener('click', click); document.removeEventListener('keydown', key); document.body.classList.remove('ss'); };
  }, [pathname, query, enabled, selected]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setResults({});
    selected.forEach(item => {
      getPublic<CarDetail>(`/cars/${encodeURIComponent(item.slug)}`, { signal: controller.signal })
        .then(car => { if (!controller.signal.aborted) setResults(current => ({ ...current, [item.slug]: { car } })); })
        .catch(() => { if (!controller.signal.aborted) setResults(current => ({ ...current, [item.slug]: { error: true } })); });
    });
    return () => controller.abort();
  }, [selected, ready, retry]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const background = [...document.querySelectorAll<HTMLElement>('.wapper,.tt-compare-tray')].map(element => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button,a[href],[tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; background.forEach(({ element, inert }) => { element.inert = inert; }); document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [open]);

  const cars = selected.map(item => results[item.slug]?.car);
  const canCompare = selected.length === 2 && cars.every(Boolean);
  const hasError = selected.some(item => results[item.slug]?.error);
  const loading = selected.some(item => !results[item.slug]);
  const rows = canCompare ? comparisonRows(cars as CarDetail[]) : [];
  const remove = (slug: string) => updateSelection(selectedRef.current.filter(item => item.slug !== slug));
  if (!ready || !available || !enabled) return null;
  return createPortal(<>
    <section className={`tt-compare-tray${collapsed ? ' is-collapsed' : ''}`} aria-label="Xe đã chọn để so sánh">
      <div className="tt-compare-tray__heading"><button type="button" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed}>So sánh xe ({selected.length}/2) <span className="tt-compare-tray__chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="m8 13.5 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg></span></button><button type="button" onClick={() => updateEnabled(false)} aria-label="Tắt chế độ so sánh">×</button></div>
      {!collapsed && <div className="tt-compare-tray__body">
        <div className="tt-compare-tray__cars">{selected.map(item => <div className="tt-compare-tray__car" key={item.slug}><ResponsiveImage profile="card" src={item.image} alt="" onError={event => { if (!event.currentTarget.src.endsWith(fallbackImage)) event.currentTarget.src = fallbackImage; }} /><span>{item.name}</span><button type="button" onClick={() => remove(item.slug)} aria-label={`Bỏ ${item.name} khỏi so sánh`}>×</button></div>)}{selected.length < 2 && <p>Chọn {2 - selected.length} xe nữa để so sánh</p>}</div>
        <div className="tt-compare-tray__actions"><button type="button" className="tt-compare-primary" disabled={!canCompare} onClick={() => setOpen(true)}>{loading ? 'Đang tải…' : 'So sánh ngay'}</button>{selected.length > 0 && <button type="button" className="tt-compare-clear" onClick={() => updateSelection([])}>Bỏ tất cả</button>}</div>
      </div>}
      {!collapsed && <div className="tt-compare-tray__notice" role="status">{message || (hasError ? 'Không tải được thông tin xe. Hãy thử lại hoặc bỏ xe khỏi danh sách.' : '')}{hasError && <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button>}</div>}
    </section>
    {open && canCompare && <div className="tt-compare-overlay" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}><div className="tt-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="tt-compare-title" tabIndex={-1} ref={dialogRef}>
      <div className="tt-compare-dialog__heading"><h2 id="tt-compare-title">So sánh xe</h2><button type="button" aria-label="Đóng bảng so sánh" onClick={() => setOpen(false)}>×</button></div>
      <div className="tt-compare-table-scroll" tabIndex={0} aria-label="Bảng so sánh"><table className="tt-compare-table"><thead><tr><th scope="col">Thông tin</th>{selected.map((item, index) => <th scope="col" key={item.slug}><ResponsiveImage profile="card" src={(cars[index]?.media.find(image => image.isCover) || cars[index]?.media[0])?.url || item.image} alt={item.name} onError={event => { if (!event.currentTarget.src.endsWith(fallbackImage)) event.currentTarget.src = fallbackImage; }} /><a href={`/${item.slug}`}>{cars[index]?.name || item.name}</a><a className="tt-compare-detail" href={`/${item.slug}`}>Xem xe</a></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label} className={row.values[0] !== row.values[1] ? 'is-different' : ''}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={selected[index].slug}>{value}</td>)}</tr>)}</tbody></table></div>
      <p className="tt-compare-legend">Các dòng có nền hồng là thông tin khác nhau giữa hai xe.</p>
    </div></div>}
  </>, document.body);
}
