'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDate } from '@/lib/auspicious-date';

function parseDate(text: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return '';
  const [, day, month, year] = match;
  const d = Number(day), m = Number(month), y = Number(year);
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return '';
  return `${year}-${month}-${day}`;
}

export default function DateInput({ name, label, min, max, defaultValue = '', autoComplete, className, onChange }: {
  name: string; label: string; min: string; max: string; defaultValue?: string;
  autoComplete?: string; className?: string; onChange: (date: string) => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue ? formatDate(defaultValue) : '');
  const date = parseDate(text);
  useEffect(() => {
    const error = text && !date ? 'Vui lòng nhập ngày hợp lệ theo định dạng dd/mm/yyyy.'
      : date && (date < min || date > max) ? `Vui lòng chọn ngày từ ${formatDate(min)} đến ${formatDate(max)}.` : '';
    input.current?.setCustomValidity(error);
  }, [text, date, min, max]);

  function update(next: string) { setText(next); onChange(parseDate(next)); }
  function typeDate(next: string) {
    // Insert separators while typing or pasting digits; keep deletion natural.
    if ((next.length > text.length || /^\d{8}$/.test(next)) && /^[\d/]+$/.test(next)) {
      const digits = next.replace(/\//g, '').slice(0, 8);
      next = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
    }
    update(next);
  }
  function openCalendar(element: HTMLInputElement) {
    // The native control remains tappable on browsers without showPicker().
    try { element.showPicker?.(); } catch { /* Fall back to the native input interaction. */ }
  }
  return <div className={`tt-date-field ${className ?? ''}`}>
    <label htmlFor={id}>{label} <span aria-hidden="true">*</span></label>
    <div className="tt-date-input">
      <input ref={input} id={id} type="text" name={name} required placeholder="dd/mm/yyyy"
        inputMode="numeric" maxLength={10} autoComplete={autoComplete} spellCheck={false}
        value={text} onChange={event => typeDate(event.target.value)} />
      <span className="tt-date-input__calendar">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></svg>
        <input type="date" aria-label={`Chọn ${label.toLowerCase()} bằng lịch`} min={min} max={max} value={date}
          onChange={event => update(event.target.value ? formatDate(event.target.value) : '')}
          onClick={event => openCalendar(event.currentTarget)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCalendar(event.currentTarget); } }} />
      </span>
    </div>
  </div>;
}
