'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SaleLogoutConfirmation({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const cancel = () => { if (!pending.current) onCancel(); };
  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onConfirm(); }
    catch { setError('Chưa thể hoàn tất đăng xuất. Vui lòng thử lại.'); }
    finally { pending.current = false; setBusy(false); }
  };

  return createPortal(<dialog ref={dialogRef} className="sale-login-dialog sale-logout-dialog" aria-modal="true" aria-labelledby="sale-logout-title" aria-describedby="sale-logout-description"
    onCancel={event => { event.preventDefault(); cancel(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
    }}>
    <h2 id="sale-logout-title">Xác nhận đăng xuất</h2>
    <p id="sale-logout-description">Bạn có muốn đăng xuất khỏi tài khoản sale không?</p>
    {error && <div className="sale-login-error" role="alert">{error}</div>}
    <div className="sale-logout-actions">
      <button ref={cancelRef} type="button" disabled={busy} onClick={cancel}>Hủy</button>
      <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
    </div>
  </dialog>, document.body);
}
