import { permanentRedirect } from 'next/navigation';
import { articlePageNumber } from '@/lib/article-pagination';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const news = articlePageNumber(params['tin-tuc-page'] || params.page);
  const faqs = articlePageNumber(params['cau-hoi-page']);
  const experiences = articlePageNumber(params['kinh-nghiem-page']);
  if (news > 1) query.set('tin-tuc-page', String(news));
  if (faqs > 1) query.set('cau-hoi-page', String(faqs));
  if (experiences > 1) query.set('kinh-nghiem-page', String(experiences));
  permanentRedirect(`/bai-viet${query.size ? `?${query}` : ''}`);
}
