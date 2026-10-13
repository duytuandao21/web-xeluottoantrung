import type { Metadata } from 'next';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import PromotionListing from '@/components/promotions/PromotionListing';
import { publicApi, type PageResult } from '@/lib/public-api';
import type { Promotion } from '@/lib/promotions';
import '@/components/promotions/promotions.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Khuyến mãi & Sự kiện', description: 'Cập nhật chương trình ưu đãi và sự kiện tại Auto Toàn Trung.' };
export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(requested) && requested >= 1 && requested <= 100000 ? requested : 1;
  let result: PageResult<Promotion>, unavailable = false;
  try { result = await publicApi<PageResult<Promotion>>('/promotions', { page, limit: 6 }); }
  catch { unavailable = true; result = { data: [], meta: { page, limit: 6, total: 0, totalPages: 0 } }; }
  const selected = Array.isArray(params['chuong-trinh']) ? params['chuong-trinh'][0] : params['chuong-trinh'];
  const selectedId = selected && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected) ? selected : undefined;
  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Khuyến mãi & Sự kiện' }]} />
    <main className="main_content main_fix tt-service-list tt-promotions-page" aria-labelledby="promotions-title">
    <header className="title-main tt-promotions-page__heading"><h1 id="promotions-title">Khuyến mãi & Sự kiện</h1></header>
    {unavailable ? <div className="tt-promotions-empty" role="status"><h2>Chưa tải được chương trình</h2><p>Vui lòng tải lại trang sau ít phút.</p></div> : <PromotionListing key={page} result={result} selectedId={selectedId} />}
    </main>
  </>;
}
