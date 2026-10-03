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

export function renderWhyChoose($: ReturnType<typeof load>, entries: ContentEntry[], bannerImage?: string) {
  const section = $('.wap_visao');
  if (!entries.length) { section.remove(); return; }
  if (bannerImage !== undefined) {
    const image = assetUrl(bannerImage);
    const banner = section.find('.visao_r').empty();
    if (image) banner.append($('<img>').attr({ src: image, alt: 'Tại sao chọn chúng tôi?', loading: 'lazy', decoding: 'async' }));
    else banner.remove();
  }
  const container = section.find('.visao_l').empty();
  entries.forEach((entry, index) => {
    const card = $('<div class="item_vs"></div>');
    if (entry.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(entry.imageUrl)) card.append($('<p class="img_post"></p>')
      .append($('<img loading="lazy" decoding="async">').attr({ src: entry.imageUrl, alt: entry.title })));
    card.append($('<div class="mota"></div>')
      .append($('<h4 class="name_post"></h4>').addClass(`tk${index}`).text(entry.title))
      .append($('<div class="desc_post catchuoi4"></div>').html(safeHtml(entry.body || ''))));
    container.append(card);
  });
}
