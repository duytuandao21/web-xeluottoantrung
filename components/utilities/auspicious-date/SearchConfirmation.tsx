'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function SearchConfirmation({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null), cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    dialog.showModal();
    cancelRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialogRef} className="tt-date-confirmation" aria-labelledby="tt-date-confirmation-title" aria-describedby="tt-date-confirmation-description"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="tt-date-confirmation-title">Thông tin tham khảo</h2>
    <p id="tt-date-confirmation-description">Kết quả chỉ là gợi ý theo một số tiêu chí lịch và quan niệm truyền thống, không bảo đảm may mắn, tài lộc hay an toàn. Hãy ưu tiên kiểm tra xe, giấy tờ và lịch hẹn thực tế.</p>
    <div className="tt-date-confirmation__actions">
      <button ref={cancelRef} type="button" className="tt-date-button tt-date-button--secondary" onClick={onCancel}>Hủy</button>
      <button type="button" className="tt-date-button" onClick={onAgree}>Đồng ý</button>
    </div>
  </dialog>, document.body);
}
