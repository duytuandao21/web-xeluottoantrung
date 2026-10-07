'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatKm, valuationApi, type ValuationResult } from '@/lib/valuation';

export default function ValuationLeadForm({ result, odometerKm, sent = false, onSent, onEdit }: { result: ValuationResult; odometerKm?: number; sent?: boolean; onSent: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [phone, setPhone] = useState(''), [consent, setConsent] = useState(false);
  const lock = useRef(false), abort = useRef<AbortController | null>(null), title = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const normalizedPhone = phone.replace(/[()\s.-]/g, ''), valid = /^(?:\+84|0)[0-9]{9,10}$/.test(normalizedPhone) && consent;
  const canSend = !!result.recordId && !!result.leadToken;
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement, body = document.body;
    const savedScroll = { x: window.scrollX, y: window.scrollY };
    const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'] as const;
    const savedStyles = properties.map(property => [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)]);
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.position = 'fixed'; body.style.top = `${-savedScroll.y}px`; body.style.left = `${-savedScroll.x}px`;
    body.style.width = '100%'; body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${paddingRight + scrollbar}px`;
    dialog.showModal();
    title.current?.focus({ preventScroll: true });
    let frame = 0;
    const viewport = window.visualViewport;
    const position = () => {
      frame = 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const gap = width <= 600 ? 10 : 24;
      dialog.style.setProperty('--tt-valuation-dialog-height', `${Math.max(0, height - gap * 2)}px`);
      dialog.style.setProperty('--tt-valuation-dialog-width', `${Math.max(0, width - gap * 2)}px`);
      dialog.style.left = `${(viewport?.offsetLeft || 0) + width / 2}px`;
      dialog.style.top = `${(viewport?.offsetTop || 0) + Math.max(gap, (height - dialog.offsetHeight) / 2)}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
    position();
    viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); dialog.addEventListener('focusin', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule); dialog.removeEventListener('focusin', schedule);
      dialog.close();
      for (const [property, value, priority] of savedStyles) {
        if (value) body.style.setProperty(property, value, priority); else body.style.removeProperty(property);
      }
      window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: 'instant' });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  const vehicleFields = [
    ['brand', 'Hãng xe', result.vehicle.brandName], ['model', 'Dòng xe', result.vehicle.modelName],
    ['year', 'Năm sản xuất', String(result.vehicle.modelYear)], ['variant', 'Phiên bản', result.vehicle.variantName],
    ['mileage', 'Số km đã đi', odometerKm === undefined ? 'Chưa rõ' : `${formatKm(odometerKm)} km`],
  ];
  return <>
    <div className="tt-valuation-result__actions">
      <button className="tt-date-button" type="button" disabled={!canSend || sent || busy} aria-haspopup="dialog" aria-expanded={open && !sent} aria-controls={open && !sent ? 'valuation-sell-form' : undefined} onClick={() => setOpen(true)}>Gửi thông tin xe</button>
      <a className="tt-date-button tt-date-button--secondary" href="tel:0777393913">Liên hệ <strong>0777393913</strong></a>
    </div>
    {sent && <p className="tt-valuation-result__sent" role="status">Đã gửi thông tin xe. Nhân viên Toàn Trung sẽ liên hệ với bạn.</p>}
    {open && !sent && createPortal(<dialog ref={dialogRef} id="valuation-sell-form" className="tt-valuation-page tt-valuation-lead-dialog" aria-labelledby="valuation-sell-title" aria-describedby="valuation-sell-description"
      onCancel={event => { event.preventDefault(); if (!lock.current) setOpen(false); }}
      onClick={event => {
        if (event.target !== event.currentTarget || lock.current) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
      }}>
      <header className="tt-valuation-lead-dialog__header">
        <h3 id="valuation-sell-title" ref={title} tabIndex={-1}>Gửi thông tin xe</h3>
        <button type="button" className="tt-valuation-lead-dialog__close" aria-label="Đóng form gửi thông tin xe" disabled={busy} onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="tt-valuation-lead">
        <p id="valuation-sell-description">Thông tin xe đã được điền sẵn từ lần định giá của bạn.</p>
        <form data-skip-legacy-submit onSubmit={async event => {
          event.preventDefault(); if (!valid || !canSend || lock.current) return;
          lock.current = true; setBusy(true); setError('');
          const controller = new AbortController(); abort.current = controller;
          try {
            const response = await valuationApi<{ accepted: boolean }>(`records/${encodeURIComponent(result.recordId!)}/lead`, {
              body: { leadToken: result.leadToken!, phone: normalizedPhone, consent: true }, signal: controller.signal,
            });
            if (!response.accepted) throw new Error('Chưa gửi được thông tin. Vui lòng thử lại.');
            if (!controller.signal.aborted) { setOpen(false); onSent(); }
          } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không thể gửi thông tin. Vui lòng thử lại.');
          } finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
        }} aria-busy={busy}>
          <fieldset disabled={busy} className="tt-valuation-fields">
            <legend className="tt-valuation-sr-only">Thông tin bán xe</legend>
            {vehicleFields.map(([key, label, value]) => <div className="tt-valuation-field" key={key}>
              <label htmlFor={`valuation-contact-${key}`}>{label}</label>
              <input id={`valuation-contact-${key}`} value={value} readOnly tabIndex={-1} />
            </div>)}
            <div className="tt-valuation-field"><label htmlFor="valuation-contact-phone">Số điện thoại <span>*</span></label>
              <input id="valuation-contact-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Nhập số điện thoại" value={phone} onChange={event => setPhone(event.target.value)} required maxLength={24} aria-invalid={!!phone && !/^(?:\+84|0)[0-9]{9,10}$/.test(normalizedPhone)} aria-describedby="valuation-contact-phone-hint" />
              <small id="valuation-contact-phone-hint">Số điện thoại Việt Nam bắt đầu bằng 0 hoặc +84.</small>
            </div>
            <label className="tt-valuation-checkbox tt-valuation-wide"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required /><span>Tôi đồng ý để Toàn Trung liên hệ tư vấn bán xe.</span></label>
          </fieldset>
          {error && <p role="alert" className="tt-valuation-field-error"> {error}</p>}
          <div className="tt-valuation-actions"><button type="button" className="tt-valuation-text-button" disabled={busy} onClick={() => { setOpen(false); onEdit(); }}>Chỉnh sửa thông tin xe</button><button type="submit" className="tt-date-button" disabled={!valid || busy}>{busy ? 'Đang gửi thông tin…' : error ? 'Thử gửi lại' : 'Gửi thông tin'}</button></div>
        </form>
      </div>
    </dialog>, document.body)}
  </>;
}
