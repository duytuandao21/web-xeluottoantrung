import { publicApi, PublicApiError, type PublicLookup } from '@/lib/public-api';

export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get('brand') || '';
  const headers = { 'Cache-Control': 'no-store' };
  if (brand.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand)) {
    return Response.json({ message: 'Hãng xe không hợp lệ.' }, { status: 400, headers });
  }
  try {
    const models = await publicApi<PublicLookup[]>(`/brands/${brand}/models`);
    return Response.json({ models }, { headers });
  } catch (error) {
    return Response.json({ message: 'Chưa tải được dòng xe. Vui lòng thử lại.' }, {
      status: error instanceof PublicApiError && error.status === 404 ? 404 : 503, headers,
    });
  }
}
