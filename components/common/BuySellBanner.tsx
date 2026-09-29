"use client";
import { useEffect, useState } from 'react';

const slides = [
  { src: '/images/mua-xe-banner.png', href: '/san-pham', alt: 'Sẵn sàng tìm chiếc xe ưng ý? Mua xe ngay tại Toàn Trung.' },
  { src: '/images/ban-xe-banner.png', href: '/ban-xe', alt: 'Muốn bán xe nhanh? Định giá minh bạch, hỗ trợ nhanh chóng. Bán xe ngay.' },
];

export default function BuySellBanner() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Decode both images before autoplay, including images already in cache.
    void Promise.all(slides.map(slide => {
      const image = new Image();
      image.src = slide.src;
      return image.decode();
    })).then(() => {
      if (!disposed) timer = setInterval(() => setActive(value => (value + 1) % slides.length), 7000);
    }).catch(() => { /* Keep the first banner if the other image cannot load. */ });
    return () => { disposed = true; if (timer) clearInterval(timer); };
  }, []);

  return <div className="home-buy-banner" aria-label="Mua và bán xe tại Toàn Trung">
    <a href={slides[active].href} aria-label={slides[active].alt}>
      {slides.map((slide, index) => <span key={slide.src} className={`home-buy-banner__slide${index === active ? ' is-active' : ''}`} aria-hidden="true">
        <span className="home-buy-banner__backdrop" style={{ backgroundImage: `url('${slide.src}')` }} />
        <img src={slide.src} alt="" width="1024" height="177" decoding="async" />
      </span>)}
    </a>
  </div>;
}
