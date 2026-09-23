import type { Metadata } from "next";
import LegacyPage from "@/components/common/LegacyPage";
import { getLegacyPage } from "@/lib/pages";
import { load } from "cheerio";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getLegacyPage("/");
  return { title: page?.title, description: page?.description || undefined, alternates: { canonical: "/" }, openGraph: page?.openGraphImage ? { images: [page.openGraphImage.startsWith("/") ? page.openGraphImage : `/${page.openGraphImage}`] } : undefined };
}

export default async function HomePage() {
  const [page, listing] = await Promise.all([getLegacyPage("/"), getLegacyPage("/san-pham")]);
  if (!page) return null;
  if (!listing) return <LegacyPage page={page} />;

  const $ = load(page.content, {}, false);
  const cars = load(listing.content, {}, false);
  const featuredKeys = cars('.wap_item > car-card').slice(0, 6).toArray()
    .map((card) => cars(card).attr('data-key')).filter((key): key is string => Boolean(key));

  $('.wap_sanpham .loadthem_sp1').html(featuredKeys.map((key) => `<car-card data-key="${key}"></car-card>`).join(''));
  $('.wap_sanpham .load_them').removeClass('load_them').find('a').attr('href', '/san-pham');

  return <LegacyPage page={{...page, content: $.html()}} />;
}
