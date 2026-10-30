'use client';

import { useRef, useState, type FormEvent } from 'react';
import { submitProtectedForm } from '@/lib/protected-form';
import { FormSuccessContent } from '@/components/common/FormSuccess';

export default function AccessoryCallback({ name, productId }: { name: string; productId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || cooldown) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setNotice('');
    try {
      await submitProtectedForm(form, 'callback', '/leads', {
        type: 'callback', name: String(values.get('name') || '').trim(),
        phone: String(values.get('phone') || '').trim(), carName: name, productId,
      });
      form.reset();
      setCooldown(true);
      window.setTimeout(() => setCooldown(false), 30_000);
      setSuccess(true);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally { setSubmitting(false); }
  };

  return <>
    <button type="button" className="tt-accessory-detail__callback" onClick={() => { setNotice(''); setSuccess(false); dialog.current?.showModal(); }}>Gọi lại cho tôi</button>
    <dialog ref={dialog} className={`tt-accessory-callback${success ? ' tt-accessory-callback--success' : ''}`} aria-label={success ? 'Xác nhận gửi yêu cầu' : 'Yêu cầu gọi lại'} onClose={() => { setNotice(''); setSuccess(false); }} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      {!success ? <><div className="tt-accessory-callback__header">
        <h2 id="tt-accessory-callback-title">Nhân viên sẽ liên hệ tư vấn</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Đóng">×</button>
      </div>
      <p className="tt-accessory-callback__product">{name}</p>
      <form data-skip-legacy-submit onSubmit={submit}>
        <label htmlFor="tt-accessory-callback-name">Họ và tên</label>
        <input id="tt-accessory-callback-name" name="name" autoComplete="name" required maxLength={160} />
        <label htmlFor="tt-accessory-callback-phone">Số điện thoại</label>
        <input id="tt-accessory-callback-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required minLength={9} maxLength={24} />
        {notice && <p className="tt-accessory-callback__notice" role="alert">{notice}</p>}
        <button type="submit" disabled={submitting || cooldown}>{submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
      </form></> : <>
        <button type="button" className="tt-form-feedback__close" aria-label="Đóng thông báo" onClick={() => dialog.current?.close()}>×</button>
        <FormSuccessContent action="callback" onClose={() => dialog.current?.close()} />
      </>}
    </dialog>
  </>;
}
