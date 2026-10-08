'use client';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CHATBOT_ICON, chatHistory, streamChat, type ChatMessage as Message } from '@/lib/chatbot';
import ChatComposer from './ChatComposer';
import ChatMessage from './ChatMessage';

const suggestions = [
  ['So sánh phiên bản xe', 'Mazda CX-5 Deluxe và Premium khác nhau thế nào?'],
  ['Tìm hiểu thông số xe', 'ABS là gì và có tác dụng như thế nào?'],
  ['Tư vấn phụ kiện', 'Nên lưu ý gì khi chọn camera hành trình?'],
  ['Kinh nghiệm sử dụng xe', 'Những việc cần kiểm tra trước một chuyến đi xa?'],
];

export default function ChatbotPanel({ open, mobile, onClose, style }: { open: boolean; mobile: boolean; onClose: () => void; style: CSSProperties }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const busyRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const messageId = useRef(0);
  const scrollEnd = () => { const node = transcript.current; if (node) { node.scrollTop = node.scrollHeight; pinned.current = true; setAtBottom(true); } };

  useEffect(() => {
    if (!open) { request.current?.abort(); return; }
    scrollEnd();
    // Opening the panel must not summon a keyboard or pan the visual viewport.
    panel.current?.querySelector<HTMLButtonElement>('.tt-chat-header>button')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  useLayoutEffect(() => { if (open && pinned.current) scrollEnd(); }, [messages, open, style.height]);
  useLayoutEffect(() => {
    if (!open || !mobile) return;
    const body = document.body; const root = document.documentElement;
    const saved = ['overflow'].map(key => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)] as const);
    const savedRoot = ['overflow', 'overscroll-behavior-x', 'overscroll-behavior-y'].map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)] as const);
    const y = scrollY; const x = scrollX;
    // Keep the document coordinate system intact. Fixed body + fixed overlays are
    // independently panned by Safari when it reveals the software keyboard.
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden'; root.style.overscrollBehaviorX = 'none'; root.style.overscrollBehaviorY = 'none';
    let touchX = 0; let touchY = 0;
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) { touchX = event.touches[0].clientX; touchY = event.touches[0].clientY; }
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const nextX = event.touches[0].clientX; const nextY = event.touches[0].clientY;
      const deltaX = nextX - touchX; const delta = nextY - touchY; touchX = nextX; touchY = nextY;
      const target = event.target instanceof Element ? event.target : null;
      if (target && panel.current?.contains(target)) {
        // Preserve native caret selection and horizontal swipes in wide tables.
        if (target.closest('.tt-chat-composer textarea')) return;
        const horizontal = target.closest<HTMLElement>('.tt-chat-table,pre');
        if (horizontal && horizontal.scrollWidth > horizontal.clientWidth && Math.abs(deltaX) > Math.abs(delta)) return;
      }
      const scrollable = target?.closest<HTMLElement>('.tt-chat-transcript');
      if (scrollable && panel.current?.contains(scrollable)) {
        const end = scrollable.scrollHeight - scrollable.clientHeight;
        if (end > 0 && ((delta > 0 && scrollable.scrollTop > 0) || (delta < 0 && scrollable.scrollTop < end - 1))) return;
      }
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', touchStart); document.removeEventListener('touchmove', touchMove);
      saved.forEach(([key, value, priority]) => value ? body.style.setProperty(key, value, priority) : body.style.removeProperty(key));
      savedRoot.forEach(([key, value, priority]) => value ? root.style.setProperty(key, value, priority) : root.style.removeProperty(key));
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }, [open, mobile]);

  const send = async (question = value, retry = false) => {
    const text = question.trim();
    if (!text || text.length > 2000 || busyRef.current) return;
    const previous = retry ? messages.slice(0, -2) : messages;
    const id = () => `chat-${Date.now()}-${++messageId.current}`;
    const assistantId = id();
    const assistant: Message = { id: assistantId, role: 'assistant', content: '', status: 'streaming' };
    setMessages([...previous.slice(-18), { id: id(), role: 'user', content: text, status: 'done' }, assistant]);
    setValue(''); pinned.current = true; busyRef.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    const update = (change: (message: Message) => Message) => setMessages(current => current.map(message => message.id === assistantId ? change(message) : message));
    try {
      await streamChat(text, chatHistory(previous), controller.signal, event => {
        if (event.event === 'content') update(message => ({ ...message, content: message.content + event.text }));
        else if (event.event === 'sources') update(message => ({ ...message, sources: event.sources, searchEntryPoint: event.searchEntryPoint }));
        else update(message => ({ ...message, status: 'done', truncated: event.truncated }));
      });
    } catch (error) { update(message => ({ ...message, status: 'error', error: error instanceof Error ? error.message : 'Không thể kết nối trợ lý AI. Vui lòng thử lại.' })); }
    finally { if (request.current === controller) { request.current = null; busyRef.current = false; setBusy(false); } }
  };
  const retry = () => { const lastUser = messages.at(-2); if (lastUser?.role === 'user') void send(lastUser.content, true); };

  return <section ref={panel} hidden={!open} id="tt-chat-panel" className="tt-chat-panel" style={style} role="dialog" aria-modal={mobile || undefined} aria-labelledby="tt-chat-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Tab' && mobile) {
      const controls = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea,[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="tt-chat-header"><span className="tt-chat-header__avatar"><ResponsiveImage profile="icon" sizes="42px" src={CHATBOT_ICON} alt="" width="42" height="42" /></span><div><h2 id="tt-chat-title">Trợ lý AI Toàn Trung</h2><p>Trợ lý thông tin ô tô</p></div><button type="button" aria-label="Đóng trợ lý AI" onClick={onClose}>×</button></header>
    <div className="tt-chat-conversation"><div ref={transcript} className="tt-chat-transcript" role="log" aria-label="Hội thoại với trợ lý AI" aria-live="off" onScroll={() => {
      const node = transcript.current!; const near = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
      pinned.current = near; setAtBottom(near);
    }}>
      {!messages.length && <div className="tt-chat-welcome"><ResponsiveImage profile="icon" sizes="76px" src={CHATBOT_ICON} alt="" width="76" height="76" /><h3>Xin chào 👋</h3><p>Tôi là trợ lý AI của Toàn Trung.</p><p>Bạn có thể hỏi tôi về xe, phiên bản, thông số, phụ kiện, công nghệ ô tô hoặc các vấn đề liên quan.</p>
        <div className="tt-chat-suggestions">{suggestions.map(([label, question]) => <button key={label} type="button" onClick={() => { setValue(question); input.current?.focus({ preventScroll: true }); }}>{label}<span aria-hidden="true">↗</span></button>)}</div>
      </div>}
      {messages.map((message, index) => <ChatMessage key={message.id} message={message} onRetry={retry} retryable={!busy && index === messages.length - 1} />)}
    </div>
    {!atBottom && <button className="tt-chat-latest" type="button" onClick={scrollEnd}>Về cuối hội thoại ↓</button>}
    </div>
    <div className="tt-chat-bottom"><ChatComposer value={value} onChange={setValue} onSend={() => void send()} busy={busy} mobile={mobile} inputRef={input} /><p>AI có thể chưa chính xác. Hãy đối chiếu thông tin quan trọng.</p></div>
    <span className="tt-chat-sr" role="status" aria-live="polite">{busy ? 'Trợ lý AI đang trả lời' : messages.length ? 'Trợ lý AI đã phản hồi' : ''}</span>
  </section>;
}
