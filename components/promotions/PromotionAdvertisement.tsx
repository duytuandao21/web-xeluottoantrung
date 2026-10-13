'use client';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { promotionExpiry, type PromotionAd } from '@/lib/promotions';

// Keep one attempt per visit, including legacy links that perform full document navigation.
// Explicit reload begins a new visit; storage is optional (SPA state is the fallback).
export default function PromotionAdvertisement() {
  const [advertisement, setAdvertisement] = useState<{ Component: ComponentType<{ promotion: PromotionAd; onClose: () => void }>; promotion: PromotionAd } | null>(null);
  const visitAllowed = useRef<boolean | null>(null);
  const dismiss = useCallback(() => setAdvertisement(null), []);
  useEffect(() => {
    if(visitAllowed.current === null) {
      visitAllowed.current = true;
      try {
        const key = 'tt-promotion-attempted';
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if(navigation?.type === 'reload') sessionStorage.removeItem(key);
        if(sessionStorage.getItem(key)) visitAllowed.current = false;
        else sessionStorage.setItem(key, '1');
      } catch { /* Restricted storage: root state still covers SPA navigation. */ }
    }
    if(!visitAllowed.current) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const prepare = async () => {
      try {
        const response = await fetch('/api/v1/promotions/popup', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if(!response.ok) return;
        const promotion = await response.json() as PromotionAd | null;
        if(!promotion?.imageUrl || Date.now() >= promotionExpiry(promotion.endsAt) || !/^(https:\/\/|\/(?!\/))/i.test(promotion.imageUrl)) return;
        const image = new Image(); image.src = promotion.imageUrl;
        const [module] = await Promise.all([import('./PromotionAd'), image.decode()]);
        if(!controller.signal.aborted) setAdvertisement({ Component: module.default, promotion });
      } catch { /* No image or unavailable API: leave the page unobstructed. */ }
    };
    const loaded = () => { timer = setTimeout(() => void prepare(), 3000); };
    if(document.readyState === 'complete') loaded(); else window.addEventListener('load', loaded, { once: true });
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener('load', loaded); };
  }, []);
  if(!advertisement) return null;
  return <advertisement.Component promotion={advertisement.promotion} onClose={dismiss} />;
}
