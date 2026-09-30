'use client';

import { useRef, useState, type FormEvent } from 'react';
import { submitPublic } from '@/lib/public-client';

export default function AccessoryCallback({ name }: { name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setNotice('');
    try {
      await submitPublic('/leads', {
        type: 'callback', name: String(values.get('name') || '').trim(),
        phone: String(values.get('phone') || '').trim(), carName: name,
      });
      form.reset();
      setSuccess(true);
      setNotice('Đã gửi yêu cầu. Nhân viên Toàn Trung sẽ liên hệ với bạn.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally { setSubmitting(false); }
  };

  return <>
    <button type="button" className="tt-accessory-detail__callback" onClick={() => { setNotice(''); setSuccess(false); dialog.current?.showModal(); }}>Gọi lại cho tôi</button>
    <dialog ref={dialog} className="tt-accessory-callback" aria-labelledby="tt-accessory-callback-title" onClose={() => { setNotice(''); setSuccess(false); }} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="tt-accessory-callback__header">
        <h2 id="tt-accessory-callback-title">Nhân viên sẽ liên hệ tư vấn</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Đóng">×</button>
      </div>
      <p className="tt-accessory-callback__product">{name}</p>
      {!success && <form data-skip-legacy-submit onSubmit={submit}>
        <label htmlFor="tt-accessory-callback-name">Họ và tên</label>
        <input id="tt-accessory-callback-name" name="name" autoComplete="name" required maxLength={160} />
        <label htmlFor="tt-accessory-callback-phone">Số điện thoại</label>
        <input id="tt-accessory-callback-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required minLength={9} maxLength={24} />
        {notice && <p className="tt-accessory-callback__notice" role="alert">{notice}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
      </form>}
      {success && <p className="tt-accessory-callback__success" role="status">{notice}</p>}
    </dialog>
  </>;
}
