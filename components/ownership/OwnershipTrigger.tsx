'use client';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
// This component has no config request. The modal and its CSS load on the first click only.
const OwnershipModal = dynamic(() => import('./OwnershipModal'), { ssr: false });
export default function OwnershipTrigger({ carId, className }: { carId: string; className: string }) {
  const [mounted, setMounted] = useState(false), [open, setOpen] = useState(false), [confirmed, setConfirmed] = useState(false), trigger = useRef<HTMLAnchorElement>(null);
  const show = () => { setConfirmed(false); setMounted(true); setOpen(true); };
  return <><a ref={trigger} href="#ownership-cost" role="button" className={className} aria-haspopup="dialog" aria-expanded={open}
    onClick={e => { e.preventDefault(); e.stopPropagation(); show(); }} onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); show(); } }}>Tính toán chi phí sử dụng</a>
    {mounted && <OwnershipModal carId={carId} open={open} confirmed={confirmed} onConfirm={() => setConfirmed(true)} onClose={() => setOpen(false)} returnFocus={trigger} />}</>;
}
