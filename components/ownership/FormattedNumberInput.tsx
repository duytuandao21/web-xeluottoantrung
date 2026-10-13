'use client';
import { useLayoutEffect, useRef, useState } from 'react';

// Keep numeric answers for the API; grouping is only a display format.
export default function FormattedNumberInput({ name, value, min, max, onChange }: {
  name: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null), caret = useRef<number | null>(null);
  const [incomplete, setIncomplete] = useState('');
  const display = Number.isFinite(value) ? value.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : incomplete;
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.setCustomValidity(!Number.isFinite(value) && display !== '' ? 'Vui lòng nhập số hợp lệ.'
      : Number.isFinite(value) && (!Number.isSafeInteger(value) || value < min || value > max)
        ? `Vui lòng nhập từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}.` : '');
    if (caret.current !== null && document.activeElement === element) {
      let position = 0, count = 0;
      while (position < display.length && count < caret.current) {
        if (/[\d-]/.test(display[position])) count++;
        position++;
      }
      element.setSelectionRange(position, position);
    }
    caret.current = null;
  });
  return <input ref={input} name={name} type="text" inputMode="numeric" autoComplete="off" required value={display}
    onChange={event => {
      const raw = event.target.value, digits = raw.replace(/[.\s]/g, '');
      if (!/^-?\d*$/.test(digits)) return;
      const next = digits === '' || digits === '-' ? NaN : Number(digits);
      caret.current = (raw.slice(0, event.target.selectionStart ?? raw.length).match(/[\d-]/g) || []).length;
      setIncomplete(Number.isFinite(next) ? '' : digits);
      onChange(next);
    }} />;
}
