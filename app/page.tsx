import type { Metadata } from "next";
import LegacyPage from "@/components/common/LegacyPage";
import { getLegacyPage } from "@/lib/pages";
import { load } from "cheerio";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getLegacyPage("/");
  return { title: page?.title, description: page?.description || undefined, alternates: { canonical: "/" }, openGraph: page?.openGraphImage ? { images: [page.openGraphImage.startsWith("/") ? page.openGraphImage : `/${page.openGraphImage}`] } : undefined };
}

export default async function HomePage() {
  const [page, listing, sellPage] = await Promise.all([getLegacyPage("/"), getLegacyPage("/san-pham"), getLegacyPage("/ban-xe")]);
  if (!page) return null;
  if (!listing) return <LegacyPage page={page} />;

  const $ = load(page.content, {}, false);
  const cars = load(listing.content, {}, false);
  const featuredKeys = cars('.wap_item > car-card').slice(0, 6).toArray()
    .map((card) => cars(card).attr('data-key')).filter((key): key is string => Boolean(key));

  $('.wap_sanpham .loadthem_sp1').html(featuredKeys.map((key) => `<car-card data-key="${key}"></car-card>`).join(''));
  $('.wap_sanpham .load_them').removeClass('load_them').find('a').attr('href', '/san-pham');

  if (sellPage) {
    const sell = load(sellPage.content, {}, false);
    const sellSteps = sell('.wap_dichvu2 .dichvu .main_fix.slick4321').first();
    const buyPanel = $('.wap_dichvu > .dichvu').first();
    if (sellSteps.find('.item_buoc').length === 4 && buyPanel.length) {
      buyPanel.attr({ 'data-service': 'buoc-mua-xe', role: 'tabpanel', 'aria-label': 'Các bước mua xe' });
      const sellPanel = $('<div class="dichvu" data-service="buoc-ban-xe" role="tabpanel" aria-label="Các bước bán xe" hidden></div>');
      sellPanel.append(sellSteps.clone());
      sellPanel.append('<p class="xemtatca"><a href="/ban-xe">Bán xe ngay</a></p>');
      buyPanel.after(sellPanel);
      $('.wap_dichvu .cap1').attr('role', 'tablist').attr('aria-label', 'Dịch vụ của Toàn Trung');
      $('.wap_dichvu .cap1 li').each((_, element) => {
        const tab = $(element);
        const active = tab.attr('data-id') === 'buoc-mua-xe';
        tab.attr({ role: 'tab', tabindex: active ? '0' : '-1', 'aria-selected': String(active) });
      });
    }
  }

  return <LegacyPage page={{...page, content: $.html()}} />;
}
