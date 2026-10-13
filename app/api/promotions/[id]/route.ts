import { NextResponse } from 'next/server';
import { publicApi, PublicApiError } from '@/lib/public-api';
import type { Promotion } from '@/lib/promotions';
import { safeHtml } from '@/lib/safe-html';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ message: 'Không tìm thấy chương trình.' }, { status: 404 });
  try {
    const promotion = await publicApi<Promotion>(`/promotions/${id}`);
    return NextResponse.json({ ...promotion, content: safeHtml(promotion.content || '') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch(error) {
    return NextResponse.json({ message: error instanceof PublicApiError && error.status === 404 ? 'Chương trình không còn hiển thị.' : 'Không tải được chương trình. Vui lòng thử lại.' },
      { status: error instanceof PublicApiError && error.status === 404 ? 404 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
