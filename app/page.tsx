import type { Metadata } from "next";
import LegacyPage from "@/components/common/LegacyPage";
import AccessoryCarousel from "@/components/accessories/AccessoryCarousel";
import { optionalPublicApi, publicApi } from "@/lib/public-api";
import type { Accessory, Article, PageResult, SeoRecord } from "@/lib/public-api";
import { replaceHomeBottom } from "@/lib/home-bottom";
import { safeHtml } from "@/lib/safe-html";
import { getRequestPublicPage } from "@/lib/public-pages";
import { pageMetadata } from "@/lib/page-metadata";
import { load } from "cheerio";
import HomeScrollReveal from '@/components/common/HomeScrollReveal';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [page, seo] = await Promise.all([
    getRequestPublicPage('/'), optionalPublicApi<SeoRecord>('/seo', { route: '/' }),
  ]);
  return pageMetadata(page, '/', seo);
}

type ServiceStep = { title: string; body?: string | null; imageUrl?: string | null };
const services = [
  { key: 'mua-xe', label: 'Mua xe', href: '/san-pham' },
  { key: 'ban-xe', label: 'Bán xe', href: '/ban-xe' },
  { key: 'len-doi', label: 'Lên đời', href: '/len-doi' },
];

export default async function HomePage() {
  const [page, steps, articles, accessories] = await Promise.all([
    getRequestPublicPage('/'),
    Promise.all(services.map(service => publicApi<ServiceStep[]>('/content', { group: `thiet-lap-cac-buoc-${service.key}` }))),
    publicApi<PageResult<Article>>('/articles', { limit: 3 }),
    publicApi<PageResult<Accessory>>('/accessories', { limit: 100 }).catch(() => null),
  ]);
  if (!page) return null;
  const $ = load(page.content, {}, false);
  $('.wap_sanpham .load_them').removeClass('load_them').find('a').attr('href', '/san-pham');
  const section = $('.wap_dichvu');
  section.children('.dichvu').remove();
  services.forEach((service, index) => {
    const panel = $('<div class="dichvu" role="tabpanel"></div>').attr({
      'data-service': `buoc-${service.key}`, id: `service-${service.key}`, 'aria-labelledby': `tab-${service.key}`,
    });
    if (index) panel.attr('hidden', 'hidden');
    const cards = $('<div class="main_fix slick4321 control_slick"></div>');
    steps[index].forEach((step, stepIndex) => {
      const card = $('<div class="item_buoc"></div>').append($('<span class="so"></span>').text(String(stepIndex + 1)));
      if (step.imageUrl) card.append($('<p class="img_post"></p>').append($('<img>').attr({ src: step.imageUrl, alt: step.title, loading: 'lazy' })));
      card.append($('<div class="mota"></div>')
        .append($('<h4 class="name_post"></h4>').text(step.title))
        .append($('<div class="desc_post catchuoi4"></div>').html(safeHtml(step.body || ''))));
      cards.append($('<div></div>').append(card));
    });
    if (steps[index].length) panel.append(cards);
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
  $('.wap_sanpham').first().addClass('tt-home-cars').after('<div id="tt-accessories-root"></div>');
  return <HomeScrollReveal><LegacyPage page={{ ...page, content: $.html() }} />
    <AccessoryCarousel items={accessories?.data ?? []} /></HomeScrollReveal>;
}

