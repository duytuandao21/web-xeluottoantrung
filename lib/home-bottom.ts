import 'server-only';

import { load } from 'cheerio';
import shared from '@/data/shared.json';
import type { Article } from './public-api';

const utilityIcons: Record<string, string> = {
  '/tien-ich/dinh-gia-xe': '/images/utilities/dinh-gia-xe.svg',
  '/tien-ich/tra-cuu-phat-nguoi': '/images/utilities/tra-cuu-phat-nguoi.svg',
  '/tien-ich/xem-ngay-mua-xe': '/images/utilities/xem-ngay-mua-xe.svg',
  '/tien-ich/xem-gia-xang-dau': '/images/utilities/xem-gia-xang-dau.svg',
};
const safeImage = (value?: string | null) => value && /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : null;

function articleDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function replaceHomeBottom($: ReturnType<typeof load>, articles: Article[]) {
  const bottom = $('<div class="tt-home-bottom"></div>');
  const utilities = $('<section class="tt-home-utilities" aria-labelledby="tt-home-utilities-title"></section>');
  const utilitiesInner = $('<div class="main_fix"></div>');
  utilitiesInner.append('<div class="tt-home-section-heading"><span class="tt-home-section-heading__line" aria-hidden="true"></span><h2 id="tt-home-utilities-title">Tiện ích</h2></div>');
  const utilityGrid = $('<div class="tt-home-utility-grid"></div>');
  const utilityMenu = shared.menu.find(item => item.label === 'Tiện ích');
  for (const item of utilityMenu?.children || []) {
    if (!item.href) continue;
    const link = $('<a class="tt-home-utility"></a>').attr('href', item.href);
    const icon = utilityIcons[item.href];
    if (icon) link.append($('<img class="tt-home-utility__icon" alt="" width="62" height="62" loading="lazy" decoding="async">').attr('src', icon));
    link.append($('<span class="tt-home-utility__name"></span>').text(item.label));
    utilityGrid.append(link);
  }
  utilitiesInner.append(utilityGrid);
  utilities.append(utilitiesInner);
  bottom.append(utilities);

  const news = $('<section class="tt-home-news" aria-labelledby="tt-home-news-title"></section>');
  const newsInner = $('<div class="main_fix"></div>');
  const newsHeading = $('<div class="tt-home-news-heading"></div>');
  newsHeading.append('<div class="tt-home-section-heading"><span class="tt-home-section-heading__line" aria-hidden="true"></span><h2 id="tt-home-news-title">Tin tức mới nhất</h2></div>');
  newsInner.append(newsHeading);
  const newsGrid = $('<div class="tt-home-news-grid"></div>');
  if (articles.length === 1) newsGrid.addClass('tt-home-news-grid--single');
  else if (articles.length === 2) newsGrid.addClass('tt-home-news-grid--two');
  for (const article of articles.slice(0, 3)) {
    const href = `/${encodeURIComponent(article.slug)}`;
    const card = $('<article class="tt-home-news-card"></article>');
    const imageLink = $('<a class="tt-home-news-card__image" aria-label="Xem bài viết"></a>').attr('href', href);
    imageLink.append('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM7 8h10M7 11h10M7 14h6M7 17h10"/></svg>');
    const image = safeImage(article.imageUrl);
    if (image) imageLink.append($('<img loading="lazy" decoding="async">').attr({ src: image, alt: article.title }));
    card.append(imageLink);
    const content = $('<div class="tt-home-news-card__content"></div>');
    const date = articleDate(article.publishedAt);
    if (date) content.append($('<time class="tt-home-news-card__date"></time>').attr('datetime', new Date(article.publishedAt!).toISOString()).text(date));
    content.append($('<h3></h3>').append($('<a></a>').attr('href', href).text(article.title)));
    if (article.excerpt?.trim()) content.append($('<p></p>').text(article.excerpt.trim()));
    card.append(content);
    newsGrid.append(card);
  }
  if (!articles.length) newsGrid.append('<p class="tt-home-news-empty">Tin tức đang được cập nhật.</p>');
  newsInner.append(newsGrid);
  newsInner.append('<p class="tt-home-news-more"><a class="tt-home-news-all" href="/tin-tuc">Xem tất cả tin tức</a></p>');
  news.append(newsInner);
  bottom.append(news);

  const platform = $('.wap_nentang').first();
  if (platform.length) platform.replaceWith(bottom);
  else $('.wap_sanpham_f').first().replaceWith(bottom);
  $('.wap_sanpham_f').remove();
}
