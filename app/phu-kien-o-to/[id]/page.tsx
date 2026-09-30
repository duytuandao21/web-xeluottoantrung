import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import CarGallery from '@/components/car/CarGallery';
import AccessoryCallback from '@/components/accessories/AccessoryCallback';
import InstallationStoreCard from '@/components/accessories/InstallationStoreCard';
import RelatedAccessories from '@/components/accessories/RelatedAccessories';
import SiteBreadcrumb from '@/components/common/SiteBreadcrumb';
import { optionalPublicApi, publicApi, type Accessory, type PageResult } from '@/lib/public-api';
import { safeHtml } from '@/lib/safe-html';
import { zaloHref } from '@/lib/contact-links';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const getAccessory = cache(async (id: string) => validId(id) ? optionalPublicApi<Accessory>(`/accessories/${id}`) : null);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await getAccessory((await params).id);
  if (!item) return { title: 'Không tìm thấy phụ kiện' };
  return {
    title: `${item.name} | Phụ kiện ô tô`,
    description: `${item.name} - ${Number(item.price).toLocaleString('vi-VN')} đ. Xem ảnh và thông tin phụ kiện tại Toàn Trung.`,
    openGraph: { images: [item.imageUrl] },
  };
}

export default async function AccessoryDetailPage({ params }: PageProps) {
  const item = await getAccessory((await params).id);
  if (!item) notFound();
  const [sameBrand, latest, settings, storeSettings] = await Promise.all([
    item.brandId ? publicApi<PageResult<Accessory>>('/accessories', { brandId: item.brandId, limit: 12 }) : Promise.resolve(null),
    publicApi<PageResult<Accessory>>('/accessories', { limit: 24, sort: 'newest' }),
    publicApi<{ key: string; value: string }[]>('/site-settings/thiet-lap-thong-tin'),
    publicApi<{ key: string; value: string }[]>('/site-settings/phu-kien-o-to-cua-hang-lap-dat'),
  ]);
  const related = [...new Map([...(sameBrand?.data ?? []), ...latest.data]
    .filter(accessory => accessory.id !== item.id).map(accessory => [accessory.id, accessory])).values()].slice(0, 12);
  const info = Object.fromEntries(settings.map(setting => [setting.key, setting.value]));
  const hotline = info.phone || '0777393913';
  const telephone = hotline.replace(/[^+\d]/g, '');
  const installation = Object.fromEntries(storeSettings.map(setting => [setting.key, setting.value]));
  const mapUrl = (() => {
    try {
      const url = new URL(installation.mapUrl || 'https://maps.app.goo.gl/ngdzfJ3qnvWKDbS79');
      return url.protocol === 'https:' ? url.href : 'https://maps.app.goo.gl/ngdzfJ3qnvWKDbS79';
    } catch { return 'https://maps.app.goo.gl/ngdzfJ3qnvWKDbS79'; }
  })();
  const store = {
    name: installation.storeName?.trim() || 'Toàn Trung',
    location: installation.location?.trim() || 'TP.HCM',
    phone: installation.phone?.trim() || hotline,
    mapUrl,
    coverImageUrl: /^(https:\/\/|\/(?!\/))/i.test(installation.coverImageUrl || '') ? installation.coverImageUrl : undefined,
    logoImageUrl: /^(https:\/\/|\/(?!\/))/i.test(installation.logoImageUrl || '') ? installation.logoImageUrl : '/upload/photo/logo-tt-gold-6981.png',
  };
  const images = [...new Set([item.imageUrl, ...(item.imageUrls || [])])]
    .filter(url => /^(https?:\/\/|\/(?!\/))/i.test(url))
    .map((url, index) => ({ src: url, href: url, alt: `${item.name} - ảnh ${index + 1}` }));
  const description = safeHtml(item.description?.trim() || '');

  return <>
    <SiteBreadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Phụ kiện ô tô', href: '/phu-kien-o-to' }, { label: item.name }]} />
    <main className="tt-accessory-detail">
      <div className="main_fix tt-accessory-detail__top">
        <div className="tt-accessory-detail__gallery">
          {images.length ? <CarGallery images={images} subject="phụ kiện" /> : <div className="tt-accessory-detail__no-image">Ảnh phụ kiện đang được cập nhật.</div>}
        </div>
        <div className="tt-accessory-detail__sidebar">
          <div className="tt-accessory-detail__info">
            <div className="tt-accessory-detail__price"><strong>{Number(item.price).toLocaleString('vi-VN')} đ</strong></div>
            <h1>{item.name}</h1>
            <div className="tt-accessory-detail__contacts">
              <a href={`tel:${telephone}`} className="tt-accessory-detail__contact" aria-label={`Gọi Hotline ${hotline}`}>
                <span>Hotline</span><strong>{hotline}</strong>
              </a>
              <a href={zaloHref(info.zalo)} className="tt-accessory-detail__contact" target="_blank" rel="noopener noreferrer">
                <span>Liên hệ qua</span><strong><img src="/assets/images/zalo_ct.png" alt="" /> ZALO</strong>
              </a>
            </div>
            <AccessoryCallback name={item.name} />
          </div>
          <InstallationStoreCard store={store} />
        </div>
        <section className="vehicle-detail-description tt-accessory-detail__description" aria-labelledby="accessory-description-title">
          <h2 className="vehicle-detail-heading" id="accessory-description-title">Mô tả chi tiết</h2>
          <div className="vehicle-detail-description__body" dangerouslySetInnerHTML={{ __html: description || '<p>Mô tả chi tiết đang được cập nhật.</p>' }} />
        </section>
      </div>
      <RelatedAccessories items={related} />
    </main>
  </>;
}
