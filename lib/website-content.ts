import 'server-only';
import { cache } from 'react';
import { load } from 'cheerio';
import { publicApi, type ContentEntry } from './public-api';
import { safeHtml } from './safe-html';
import { assetUrl } from './site-branding';

export const getPolicies = cache(() => publicApi<ContentEntry[]>('/content', { group: 'thiet-lap-chinh-sach-dieu-kien' }));
export const policyHref = (policy: Pick<ContentEntry, 'key'>) => `/${policy.key}`;

export function renderPolicyLinks($: ReturnType<typeof load>, policies: ContentEntry[]) {
  $('.chinhsach').each((_, element) => {
    const container = $(element).empty();
    if (!policies.length) { container.remove(); return; }
    container.append('Để tiếp tục, tôi đồng ý với ');
    policies.forEach((policy, index) => {
      if (index) container.append(' · ');
      container.append($('<a></a>').attr('href', policyHref(policy)).text(policy.title));
    });
  });
}

export function renderWhyChoose($: ReturnType<typeof load>, entries: ContentEntry[], bannerImage?: string, secondaryImages: (string | undefined)[] = []) {
  const section = $('.wap_visao');
  if (!entries.length) { section.remove(); return; }
  section.addClass('tt-why-choose');
  const banner = section.find('.visao_r').first();
  const mainImage = bannerImage ?? banner.find('img').first().attr('src');
  banner.empty().addClass('tt-why-media');
  banner.append('<span class="tt-why-media__dots" aria-hidden="true"></span>');
  const images = [mainImage, ...secondaryImages];
  const labels = ['Đội ngũ và showroom Toàn Trung', 'Showroom Toàn Trung', 'Khách hàng Toàn Trung'];
  ['main', 'top', 'bottom'].forEach((position, index) => {
    const frame = $('<div class="tt-why-media__frame"></div>').addClass(`tt-why-media__frame--${position}`);
    const image = assetUrl(images[index]);
    if (image) frame.append($('<img>').attr({ src: image, alt: labels[index], loading: 'lazy', decoding: 'async' }));
    else frame.addClass('tt-why-media__frame--empty').attr('aria-hidden', 'true').append('<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="22" height="20" rx="4"/><circle cx="12" cy="13" r="2"/><path d="m6 23 7-7 5 5 4-4 5 5"/></svg>');
    banner.append(frame);
  });
  const container = section.find('.visao_l').empty();
  entries.forEach((entry, index) => {
    const card = $('<div class="item_vs"></div>');
    if (entry.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(entry.imageUrl)) card.append($('<p class="img_post"></p>')
      .append($('<img loading="lazy" decoding="async">').attr({ src: entry.imageUrl, alt: entry.title })));
    card.append($('<div class="mota"></div>')
      .append($('<h4 class="name_post"></h4>').addClass(`tk${index}`).text(entry.title))
      .append($('<div class="desc_post"></div>').html(safeHtml(entry.body || ''))));
    container.append(card);
  });
}
