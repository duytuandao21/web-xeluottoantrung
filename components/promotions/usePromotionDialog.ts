'use client';
import { useEffect, type RefObject } from 'react';
import { promotionExpiry } from '@/lib/promotions';

export default function usePromotionDialog(ref: RefObject<HTMLDialogElement | null>, deferUntilFree = false, expiresAt?: string, onExpire?: () => void) {
  useEffect(() => {
    const dialog = ref.current;
    if(!dialog) return;
    let observer: MutationObserver | undefined, expiryTimer: ReturnType<typeof setTimeout> | undefined, opened = false, previous: HTMLElement | null = null, overflow = '', padding = '';
    const scheduleExpiry = () => {
      if(!expiresAt) return;
      const remaining = promotionExpiry(expiresAt) - Date.now();
      if(remaining <= 0) { observer?.disconnect(); onExpire?.(); return; }
      expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647));
    };
    scheduleExpiry();
    const show = () => {
      if(opened) return;
      if(expiresAt && Date.now() >= promotionExpiry(expiresAt)) { observer?.disconnect(); onExpire?.(); return; }
      if(deferUntilFree && document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')) {
        if(!observer) { observer = new MutationObserver(show); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] }); }
        return;
      }
      observer?.disconnect(); opened = true; previous = document.activeElement as HTMLElement | null;
      overflow = document.body.style.overflow; padding = document.body.style.paddingRight;
      const gutter = innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden'; if(gutter > 0) document.body.style.paddingRight = `${gutter}px`;
      dialog.showModal(); dialog.querySelector<HTMLButtonElement>('[data-promo-close]')?.focus({ preventScroll: true });
    };
    show();
    return () => { observer?.disconnect(); clearTimeout(expiryTimer); if(opened) { dialog.close(); document.body.style.overflow = overflow; document.body.style.paddingRight = padding; if(previous?.isConnected) previous.focus({ preventScroll: true }); } };
  }, [ref, deferUntilFree, expiresAt, onExpire]);
}
