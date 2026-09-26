import LegacyContent from "@/components/common/LegacyContent";
import type { LegacyPageData } from "@/types/legacy";
import { load } from 'cheerio';

export default function LegacyPage({ page }: { page: LegacyPageData }) {
  const $ = load(page.content, {}, false);
  $('.breadCrumbs .main_fix').each((_, container) => {
    const root = $(container);
    const entries = root.find('.breadcrumb-item');
    const sources = entries.length ? entries : root.children('a,span');
    const trail = $('<ol class="site-breadcrumb"></ol>');
    sources.each((index, element) => {
      const source = $(element);
      const href = source.is('a') ? source.attr('href') : source.find('a').first().attr('href');
      const last = index === sources.length - 1;
      const label = href && !last ? $('<a></a>').attr('href', href) : $('<span></span>');
      label.text(source.text().trim());
      if (last) label.attr('aria-current', 'page');
      if (index === 0) label.prepend('<svg class="site-breadcrumb__home" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 12h3v10h6v-6h4v6h6V12h3L12 2Z"/></svg>');
      trail.append($('<li></li>').append(label));
    });
    if (sources.length) root.empty().append($('<nav aria-label="Đường dẫn"></nav>').append(trail));
  });
  return <LegacyContent key={page.route} html={$.html()} cars={page.cars || {}} />;
}
