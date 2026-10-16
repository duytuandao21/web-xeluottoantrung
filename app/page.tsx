import type { Metadata } from "next";
import LegacyPage from "@/components/common/LegacyPage";
import AccessoryCarousel from "@/components/accessories/AccessoryCarousel";
import { optionalPublicApi, publicApi } from "@/lib/public-api";
import type { Accessory, Article, PageResult, SeoRecord } from "@/lib/public-api";
import { replaceHomeBottom } from "@/lib/home-bottom";
import { homeNeedsPromo } from "@/lib/home-needs-promo";
import { homeBannerArtwork } from "@/lib/home-banner-artwork";
import type { BannerSlide } from "@/components/common/BuySellBanner";
import { serviceStepList, type ServiceStep } from '@/lib/service-step-markup';
import { getRequestPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/page-metadata";
import { measuredCheerio } from '@/lib/measured-cheerio';
import { perfAsync, perfSync } from '@/lib/perf-observer';
import { publicContent } from '@/lib/public-content';
const { load } = measuredCheerio('home-component');
import HomeScrollReveal from '@/components/common/HomeScrollReveal';
import HomeServicesMotion from '@/components/common/HomeServicesMotion';
import '@/components/common/home-services.css';
import '@/components/common/home-needs-promo.css';
import '@/components/common/home-cars-heading.css';
import '@/components/common/home-cars-frame.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [page, seo] = await Promise.all([
    getRequestPublicPage('/'), optionalPublicApi<SeoRecord>('/seo', { route: '/' }),
  ]);
  return pageMetadata(page, '/', seo);
}

// Set false to restore the separate heading and car list before this preview.
const HOME_CARS_FRAMED_PREVIEW = true;
const services = [
  { key: 'mua-xe', label: 'Mua xe', href: '/san-pham' },
  { key: 'ban-xe', label: 'Bán xe', href: '/ban-xe' },
  { key: 'len-doi', label: 'Lên đời', href: '/len-doi' },
] as const;

export default async function HomePage() {
  return perfAsync('ssr.component', 'home', async () => {
  const [page, steps, articles, accessories] = await Promise.all([
    getRequestPublicPage('/'),
    Promise.all(services.map(service => publicContent<ServiceStep>(`thiet-lap-cac-buoc-${service.key}`))),
    publicApi<PageResult<Article>>('/articles', { limit: 3 }),
    publicApi<PageResult<Accessory>>('/accessories', { limit: 100 }).catch(() => null),
  ]);
  if (!page) return null;
  return perfSync('cheerio.transform', 'home-component', () => {
  const $ = load(page.content, {}, false);
  const buyPanel = $('.wap_muaxe .muaxe').first();
  buyPanel.closest('.wap_muaxe').addClass('tt-home-buy-sell');
  const budgetRow = buyPanel.children('.cuonngang').has('.ngansach').first();
  if (budgetRow.length) {
    buyPanel.closest('.wap_muaxe').addClass('tt-home-needs');
    budgetRow.after(homeNeedsPromo);
  }
  const searchRow = buyPanel.children('.search').first();
  const buyBanner = buyPanel.children('.home-buy-banner').first();
  if (buyBanner.length) {
    const slides = JSON.parse(buyBanner.attr('data-slides') || '[]') as BannerSlide[];
    const artworks = slides.map(slide => homeBannerArtwork(slide.src));
    buyBanner.attr('data-slides', JSON.stringify(slides.map((slide, index) => ({ ...slide, ...artworks[index] }))));
    if (slides.length && artworks.every(Boolean)) buyPanel.addClass('tt-home-fitted-banners');
  }
  if (searchRow.length && buyBanner.length) searchRow.after(buyBanner);
  $('.wap_sanpham .load_them').removeClass('load_them').find('a').attr('href', '/san-pham');
  const section = $('.wap_dichvu').first().addClass('tt-home-services');
  section.find('.title-main').first().html('<h2>Dịch vụ của TOÀN TRUNG</h2>');
  section.children('.dichvu').remove();
  services.forEach((service, index) => {
    const panel = $('<div class="dichvu" role="tabpanel"></div>').attr({
      'data-service': `buoc-${service.key}`, id: `service-${service.key}`, 'aria-labelledby': `tab-${service.key}`,
    });
    if (index) panel.attr('hidden', 'hidden');
    if (steps[index].length) panel.append(serviceStepList(steps[index], service.key));
    else panel.append('<p class="main_fix">Nội dung đang được cập nhật.</p>');
    panel.append($('<p class="xemtatca"></p>').append($('<a></a>').attr('href', service.href).text(`${service.label} ngay`)));
    section.append(panel);
    section.find(`.cap1 li[data-id="buoc-${service.key}"]`).attr({
      role: 'tab', id: `tab-${service.key}`, 'aria-controls': `service-${service.key}`,
      tabindex: index ? '-1' : '0', 'aria-selected': String(index === 0),
    }).toggleClass('active', index === 0);
  });
  section.find('.cap1').attr({ role: 'tablist', 'aria-label': 'Dịch vụ của Toàn Trung' });
  replaceHomeBottom($, articles.data);
  $('.wap_sanpham').first().addClass('tt-home-cars')
    .toggleClass('tt-home-cars--framed', HOME_CARS_FRAMED_PREVIEW)
    .after('<div id="tt-accessories-root"></div>');
  const carsTitle = $('.tt-home-cars > .td_kp').first();
  carsTitle.wrap('<div class="main_fix tt-home-cars__heading"></div>');
  carsTitle.prepend('<svg class="tt-home-cars__heading-shape tt-home-cars__heading-shape--desktop" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="tt-home-cars__heading-fold" d="M0 0C14-14 32-14 52 0ZM548 0C568-14 586-14 600 0Z"/><path d="M23.75-10.5H576.25C567.5-10.5 558-7 548 0C540 6 538 16 532 30L518 60C512 74 502 80 486 80H114C98 80 88 74 82 60L68 30C62 16 60 6 52 0C42-7 32.5-10.5 23.75-10.5Z"/></svg><svg class="tt-home-cars__heading-shape tt-home-cars__heading-shape--mobile" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="tt-home-cars__heading-fold" d="M0 0C22-22 48-22 76 0ZM524 0C552-22 578-22 600 0Z"/><path d="M35.75-16.5H564.25C550.5-16.5 538-11 524 0C516 8 514 18 508 32L494 60C488 74 478 80 462 80H138C122 80 112 74 106 60L92 32C86 18 84 8 76 0C62-11 49.5-16.5 35.75-16.5Z"/></svg>');
  return <HomeScrollReveal><LegacyPage page={{ ...page, content: $.html() }} />
    <HomeServicesMotion />
    <AccessoryCarousel items={accessories?.data ?? []} /></HomeScrollReveal>;
  });
  });
}

