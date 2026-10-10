import { zaloHref } from '@/lib/contact-links';

export default function MobileContactBar({ zalo, mapHref }: { zalo?: string; mapHref: string }) {
  return <nav className="tt-mobile-contact-bar" aria-label="Liên hệ nhanh Toàn Trung">
    <button type="button" className="tt-mobile-contact-bar__item" data-fancybox data-src="#nutgoi" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.8 18.8 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7.8 10.8a15.6 15.6 0 0 0 5.4 5.4l1.6-1.6a2 2 0 0 1 1.8-.6l2.7.4A2 2 0 0 1 21 16.4Z"/><path d="M14 3a7 7 0 0 1 7 7m-7-3a3 3 0 0 1 3 3"/></svg>
      <span>Gọi điện</span>
    </button>
    <a className="tt-mobile-contact-bar__item" href={zaloHref(zalo)} target="_blank" rel="noopener noreferrer">
      <svg className="tt-mobile-contact-bar__zalo" viewBox="0 0 52 24" fill="none" aria-hidden="true"><text x="1" y="19" fill="currentColor" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="700" letterSpacing="-.7">Zalo</text><path d="M43 2a7 7 0 0 1 7 7m-7-3a3 3 0 0 1 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      <span>Chat Zalo</span>
    </a>
    <a className="tt-mobile-contact-bar__item" href={mapHref} target="_blank" rel="noopener noreferrer" aria-label="Chỉ đường đến Showroom Toàn Trung 10">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 9c0 5-7 11-7 11S5 14 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/><path d="M6 18c-2 1-3 2-3 3 0 1 4 2 9 2s9-1 9-2c0-1-1-2-3-3"/></svg>
      <span>Chỉ đường</span>
    </a>
  </nav>;
}
