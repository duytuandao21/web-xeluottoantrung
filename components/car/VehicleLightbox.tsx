"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

type GalleryImage = { src: string; alt: string; href: string };
type Transform = { scale: number; x: number; y: number };
const initialTransform: Transform = { scale: 1, x: 0, y: 0 };

export default function VehicleLightbox({ images, initialIndex, onClose }: {
  images: GalleryImage[]; initialIndex: number; onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [transform, setTransform] = useState<Transform>(initialTransform);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selectedThumbRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);

  const changeImage = useCallback((next: number) => {
    setIndex((next + images.length) % images.length);
    setTransform(initialTransform);
    dragRef.current = null;
  }, [images.length]);

  const clampPan = useCallback((scale: number, x: number, y: number): Transform => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || scale <= 1) return initialTransform;
    const maxX = Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2);
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      setTransform(current => {
        const scale = Math.max(1, Math.min(5, current.scale * Math.exp(-event.deltaY * 0.0015)));
        const ratio = scale / current.scale;
        return clampPan(scale, cursorX - (cursorX - current.x) * ratio,
          cursorY - (cursorY - current.y) * ratio);
      });
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage.removeEventListener('wheel', wheel);
  }, [clampPan]);

  useEffect(() => {
    if (!playing || images.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => {
      setTransform(initialTransform);
      return (current + 1) % images.length;
    }), 3000);
    return () => window.clearInterval(timer);
  }, [playing, images.length]);

  useEffect(() => {
    selectedThumbRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [index]);

  useEffect(() => {
    const root = rootRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === root);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      if (document.fullscreenElement === root) void document.exitFullscreen();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.fullscreenElement === rootRef.current) void document.exitFullscreen();
        else onClose();
      }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changeImage(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); changeImage(index + 1); }
      if (event.key === 'Tab') {
        const controls = rootRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [changeImage, index, onClose]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen();
  };
  const pointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (transform.scale <= 1) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      x: transform.x, y: transform.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTransform(current => clampPan(current.scale, drag.x + event.clientX - drag.clientX,
      drag.y + event.clientY - drag.clientY));
  };
  const pointerEnd = (event: PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const image = images[index];
  return createPortal(
    <div className="vehicle-lightbox" ref={rootRef} role="dialog" aria-modal="true" aria-label="Thư viện ảnh xe">
      <div className="vehicle-lightbox__toolbar">
        <span className="vehicle-lightbox__count">{index + 1} / {images.length}</span>
        <div className="vehicle-lightbox__actions">
          <button type="button" aria-label={playing ? 'Dừng trình chiếu' : 'Bắt đầu trình chiếu'} title={playing ? 'Dừng trình chiếu' : 'Trình chiếu'}
            aria-pressed={playing} onClick={() => setPlaying(value => !value)} disabled={images.length < 2}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'} title={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? '⤡' : '⤢'}</button>
          <button type="button" ref={closeRef} aria-label="Đóng thư viện ảnh" title="Đóng" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="vehicle-lightbox__stage" ref={stageRef} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        {images.length > 1 && <button type="button" className="vehicle-lightbox__arrow vehicle-lightbox__arrow--left"
          aria-label="Ảnh trước" onClick={() => changeImage(index - 1)}>‹</button>}
        <img ref={imageRef} src={image.href || image.src} alt={image.alt} draggable={false}
          className="vehicle-lightbox__image" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            cursor: transform.scale > 1 ? 'grab' : 'default' }}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} />
        {images.length > 1 && <button type="button" className="vehicle-lightbox__arrow vehicle-lightbox__arrow--right"
          aria-label="Ảnh tiếp theo" onClick={() => changeImage(index + 1)}>›</button>}
      </div>
      <div className="vehicle-lightbox__footer">
        <span className="vehicle-lightbox__hint">Cuộn để phóng to · Kéo ảnh để di chuyển</span>
        <div className="vehicle-lightbox__thumbnails" aria-label="Danh sách ảnh xe">
          {images.map((item, position) => <button key={`${item.href}-${position}`} type="button"
            ref={position === index ? selectedThumbRef : undefined} className={position === index ? 'is-active' : ''}
            aria-label={`Xem ảnh ${position + 1}`} aria-current={position === index ? 'true' : undefined}
            onClick={() => changeImage(position)}><img src={item.src} alt={item.alt} /></button>)}
        </div>
      </div>
    </div>, document.body);
}
