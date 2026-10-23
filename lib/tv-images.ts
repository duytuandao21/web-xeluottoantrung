import { responsiveImage } from './image-delivery';
import type { TVCar } from '@/types/tv';

export const TV_IMAGE_PLACEHOLDER = '/TV/image-unavailable.svg';
export const TV_PAGE_SIZE = 6;
export const TV_INTERVAL = 15_000;
export const TV_REFRESH_INTERVAL = 300_000;

export function tvImage(car: TVCar) {
  // Image slots are ~16vw on a landscape screen. Include cropped source pixels.
  const ratio = car.coverWidth && car.coverHeight ? car.coverWidth / car.coverHeight : 4 / 3;
  const scale = Math.max(1, ratio / (4 / 3));
  const sizes = `(orientation: portrait) ${34 * scale}vw, ${17 * scale}vw`;
  return responsiveImage(car.cover || TV_IMAGE_PLACEHOLDER, 'gallery', sizes,
    { width: car.coverWidth, height: car.coverHeight });
}

export function tvPrice(price: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(price / 1_000_000);
}

/** Wait on the actual DOM image, including SSR failures before hydration. */
export function prepareTVImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    let decoding = false;
    let done = false;
    let fallback = 0;
    const original = image.dataset.tvOriginal;
    const cleanup = () => {
      clearTimeout(timer);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true; cleanup();
      if (error) reject(error); else resolve();
    };
    const aborted = () => finish(new Error('TV image preparation aborted'));
    const arm = () => { clearTimeout(timer); timer = setTimeout(failed, 12_000); };
    const failed = () => {
      if (done) return;
      decoding = false;
      image.removeAttribute('srcset'); image.removeAttribute('sizes');
      if (fallback === 0 && original && new URL(original, location.href).href !== image.src) {
        fallback = 1; image.src = original; arm();
      } else if (fallback < 2) {
        fallback = 2; image.dataset.tvFailed = 'true';
        image.src = image.dataset.tvFallback || TV_IMAGE_PLACEHOLDER; arm();
      } else {
        // The local fallback may itself be unavailable while offline. Its label
        // still reserves the image frame; never switch into an unfinished image.
        image.dataset.tvFailed = 'true'; image.style.visibility = 'hidden'; finish();
      }
    };
    const loaded = () => {
      if (done || decoding || !image.complete || image.naturalWidth === 0) return;
      decoding = true;
      void image.decode().then(() => finish()).catch(failed);
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) return aborted();
    arm();
    if (image.complete) { if (image.naturalWidth) loaded(); else failed(); }
  });
}
