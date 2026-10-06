'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';

export default function ChatComposer({ value, onChange, onSend, busy, mobile, inputRef }: { value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean; mobile: boolean; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const composing = useRef(false);
  const touch = useRef<{ id: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.overflowY = 'hidden';
    input.style.height = 'auto';
    input.style.height = `${Math.min(116, input.scrollHeight)}px`;
    input.style.overflowY = input.scrollHeight > input.clientHeight ? 'auto' : 'hidden';
  }, [value, inputRef]);
  return <form className="tt-chat-composer" data-skip-legacy-submit onSubmit={event => { event.preventDefault(); onSend(); }}>
    <label className="tt-chat-sr" htmlFor="tt-chat-input">Câu hỏi về ô tô</label>
    <textarea ref={inputRef} id="tt-chat-input" rows={1} value={value} maxLength={2000} placeholder="Hỏi tôi về xe, phiên bản, phụ kiện..." onChange={event => onChange(event.target.value)}
      onTouchStart={event => {
        touch.current = null;
        if (!mobile || document.activeElement === event.currentTarget || event.touches.length !== 1) return;
        const finger = event.touches[0];
        touch.current = { id: finger.identifier, x: finger.clientX, y: finger.clientY };
      }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={event => {
        const start = touch.current; touch.current = null;
        if (!mobile || !start || event.touches.length || event.changedTouches.length !== 1) return;
        const finger = event.changedTouches[0];
        if (finger.identifier !== start.id || Math.hypot(finger.clientX - start.x, finger.clientY - start.y) > 10) return;
        // Native tap focus pans Safari before the keyboard viewport settles.
        // Match suggestion-button focus in this trusted gesture, not a timer.
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }}
      onMouseDown={event => {
        if (!mobile || event.button !== 0 || document.activeElement === event.currentTarget) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
      }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && !mobile) { event.preventDefault(); onSend(); } }} />
    <button type="submit" disabled={busy || !value.trim()} aria-label="Gửi câu hỏi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9L2 9 22 2ZM11 13 22 2" /></svg></button>
  </form>;
}
