// Public fixture only: no real API, database or Admin writes.
import { createServer } from 'node:http';
const picture = '/images/ban-xe-banner.png';
const cars = [0, 1, 2, 3, 4, 5].map(i => ({ slug: `font-car-${i}`, name: `Xe Lướt Toàn Trung — Toyota Vios ${2025 - i}`,
  year: 2025 - i, price: 433000000, originalPrice: 450000000, mileage: 20000, status: 'active', newArrival: false,
  fuel: 'Xăng', transmission: 'Số tự động', seatCount: 5, cover: picture, brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' } }));
const paged = data => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const requests = [];
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  requests.push(url.pathname + url.search);
  let data = paged([]), status = 200;
  if (url.pathname.includes('/articles/') || url.pathname.includes('/pages/')) { status = 404; data = {}; }
  else if (url.pathname.includes('/cars/') && !url.pathname.endsWith('/menu')) data = { ...cars[0], id: 'css-car',
    media: [picture, '/images/mua-xe-banner.png'].map((url, sortOrder) => ({ url, isCover: sortOrder === 0, sortOrder })),
    specifications: [{ key: 'engine', label: 'Động cơ', value: '1.5L', sortOrder: 0 }], description: '<p>Xe kiểm thử CSS</p>' };
  else if (url.pathname.endsWith('/cars/menu')) data = { data: cars.slice(0, 3) };
  else if (url.pathname.endsWith('/cars')) data = paged(cars);
  else if (url.pathname.endsWith('/brands')) data = [{ id: 'toyota', name: 'Toyota', slug: 'toyota', imageUrl: picture, stockCount: 6 }];
  else if (url.pathname.endsWith('/slides')) data = paged([{ id: 'hero', title: 'Khám phá xe mới về', imageUrl: picture, link: '/san-pham' }]);
  else if (url.pathname.endsWith('/content')) data = [{ id: url.searchParams.get('group'), key: 'chinh-sach-quyen-rieng-tu',
    title: 'Tư vấn minh bạch, tận tâm — Ưu đãi & bảo hành', body: '<p>Đầy đủ tiếng Việt: Ắ Ằ Ẳ Ẵ Ặ Ấ Ầ Ẩ Ẫ Ậ — Giá 433 triệu ₫.</p>', imageUrl: picture, link: '/san-pham', sortOrder: 0 }];
  else if (url.pathname.includes('/site-settings/')) data = url.pathname.endsWith('thiet-lap-thong-tin')
    ? [{ key: 'site_name', value: 'Xe Lướt Toàn Trung' }]
    : [{ key: 'logo', value: picture }];
  else if (url.pathname.endsWith('/seo')) data = { metaTitle: 'Xe Lướt Toàn Trung — Kiểm thử font', metaDescription: 'Giữ nguyên nội dung và metadata.', robotsIndex: true, robotsFollow: true };
  else if (url.pathname.endsWith('/testimonials')) data = paged([{ id: 'customer', name: 'Khách hàng kiểm thử', content: 'Thủ tục rõ ràng, dễ dàng lựa chọn.', rating: 5 }]);
  else if (url.pathname.endsWith('/articles')) data = paged([{ slug: 'font-news', title: 'Kinh nghiệm mua xe: an tâm và tiết kiệm', excerpt: 'Tính toán chi phí, ưu đãi hợp lý.', status: 'published', imageUrl: picture }]);
  else if (url.pathname.endsWith('/accessories')) data = paged([{ id: 'accessory', name: 'Cảm biến áp suất lốp', brand: 'ICAR', price: 2800000, imageUrl: picture, imageUrls: [] }]);
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));

export { api, listen, requests };
