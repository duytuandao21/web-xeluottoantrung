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

export function faqDialogId(slug: string) {
  return `faq-answer-${slug}`;
}

export function faqDialogHtml(faq: Pick<Faq, 'slug' | 'question' | 'answer'>) {
  const $ = load('<div class="tt-faq-dialog" style="display:none"></div>', {}, false);
  const dialog = $('.tt-faq-dialog').attr('id', faqDialogId(faq.slug));
  dialog.append($('<h2></h2>').text(faq.question));
  const answer = $('<div class="tt-faq-dialog__body tt-article__body"></div>').html(safeHtml(faq.answer));
  answer.find('img').attr({ loading: 'lazy', decoding: 'async' });
  dialog.append(answer);
  return $.html();
}

export function faqCardsHtml(faqs: Faq[]) {
  const $ = load('<div class="tt-faq-grid"></div>', {}, false);
  const grid = $('.tt-faq-grid');
  for (const faq of faqs) {
    const dialogId = faqDialogId(faq.slug);
    const trigger = (className = '') => $('<button type="button" class="tt-faq-trigger"></button>')
      .addClass(className).attr({ 'data-src': `#${dialogId}`, 'aria-haspopup': 'dialog', 'aria-controls': dialogId });
    const card = $('<article class="tt-faq-card"></article>');
    if (faq.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(faq.imageUrl)) card.append(trigger('tt-faq-card__image').attr({ tabindex: '-1', 'aria-hidden': 'true' })
      .append($('<img loading="lazy" decoding="async">').attr({ src: faq.imageUrl, alt: '' })));
    card.append($('<div class="tt-faq-card__content"></div>')
      .append($('<h3></h3>').append(trigger().text(faq.question)))
      .append($('<p></p>').text(faqSummary(faq)))
      .append(trigger('tt-faq-card__link').attr('aria-label', `Đọc giải đáp: ${faq.question}`).text('Đọc giải đáp →')));
    card.append(faqDialogHtml(faq));
    grid.append(card);
  }
  return $.html();
}
