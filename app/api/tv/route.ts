import { getTVSnapshot } from '@/lib/tv-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try { return Response.json(await getTVSnapshot(), { headers }); }
  catch { return Response.json({ message: 'Chưa tải được danh sách xe.' }, { status: 503, headers }); }
}
