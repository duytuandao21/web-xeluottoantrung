import type { Car } from '@/types/car';
import type { PublicCar } from './public-api';

export function formatCarPrice(price: number): string {
  const millions = Math.round(price / 1_000_000);
  const billions = Math.floor(millions / 1000);
  const rest = millions % 1000;
  return `${billions ? `${billions} Tỷ` : ''}${billions && rest ? ' ' : ''}${rest ? `${rest} Triệu` : ''}` || 'Liên hệ';
}

export function carToCard(car: PublicCar): Car {
  return {
    id: car.slug, className: 'item', imageClass: 'img_sp', name: car.name, href: `/${car.slug}`,
    title: car.name, nameClass: 'name_sp',
    images: [{ src: car.cover || '/thumbs/90x90x2/assets/images/noimage.png', alt: car.name }],
    priceHtml: `<b>${formatCarPrice(car.price)}</b>`, compare: true,
    status: car.status === 'deposit' ? 'Đã nhận cọc' : car.status === 'sold' ? 'Đã bán' : '',
    specs: [
      { icon: '/assets/images/km.png', alt: 'Km', text: `${Number(car.mileage || 0).toLocaleString('vi-VN')} km` },
      ...(car.seatCount ? [{ icon: '/assets/images/socho.png', alt: 'Số chỗ', text: `${car.seatCount} chỗ` }] : []),
      { icon: '/assets/images/hopso.png', alt: 'Hộp số', text: car.transmission || '—' },
      { icon: '/assets/images/nhienlieu.png', alt: 'Nhiên liệu', text: car.fuel || '—' },
      { icon: '/assets/images/bienso.png', alt: 'Năm sản xuất', text: String(car.year) },
      ...(car.branch ? [{ icon: '/assets/images/chinhanh.png', alt: 'Showroom', text: car.branch }] : []),
    ],
  };
}
