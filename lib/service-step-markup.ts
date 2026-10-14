import 'server-only';
import { load } from 'cheerio';
import { safeHtml } from './safe-html';

export type ServiceStep = { title: string; body?: string | null; imageUrl?: string | null };
export type ServiceKey = 'mua-xe' | 'ban-xe' | 'len-doi';

// Shared markup keeps homepage and service landing steps visually identical.
export function serviceStepList(steps: ServiceStep[], key: ServiceKey) {
  const $ = load('<ol class="main_fix tt-home-service-steps"></ol>', {}, false);
  const cards = $('ol');
  steps.forEach((step, index) => {
    const card = $('<li class="tt-home-service-step"></li>'), gradientId = `service-path-${key}-${index}`;
    card.append(`<svg class="tt-home-service-step__connector" viewBox="0 0 200 64" fill="none" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#ffda78"/><stop offset=".5" stop-color="#dfa21b"/><stop offset="1" stop-color="#ffca50"/></linearGradient></defs><path d="M0 16C40 16 50 56 100 56S160 16 200 16" stroke="url(#${gradientId})" stroke-width="3.5"/><path d="m94 2 8 8-8 8m12-16 8 8-8 8" stroke="#ffc54b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
    const icon = $('<div class="tt-home-service-step__icon item_qt"></div>');
    if(step.imageUrl && (/exchange5565998-3028\.png(?:\?|$)/.test(step.imageUrl) || key === 'mua-xe' && /thử xe.*đàm phán/iu.test(step.title))) icon.addClass('tt-home-service-step__icon--exchange');
    if(step.imageUrl) icon.append($('<img>').attr({ src: step.imageUrl, alt: '', loading: 'lazy', decoding: 'async', width: '90', height: '90', sizes: '(max-width: 640px) 80px, 88px' }));
    else icon.append('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 12 4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    icon.append($('<span class="tt-home-service-step__number" aria-hidden="true"></span>').text(String(index + 1).padStart(2, '0')));
    card.append(icon, $('<div class="tt-home-service-step__content"></div>')
      .append($('<h3 class="tt-home-service-step__title"></h3>').text(step.title))
      .append($('<div class="tt-home-service-step__description"></div>').html(safeHtml(step.body || ''))));
    cards.append(card);
  });
  return $.html();
}
