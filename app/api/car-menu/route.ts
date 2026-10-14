import { publicApi } from '@/lib/public-api';
import type { MenuCar } from '@/components/layout/BuyMenu';

export async function GET(request: Request) {
  const section = new URL(request.url).searchParams.get('section');
  const headers = { 'Cache-Control': 'no-store' };
  if (section !== 'new-arrivals' && section !== 'discounts')
    return Response.json({ message: 'Mục xe không hợp lệ.' }, { status: 400, headers });
  try {
    return Response.json(await publicApi<{ data: MenuCar[] }>('/cars/menu', { section }), { headers });
  } catch {
    return Response.json({ message: 'Chưa tải được xe. Vui lòng thử lại.' }, { status: 503, headers });
  }
}
