'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

type Item = { key: string; label: string };
export default function PriorityOrder({ items, onMove }: { items: Item[]; onMove: (key: string, direction: -1 | 1) => void }) {
  const rows = useRef(new Map<string, HTMLLIElement>()), animations = useRef(new Map<string, Animation>());
  const previousPositions = useRef<Map<string, number> | null>(null), focusedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const active = animations.current, motion = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { for (const animation of active.values()) animation.cancel(); active.clear(); };
    const changed = () => { if (motion.matches) stop(); };
    motion.addEventListener('change', changed);
    return () => { motion.removeEventListener('change', changed); stop(); };
  }, []);
  useLayoutEffect(() => {
    const before = previousPositions.current;
    previousPositions.current = null;
    if (!before) return;
    // Measure before cancelling: a second click continues from the visible position mid-animation.
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [key, row] of rows.current) {
        const start = before.get(key);
        if (start === undefined || typeof row.animate !== 'function') continue;
        const distance = start - row.getBoundingClientRect().top;
        if (Math.abs(distance) < .5) continue;
        const animation = row.animate([{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.current.set(key, animation);
        animation.onfinish = () => { if (animations.current.get(key) === animation) animations.current.delete(key); };
      }
    }
    const button = focusedButton.current;
    focusedButton.current = null;
    if (button?.isConnected) {
      const target = button.disabled ? button.closest('li')?.querySelector<HTMLButtonElement>('button:not(:disabled)') : button;
      target?.focus({ preventScroll: true });
    }
  }, [items]);
  const move = (key: string, direction: -1 | 1, button: HTMLButtonElement) => {
    previousPositions.current = new Map([...rows.current].map(([id, row]) => [id, row.getBoundingClientRect().top]));
    focusedButton.current = document.activeElement === button ? button : null;
    onMove(key, direction);
  };
  return <>
    <ol className="tt-needs-priority-order">{items.map((item, index) => <li key={item.key} ref={row => { if (row) rows.current.set(item.key, row); else rows.current.delete(item.key); }}>
      <span>{index + 1}. {item.label}</span><div>{([-1, 1] as const).map(direction => <button key={direction} type="button" aria-label={`${direction < 0 ? 'Tăng' : 'Giảm'} ưu tiên ${item.label}`} disabled={index + direction < 0 || index + direction >= items.length} onClick={e => move(item.key, direction, e.currentTarget)}>{direction < 0 ? '↑' : '↓'}</button>)}</div>
    </li>)}</ol>
    <span className="tt-needs-sr-only" role="status" aria-live="polite" aria-atomic="true">Thứ tự ưu tiên: {items.map((item, index) => `${index + 1}. ${item.label}`).join('; ')}.</span>
  </>;
}
