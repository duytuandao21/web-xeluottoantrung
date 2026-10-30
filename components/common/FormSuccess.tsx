'use client';

import { useEffect, useRef } from 'react';
import type { FormAction } from '@/lib/protected-form';

const messages: Record<FormAction, { title: string; description: string }> = {
  sell_car: {
    title: 'Đã nhận thông tin bán xe',
    description: 'Cảm ơn quý khách. Đội ngũ Toàn Trung sẽ liên hệ để trao đổi về chiếc xe của bạn.',
  },
  trade_in: {
    title: 'Đã nhận yêu cầu lên đời xe',
    description: 'Cảm ơn quý khách. Đội ngũ Toàn Trung sẽ liên hệ để tư vấn phương án phù hợp.',
  },
  callback: {
    title: 'Đã nhận yêu cầu gọi lại',
    description: 'Cảm ơn quý khách. Nhân viên Toàn Trung sẽ liên hệ với bạn sớm nhất có thể.',
  },
  newsletter: {
    title: 'Đăng ký nhận tin thành công',
    description: 'Cảm ơn quý khách đã quan tâm. Thông tin xe mới và ưu đãi từ Toàn Trung sẽ được gửi tới bạn.',
  },
};

export function FormSuccessContent({ action, onClose }: { action: FormAction; onClose: () => void }) {
  const { title, description } = messages[action];
  return <div className="tt-form-feedback">
    <h2>{title}</h2>
    <p className="tt-form-feedback__description">{description}</p>
    <button type="button" className="tt-form-feedback__button" onClick={onClose}>Đóng thông báo</button>
  </div>;
}

export function FormSuccessDialog({ action, open, onClose }: { action: FormAction; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={ref} className="tt-form-feedback-dialog" aria-label={messages[action].title}
    onClose={onClose} onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    <button type="button" className="tt-form-feedback__close" aria-label="Đóng thông báo" onClick={() => ref.current?.close()}>×</button>
    <FormSuccessContent action={action} onClose={() => ref.current?.close()} />
  </dialog>;
}
