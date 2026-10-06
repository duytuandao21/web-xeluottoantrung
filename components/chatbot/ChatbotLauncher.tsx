'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { CHATBOT_ICON } from '@/lib/chatbot';

const ChatbotPanel = dynamic(() => import('./ChatbotPanel'), { ssr: false });
type Position = { launcher: CSSProperties; panel: CSSProperties; mobile: boolean; compact: boolean };

export default function ChatbotLauncher() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => setReady(true), []);
  useLayoutEffect(() => {
    if (!ready) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let trackUntil = open ? performance.now() + 1200 : 0;
    const update = () => {
      frame = 0;
      const origin = layer.current?.getBoundingClientRect(); if (!origin) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0; const top = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth; const height = viewport?.height || innerHeight;
      const mobile = width < 768 || matchMedia('(max-width:767px)').matches;
      const contacts = [...document.querySelectorAll<HTMLElement>('.btn-phone.btn-frame,.btn-zalo.btn-frame')]
        .map(button => ({ box: button.getBoundingClientRect(), halo: button.querySelector<HTMLElement>('.kenit-alo-circle-fill')?.offsetWidth || 70 }))
        .filter(({ box }) => box.width && box.height).sort((a, b) => a.box.top - b.box.top);
      const anchor = contacts[0]?.box;
      // Match the visible outer ring, rather than the smaller 50px contact core.
      const size = contacts[0]?.halo || 70;
      const center = anchor ? anchor.left + anchor.width / 2 : left + width - 45;
      const right = Math.min(left + width - 10, center + size / 2);
      const step = contacts.length > 1 ? contacts[1].box.top + contacts[1].box.height / 2 - (anchor!.top + anchor!.height / 2) : size + 20;
      let buttonTop = anchor ? anchor.top + anchor.height / 2 - step - size / 2 : top + height - 120 - size;
      buttonTop = Math.max(top + 12, buttonTop);
      const panelWidth = mobile ? width - 16 : Math.min(500, width - size - 60);
      const panelHeight = mobile ? height - 16 : Math.min(640, height - 24);
      const panelTop = mobile ? top + 8 : Math.max(top + 12, Math.min(buttonTop + size - panelHeight, top + height - panelHeight - 12));
      const next: Position = { mobile, compact: mobile && height <= 500, launcher: { left: right - size - origin.left, top: buttonTop - origin.top, width: size, height: size }, panel: {
        left: (mobile ? left + 8 : Math.max(left + 12, right - size - 16 - panelWidth)) - origin.left,
        top: panelTop - origin.top, width: panelWidth, height: panelHeight,
      } };
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      // Keyboard focus can pan fixed content after the last viewport event (iOS).
      // Keep measuring during that transition, including when the keyboard closes.
      if (open && mobile && document.visibilityState === 'visible') {
        if (performance.now() < trackUntil) frame = requestAnimationFrame(update);
        else if (root?.contains(document.activeElement) && document.activeElement?.matches('.tt-chat-composer textarea')) {
          timer = setTimeout(schedule, 100);
        }
      }
    };
    const schedule = () => { clearTimeout(timer); if (!frame) frame = requestAnimationFrame(update); };
    const viewportChanged = () => { trackUntil = performance.now() + 1200; schedule(); };
    const focusChanged = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('.tt-chat-composer textarea')) viewportChanged();
    };
    const root = layer.current;
    update();
    window.addEventListener('resize', viewportChanged); window.addEventListener('scroll', viewportChanged, { passive: true });
    window.visualViewport?.addEventListener('resize', viewportChanged); window.visualViewport?.addEventListener('scroll', viewportChanged);
    root?.addEventListener('focusin', focusChanged); root?.addEventListener('focusout', focusChanged);
    document.addEventListener('visibilitychange', viewportChanged);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); window.removeEventListener('resize', viewportChanged); window.removeEventListener('scroll', viewportChanged);
      window.visualViewport?.removeEventListener('resize', viewportChanged); window.visualViewport?.removeEventListener('scroll', viewportChanged);
      root?.removeEventListener('focusin', focusChanged); root?.removeEventListener('focusout', focusChanged);
      document.removeEventListener('visibilitychange', viewportChanged); };
  }, [ready, open]);
  if (!ready) return null;
  const close = () => { setOpen(false); requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true })); };
  return createPortal(<div ref={layer} className={`tt-chat-layer${open ? ' is-open' : ''}${position?.mobile ? ' is-mobile' : ''}${position?.compact ? ' is-compact' : ''}`}>
    <button ref={launcher} type="button" className="tt-chat-launcher" style={position?.launcher} aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'} aria-expanded={open} aria-controls="tt-chat-panel" onClick={() => { setLoaded(true); setOpen(value => !value); }}>
      <img src={CHATBOT_ICON} alt="" width="70" height="70" /><span className="tt-chat-launcher__label">Hỏi trợ lý AI</span>
    </button>
    {loaded && position && <ChatbotPanel open={open} mobile={position.mobile} onClose={close} style={position.panel} />}
  </div>, document.body);
}
