"use client";
import { useEffect, useState } from 'react';
import ResponsiveImage from './ResponsiveImage';
import { getImageDeliveryUrl, responsiveImage } from '@/lib/image-delivery';

export type BannerSlide = { key: string; src: string; href: string; alt: string };

export default function BuySellBanner({ slides }: { slides: BannerSlide[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    setActive(0);
    if (slides.length < 2) return;
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Decode both images before autoplay, including images already in cache.
    void Promise.all(slides.map(slide => {
      const image = new Image();
      const delivery = responsiveImage(slide.src, 'hero', '(max-width:1024px) 100vw, 1024px');
      if (delivery.srcSet) image.srcset = delivery.srcSet;
      if (delivery.sizes) image.sizes = delivery.sizes;
      image.src = delivery.src;
      return image.decode();
    })).then(() => {
      if (!disposed) timer = setInterval(() => setActive(value => (value + 1) % slides.length), 7000);
    }).catch(() => { /* Keep the first banner if the other image cannot load. */ });
    return () => { disposed = true; if (timer) clearInterval(timer); };
  }, [slides]);

  if (!slides.length) return null;
  const current = slides[Math.min(active, slides.length - 1)];

  return <div className="home-buy-banner" aria-label="Mua và bán xe tại Toàn Trung">
    <a href={current.href} aria-label={current.alt}>
      {slides.map((slide, index) => <span key={slide.key} className={`home-buy-banner__slide${index === Math.min(active, slides.length - 1) ? ' is-active' : ''}`} aria-hidden="true">
        <span className="home-buy-banner__backdrop" style={{ backgroundImage: `url(${JSON.stringify(getImageDeliveryUrl({src:slide.src,width:640,kind:'hero'}))})` }} />
        <ResponsiveImage src={slide.src} profile="hero" sizes="(max-width:1024px) 100vw, 1024px" alt="" width="1024" height="177" decoding="async" />
      </span>)}
    </a>
  </div>;
}
