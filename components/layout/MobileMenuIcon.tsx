import type { ReactNode } from 'react';

const carFront = <>
  <path d="M9 19L13 10C13.6 8.7 14.8 8 16.3 8H31.7C33.2 8 34.4 8.7 35 10L39 19"/>
  <path d="M9 19H39C42 19 43 21 43 24V34H5V24C5 21 6 19 9 19Z"/>
  <path d="M5 22L3 20M43 22L45 20M5 34V38H11V34M37 34V38H43V34M16 29H32"/>
  <circle cx="11.5" cy="26.5" r="1.5" fill="#183567" stroke="none"/><circle cx="36.5" cy="26.5" r="1.5" fill="#183567" stroke="none"/>
</>;

const icons: Record<string, ReactNode> = {
  'Mua xe': carFront,
  'Bán xe': <>
    {carFront}
    <path d="M28 24.5H35.2L43 32.3C43.8 33.1 43.8 34.3 43 35.1L35.1 43C34.3 43.8 33.1 43.8 32.3 43L24.5 35.2V28C24.5 26.1 26.1 24.5 28 24.5Z" fill="#fff"/>
    <circle cx="30" cy="28.5" r="1.3" fill="#183567" stroke="none"/>
    <g strokeWidth="1.7">
      <path d="M36.5 32.1c-.8-.9-4-1-4 .8 0 2 4 1.2 4 3.2 0 1.8-3.2 1.8-4 .8"/>
      <path d="M34.5 30.6v8"/>
    </g>
  </>,
  'Dịch vụ': <>
    <path d="m3.5 1.7 4 4-1.8 1.8-4-4 1.8-1.8ZM6.6 6.6l6.5 6.5"/>
    <path d="m14.5 13.7 6 6a2 2 0 0 1-2.8 2.8l-6-6Z"/>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94L14.7 6.3Z" fill="#fff"/>
  </>,
  'Phạt nguội': <><path d="M12 21H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9l5 5v4M14 2v6h5M7 7h3M7 12h5M7 16h3"/><circle cx="17" cy="17" r="4"/><path d="m20 20 3 3"/></>,
  'Giới thiệu': <><path d="M3 9v13h18V9M2 9l2-6h16l2 6M3 3h18M2 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"/><path d="M14 22v-8h4v8M6 14h4v4H6Z"/></>,
  'Tuyển dụng': <><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M2 13a30 30 0 0 0 20 0M10 14v2h4v-2"/></>,
  'Khám phá': <><circle cx="12" cy="12" r="10"/><path d="M16.5 7.5 14 14 7.5 16.5 10 10Z"/></>,
  phone: <><path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.8 18.8 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7.8 10.8a15.6 15.6 0 0 0 5.4 5.4l1.6-1.6a2 2 0 0 1 1.8-.6l2.7.4A2 2 0 0 1 21 16.4Z"/><path d="M14 3a7 7 0 0 1 7 7m-7-3a3 3 0 0 1 3 3"/></>,
};

export default function MobileMenuIcon({ name }: { name: string }) {
  const icon = icons[name.trim()];
  const isCar = name.trim() === 'Mua xe' || name.trim() === 'Bán xe';
  return icon ? <svg className="mobile-menu-icon" viewBox={isCar ? '0 0 48 48' : '0 0 24 24'} fill="none" stroke={isCar ? '#183567' : 'currentColor'} strokeWidth={isCar ? 2.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icon}</svg> : null;
}
