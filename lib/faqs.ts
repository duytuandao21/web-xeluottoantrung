import 'server-only';
import { cache } from 'react';
import { load } from 'cheerio';
import { optionalPublicApi, type Faq } from './public-api';
import { safeHtml } from './safe-html';

export const getFaq = cache((slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240
  ? optionalPublicApi<Faq>(`/faqs/${slug}`) : Promise.resolve(null));

export function faqSummary(faq: Faq) {
  return faq.excerpt || load(safeHtml(faq.answer), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function faqCardsHtml(faqs: Faq[]) {
  const $ = load('<div class="tt-faq-grid"></div>', {}, false);
  const grid = $('.tt-faq-grid');
  for (const faq of faqs) {
    const href = `/cau-hoi/${faq.slug}`;
    const card = $('<article class="tt-faq-card"></article>');
    if (faq.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(faq.imageUrl)) card.append($('<a class="tt-faq-card__image"></a>').attr({ href, tabindex: '-1', 'aria-hidden': 'true' })
      .append($('<img loading="lazy" decoding="async">').attr({ src: faq.imageUrl, alt: '' })));
    card.append($('<div class="tt-faq-card__content"></div>')
      .append($('<h3></h3>').append($('<a></a>').attr('href', href).text(faq.question)))
      .append($('<p></p>').text(faqSummary(faq)))
      .append($('<a class="tt-faq-card__link"></a>').attr({ href, 'aria-label': `Đọc giải đáp: ${faq.question}` }).text('Đọc giải đáp →')));
    grid.append(card);
  }
  return $.html();
}
