'use client';

import { useLayoutEffect, useRef } from 'react';
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
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    const body = document.body;
    const root = document.documentElement;
    const { scrollX, scrollY } = window;
    const openingUrl = window.location.href;
    const previousFocus = document.activeElement;
    const save = (element: HTMLElement, properties: string[]) => properties.map(name =>
      [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)] as const);
    const previousBody = save(body, ['position', 'top', 'left', 'width', 'overflow', 'padding-right']);
    const previousRoot = save(root, ['overflow', 'overscroll-behavior']);
    const scrollbar = window.innerWidth - root.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;

    // Fixed body also prevents background swipes on iOS. Lock before showModal
    // so native focus cannot scroll the page away from the newsletter form.
    body.style.position = 'fixed';
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${padding + scrollbar}px`;
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    if (!dialog.open) dialog.showModal();

    return () => {
      const restore = (element: HTMLElement, properties: typeof previousBody) => properties.forEach(([name, value, priority]) =>
        value ? element.style.setProperty(name, value, priority) : element.style.removeProperty(name));
      restore(body, previousBody);
      restore(root, previousRoot);
      if (window.location.href === openingUrl) {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return <dialog ref={ref} className="tt-form-feedback-dialog" aria-label={messages[action].title}
    onClose={onClose} onClick={event => { if (event.target === ref.current) ref.current.close(); }}>
    <button type="button" className="tt-form-feedback__close" aria-label="Đóng thông báo" onClick={() => ref.current?.close()}>×</button>
    <FormSuccessContent action={action} onClose={() => ref.current?.close()} />
  </dialog>;
}
