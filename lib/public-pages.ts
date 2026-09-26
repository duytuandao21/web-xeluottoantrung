import 'server-only';

import { load } from 'cheerio';
import type { Car } from '@/types/car';
import type { LegacyPageData, SearchParams } from '@/types/legacy';
import { carToCard, formatCarPrice } from './car-view';
import { getLegacyPage } from './pages';
import { safeHtml } from './safe-html';
import { optionRange, parseRangeQuery, type RangeGroup, type RangeOption } from './filter-options';
import { allPublicLookups, optionalPublicApi, publicApi, type Article, type CarDetail, type CmsPage, type Faq, type PageResult,
  type PublicBrand, type PublicCar, type PublicLookup, type Recruitment, type Service, type Slide, type Testimonial } from './public-api';

const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const positive = (value: string | undefined) => value && /^\d+$/.test(value) ? Math.max(1, Number(value)) : 1;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const publicHref = (value?: string | null) => value && /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : '/san-pham';

function cardMarkup(cars: PublicCar[]): { html: string; mapped: Record<string, Car> } {
  const mapped = Object.fromEntries(cars.map(car => [car.slug, carToCard(car)]));
  return { html: cars.map(car => `<car-card data-key="${escape(car.slug)}"></car-card>`).join(''), mapped };
}

async function filterLookups() {
  const [brands, styles, transmissions, colors, budgets, mileages, yearSuggestions, branches] = await Promise.all([
    publicApi<PublicBrand[]>('/brands'),
    allPublicLookups('/lookups/body-styles'),
    allPublicLookups('/lookups/transmissions'),
    allPublicLookups('/lookups/car-colors'),
    allPublicLookups<PublicLookup & RangeOption & { group: string }>('/lookups/filter-options', { group: 'budget' }),
    allPublicLookups<PublicLookup & RangeOption & { group: string }>('/lookups/filter-options', { group: 'mileage' }),
    publicApi<{ title: string }[]>('/content', { group: 'thiet-lap-goi-y-nam-san-xuat' }),
    allPublicLookups('/lookups/branches'),
  ]);
  return { brands, styles, transmissions, colors, branches, ranges: [...budgets, ...mileages], yearSuggestions };
}

async function populateCarFormBrands($: ReturnType<typeof load>) {
  const brands = await publicApi<PublicBrand[]>('/brands');
  for (const name of ['hangxe_lendoi', 'hangxe_lendoimm']) {
    const select = $(`select[name="${name}"]`);
    if (!select.length) continue;
    select.find('option:not(:first-child)').remove();
    for (const brand of brands) select.append($('<option></option>').attr('value', brand.slug).text(brand.name));
  }
}

async function listingPage(page: LegacyPageData, pathname: string, searchParams: SearchParams): Promise<LegacyPageData> {
  const $ = load(page.content, {}, false);
  const filters = await filterLookups();
  const sortValue = ['gia asc', 'gia desc'].includes(single(searchParams.gia) || '') ? single(searchParams.gia)! : 'newest';
  const sortSelect = $('<select id="vehicle-sort" aria-label="Sắp xếp xe"></select>');
  for (const [value, label] of [['newest', 'Mới nhất'], ['gia asc', 'Giá từ thấp đến cao'], ['gia desc', 'Giá từ cao đến thấp']]) {
    const option = $('<option></option>').attr('value', value).text(label);
    if (value === sortValue) option.attr('selected', 'selected');
    sortSelect.append(option);
  }
  const compare = $('.title-mainsp .c_sosanh').first();
  if (compare.length) {
    const actions = $('<div class="car-list-actions"></div>');
    compare.before(actions);
    actions.append(compare, $('<label class="car-sort"></label>').text('Sắp xếp').append(sortSelect));
  }
  const searchBar = $('#keyword').closest('.search');
  searchBar.addClass('vehicle-search');
  searchBar.append('<a class="vehicle-search__reset" href="/san-pham" aria-label="Làm mới: xóa từ khóa và toàn bộ bộ lọc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg><span>Làm mới</span></a>');
  const effectiveSearch = { ...searchParams };
  if (pathname !== '/san-pham' && pathname !== '/tim-kiem-nang-cao') {
    const slug = pathname.slice(1);
    const key = filters.brands.some(item => item.slug === slug) ? 'hang-xe'
      : filters.styles.some(item => item.slug === slug) ? 'kieu-dang'
      : filters.branches.some(item => item.slug === slug) ? 'chi-nhanh' : 'dong-xe';
    effectiveSearch[key] ??= slug;
  }
  $('.boloc_l ul').append('<li data-id=".chinhanh_tk">Chi nhánh</li>');
  $('.boloc_r').append('<div class="tab_bl chinhanh_tk"><div class="dang_text goiy_chinhanh"></div></div>');
  const groupMap: Array<[string, PublicLookup[]]> = [
    ['hangxe', filters.brands], ['kieudang', filters.styles], ['hopso', filters.transmissions], ['mausac', filters.colors], ['chinhanh', filters.branches],
  ];
  for (const [group, items] of groupMap) {
    const target = $(`.goiy_${group}`).first();
    if (!target.length) continue;
    target.empty();
    for (const item of items) {
      const choice = $('<p class="img"></p>').attr('data-id', item.slug);
      if (group === 'mausac' && item.colorCode && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(item.colorCode))
        choice.append($('<span></span>').attr('style', `background:${item.colorCode}`));
      if (item.imageUrl && group !== 'chinhanh') choice.append($('<img>').attr({ src: item.imageUrl, alt: item.name }));
      choice.append(item.name);
      target.append(choice);
    }
  }
  const selected = (name: string) => single(effectiveSearch[name])?.split(',').filter(Boolean).join(',');
  const quickFilters = $('<section class="quick-filters" aria-label="Chọn xe theo hãng, kiểu dáng và chi nhánh"></section>');
  for (const [key, title, items] of [['hang-xe', 'Hãng xe', filters.brands], ['kieu-dang', 'Kiểu dáng', filters.styles], ['chi-nhanh', 'Chi nhánh', filters.branches]] as const) {
    const row = $('<div class="quick-filters__row"></div>').attr('data-filter-key', key);
    const heading = $('<div class="quick-filters__heading"></div>').append($('<h2></h2>').text(title));
    if (key === 'hang-xe') heading.append('<div class="quick-filters__arrows"><button type="button" data-filter-scroll="-1" aria-label="Cuộn sang trái">‹</button><button type="button" data-filter-scroll="1" aria-label="Cuộn sang phải">›</button></div>');
    const track = $('<div class="quick-filters__track"></div>');
    const values = selected(key)?.split(',') || [];
    for (const item of items) {
      const active = values.includes(item.slug);
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(effectiveSearch)) if (value !== undefined && name !== 'page')
        query.set(name, single(value)!);
      const next = key === 'chi-nhanh' ? (active ? [] : [item.slug])
        : active ? values.filter(value => value !== item.slug) : [...values, item.slug];
      if (next.length) query.set(key, next.join(',')); else query.delete(key);
      const link = $('<a class="quick-filters__option" data-quick-filter="true"></a>')
        .attr({ href: `/san-pham${query.size ? `?${query}` : ''}`, 'data-value': item.slug, 'aria-pressed': String(active), role: 'button' });
      if (active) link.addClass('is-selected');
      if (key !== 'chi-nhanh') {
        if (item.imageUrl) link.append($('<img>').attr({ src: item.imageUrl, alt: '', loading: 'lazy' }));
        else link.append($('<span class="quick-filters__symbol" aria-hidden="true"></span>').text(item.name.slice(0, 1)));
      }
      link.append($('<span></span>').text(item.name));
      track.append(link);
    }
    row.append(heading, track);quickFilters.append(row);
  }
  $('.timnhieu').parent('.cuonngang').remove();
  const filterPanel = $('<div class="vehicle-filter-panel"></div>');
  searchBar.before(filterPanel);
  filterPanel.append(searchBar, quickFilters);
  filterPanel.append('<div class="vehicle-filter-panel__actions"><button type="button" class="vehicle-filter-panel__open" data-id=".hangxe_tk">Bộ lọc</button></div>');
  $('.chonloc').first().parent('.cuonngang').remove();
  const price = parseRangeQuery(single(searchParams['ngan-sach']));
  const year = parseRangeQuery(single(searchParams['nam-san-xuat']));
  const mileage = parseRangeQuery(single(searchParams['so-km']));
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  for (const [kind, group, selection] of [['ngansach', 'budget', price], ['nam', 'year', year], ['sokm', 'mileage', mileage]] as const) {
    const options: RangeOption[] = group === 'year'
      ? filters.yearSuggestions.map(item => ({ name: item.title }))
      : filters.ranges.filter(item => item.group === group);
    const parsed = options.map(item => ({ item, bounds: optionRange(item, group as RangeGroup) }));
    const numbers = parsed.flatMap(({ bounds }) => bounds ? [bounds.min, bounds.max].filter((value): value is number => value !== undefined) : []);
    const min = group === 'year' ? Math.min(currentYear, ...numbers, selection?.min ?? Infinity) : 0;
    const max = Math.max(group === 'year' ? currentYear : group === 'budget' ? 5000 : 170000,
      ...numbers, selection?.max ?? 0, min + 1);
    const target = $(`.goiy_${kind}`).empty();
    const seen = new Set<string>();
    for (const { item, bounds } of parsed) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      const choice = $('<p class="img"></p>').text(item.name);
      if (bounds) {
        choice.attr({ 'data-gia1': String(bounds.min ?? min), 'data-gia2': String(bounds.max ?? max),
          'data-open-min': String(bounds.min === undefined), 'data-open-max': String(bounds.max === undefined) });
        if (selection && bounds.min === selection.min && bounds.max === selection.max) choice.addClass('active_tk');
      } else choice.attr({ 'aria-disabled': 'true', title: 'Chưa xác định được khoảng lọc từ tên danh mục' });
      target.append(choice);
    }
    $(`#${kind}-range`).attr({ 'data-min': String(min), 'data-max': String(max),
      'data-filter-active': String(Boolean(selection)), 'data-open-min': String(Boolean(selection && selection.min === undefined)),
      'data-open-max': String(Boolean(selection && selection.max === undefined)) });
    $(`.gt_${kind}1`).attr({ value: String(selection?.min ?? min), 'data-reset': String(min) });
    $(`.gt_${kind}2`).attr({ value: String(selection?.max ?? max), 'data-reset': String(max) });
  }
  const params: Record<string, string | number | undefined> = {
    page: positive(single(searchParams.page)), limit: 12, search: single(searchParams.keyword),
    brand: selected('hang-xe'), body_type: selected('kieu-dang'), transmission: selected('hop-so'), color: selected('mau-sac'),
    branch: selected('chi-nhanh'), model: selected('dong-xe'),
    price_min: price?.min !== undefined ? Math.round(price.min * 1_000_000) : undefined,
    price_max: price?.max !== undefined ? Math.round(price.max * 1_000_000) : undefined,
    year_from: year?.min, year_to: year?.max, mileage_min: mileage?.min, mileage_max: mileage?.max,
    sort: single(searchParams.gia) === 'gia asc' ? 'price_asc' : single(searchParams.gia) === 'gia desc' ? 'price_desc' : undefined,
  };
  const result = await publicApi<PageResult<PublicCar>>('/cars', params);
  const cards = cardMarkup(result.data);
  $('.wap_item').first().html(cards.html);
  if (!result.data.length) $('.wap_item').first().html('<div class="alert alert-warning" role="status">Chưa có xe phù hợp</div>');
  $('.td_dem span').text(String(result.meta.total));
  $('#keyword').attr('value', single(searchParams.keyword) || '');
  for (const [param, group] of [['hang-xe', 'hangxe'], ['kieu-dang', 'kieudang'], ['hop-so', 'hopso'], ['mau-sac', 'mausac'], ['chi-nhanh', 'chinhanh']]) {
    for (const slug of selected(param)?.split(',') || []) $(`.goiy_${group} p[data-id="${slug}"]`).addClass('active_tk');
  }
  $('.goiy_mucgia p').removeClass('active_tk');
  if (single(searchParams.gia)) $(`.goiy_mucgia p[data-id="${single(searchParams.gia)}"]`).addClass('active_tk');
  const pagination = $('.pagination-home');
  pagination.remove();
  if (result.meta.totalPages > 1) {
    const links = $('<nav class="pagination-home car-pagination" aria-label="Phân trang danh sách xe"></nav>');
    const pageLink = (number: number, label: string) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (key === 'page' || value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
      }
      query.set('page', String(number));
      return $('<a></a>').attr('href', `${pathname}?${query}`).text(label);
    };
    links.append(result.meta.page > 1 ? pageLink(result.meta.page - 1, '‹ Trước').attr('rel', 'prev')
      : $('<span aria-disabled="true"></span>').text('‹ Trước'));
    const pages = [...new Set([1, result.meta.totalPages, ...Array.from({ length: 5 }, (_, i) => result.meta.page - 2 + i)])]
      .filter(number => number >= 1 && number <= result.meta.totalPages).sort((a, b) => a - b);
    for (const [index, number] of pages.entries()) {
      if (index > 0 && number - pages[index - 1] > 1) links.append('<span class="car-pagination__ellipsis">…</span>');
      const link = pageLink(number, String(number)).attr('aria-label', `Trang ${number}`);
      if (number === result.meta.page) link.attr({ class: 'active', 'aria-current': 'page' });
      links.append(link);
    }
    links.append(result.meta.page < result.meta.totalPages ? pageLink(result.meta.page + 1, 'Sau ›').attr('rel', 'next')
      : $('<span aria-disabled="true"></span>').text('Sau ›'));
    $('.wap_item').first().after(links);
  }
  return { ...page, content: $.html(), cars: cards.mapped };
}

async function articleListPage(page: LegacyPageData): Promise<LegacyPageData> {
  const result = await publicApi<PageResult<Article>>('/articles', { page: 1, limit: 20 });
  const $ = load(page.content, {}, false);
  const target = $('.wap_news').first();
  const template = target.find('.item_news').first().clone();
  target.empty();
  for (const article of result.data) {
    const item = template.clone();
    item.find('a[href]').attr('href', `/${article.slug}`);
    item.find('img').attr({ src: article.imageUrl || '/thumbs/90x90x2/assets/images/noimage.png', alt: article.title });
    item.find('.name_post').text(article.title);
    item.find('.desc_post').text(article.excerpt || '');
    target.append(item);
  }
  return { ...page, content: $.html() };
}

async function articleDetailPage(article: Article, page: LegacyPageData): Promise<LegacyPageData> {
  const $ = load(page.content, {}, false);
  $('.title-main span').first().text(article.title);
  $('.content-main').first().html(safeHtml(article.content || ''));
  $('.share a[href]').first().attr('href', `/${article.slug}`);
  return { ...page, route: `/${article.slug}`, title: article.title, description: article.excerpt || '',
    canonical: `/${article.slug}`, openGraphImage: article.imageUrl || '', content: $.html() };
}

async function faqPage(page: LegacyPageData): Promise<LegacyPageData> {
  const result = await publicApi<PageResult<Faq>>('/faqs', { limit: 100 });
  const $ = load(page.content, {}, false);
  const alert = $('.alert.alert-warning').first();
  const items = $('<div class="wap_cauhoi"></div>');
  for (const faq of result.data) items.append($('<div class="item_cauhoi"></div>')
    .append($('<h3></h3>').text(faq.question)).append($('<div class="mota"></div>').html(safeHtml(faq.answer))));
  if (result.data.length) alert.replaceWith(items);
  return { ...page, content: $.html() };
}

async function testimonialPage(page: LegacyPageData): Promise<LegacyPageData> {
  const result = await publicApi<PageResult<Testimonial>>('/testimonials', { limit: 100 });
  const $ = load(page.content, {}, false);
  const target = $('.wap_news').first();
  const template = target.find('.item_cn').first().parent().clone();
  target.empty();
  for (const testimonial of result.data) {
    const item = template.clone();
    item.find('.name_post').text(testimonial.name);
    item.find('.desc_post').text(testimonial.content);
    item.find('.sao').html('<i class="fas fa-star"></i>'.repeat(Math.max(0, Math.min(5, testimonial.rating))));
    if (testimonial.avatarUrl) item.find('.img_post img').attr({ src: testimonial.avatarUrl, alt: testimonial.name });
    else item.find('.img_post').remove();
    item.find('.chucvu').text(testimonial.carBought || '');
    target.append(item);
  }
  return { ...page, content: $.html() };
}

async function settingsPage(page: LegacyPageData, group: string): Promise<LegacyPageData> {
  const rows = await publicApi<{ key: string; value: string }[]>(`/site-settings/${group}`);
  const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const $ = load(page.content, {}, false);
  await populateCarFormBrands($);
  if (settings.title) $('.lendoi_l .ten').first().text(settings.title);
  if (settings.subtitle) $('.lendoi_r .title-main span').first().text(settings.subtitle);
  if (settings.image) $('.lendoi_l .img img').first().attr('src', settings.image);
  if (settings.content) $('.lendoi_l .mota').first().html(safeHtml(settings.content));
  return { ...page, title: settings.seoTitle || page.title, description: settings.seoDescription || page.description,
    content: $.html() };
}

async function servicesPage(page: LegacyPageData): Promise<LegacyPageData> {
  const result = await publicApi<PageResult<Service>>('/services', { limit: 100 });
  const $ = load(page.content, {}, false);
  const target = $('.content-main').first().empty();
  for (const service of result.data) {
    const section = $('<section class="item_news"></section>');
    if (service.imageUrl) section.append($('<img>').attr({ src: service.imageUrl, alt: service.title }));
    section.append($('<h2></h2>').text(service.title));
    section.append($('<div></div>').html(safeHtml(service.description)));
    target.append(section);
  }
  return { ...page, content: $.html() };
}

async function recruitmentsPage(page: LegacyPageData): Promise<LegacyPageData> {
  const result = await publicApi<PageResult<Recruitment>>('/recruitments', { limit: 100 });
  const $ = load(page.content, {}, false);
  const target = $('.content-main').first().empty();
  for (const job of result.data) {
    const section = $('<section class="item_news"></section>');
    section.append($('<h2></h2>').text(job.title));
    if (job.imageUrl) section.append($('<img>').attr({ src: job.imageUrl, alt: job.title }));
    section.append($('<p></p>').text(job.location));
    if (job.salary) section.append($('<p></p>').text(job.salary));
    section.append($('<div></div>').html(safeHtml(job.description)));
    section.append($('<div></div>').html(safeHtml(job.requirements)));
    target.append(section);
  }
  return { ...page, content: $.html() };
}

async function cmsPage(page: LegacyPageData, pathname: string): Promise<LegacyPageData> {
  const record = await optionalPublicApi<CmsPage>('/pages/by-path', { path: pathname });
  if (!record) return page;
  const $ = load(page.content, {}, false);
  $('.title-main span').first().text(record.title);
  $('.content-main').first().html(safeHtml(record.body || ''));
  return { ...page, title: record.title, content: $.html() };
}

async function detailPage(car: CarDetail, page: LegacyPageData): Promise<LegacyPageData> {
  const $ = load(page.content, {}, false);
  const title = car.name;
  const images = [...car.media].sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  const gallery = $('.album_pro').first().empty();
  for (const [index, media] of images.entries()) gallery.append($('<a class="MagicZoom" data-zoom-id="Zoom-detail"></a>')
    .attr({ href: media.url, title }).append($('<img class="cloudzoom no_lazy">').attr({ src: media.url, alt: media.altText || `${title} ${index + 1}` })));
  const thumbnails = $('.album_pro2').first().empty();
  for (const [index, media] of images.entries()) thumbnails.append($('<p></p>')
    .append($('<img class="cloudzoom no_lazy">').attr({ src: media.url, alt: media.altText || `${title} ${index + 1}` })));
  $('.breadCrumbs .breadcrumb-item').eq(2).find('a').attr('href', `/${car.brand.slug}`).find('span').text(car.brand.name);
  $('.breadCrumbs .breadcrumb-item').last().find('span').text(title);
  $('.right-pro-detail .gia_sp b').first().text(formatCarPrice(car.price));
  $('.right-pro-detail .gia_sp a').remove();
  $('.right-pro-detail .name_sp a').first().attr({ href: `/${car.slug}`, title }).text(title);
  const facts = [
    `${Number(car.mileage || 0).toLocaleString('vi-VN')} km`, car.seatCount ? `${car.seatCount} chỗ` : '—',
    car.transmission || '—', car.fuel || '—', String(car.year), car.branch?.name || '—',
  ];
  $('.right-pro-detail .mota ul li').each((index, element) => {
    if (index < facts.length) {
      const icon = $(element).find('img').first().clone();
      $(element).empty().append(icon).append(facts[index]);
    }
  });
  const overview = $('.grid-pro-detail').parent().children('.tongquan').first();
  overview.find('p.id').remove();
  const overviewValues = [car.fuel, `${Number(car.mileage || 0).toLocaleString('vi-VN')} km`, car.seatCount, car.version,
    car.bodyType, null, car.year, car.color];
  overview.find('ul.w_1000 li b').each((index, element) => { $(element).text(String(overviewValues[index] ?? '—')); });
  if (car.description) overview.append($('<div class="w_1000"></div>').html(safeHtml(car.description)));
  $('.grid-pro-detail').parent().children('.thongso').first().find('ul.w_1000').html(
    car.specifications.map(spec => `<li>${escape(spec.label)} <b>${escape(spec.value)}</b></li>`).join(''));
  $('#tskt .tongquan').first().html(`<ul>${car.specifications.map(spec =>
    `<li>${escape(spec.label)} <b>${escape(spec.value)}</b></li>`).join('')}</ul>`);
  const priceText = `${Number(car.price).toLocaleString('vi-VN')} VNĐ`;
  $('#giaxe, #tratruoc').attr('value', priceText);
  $('.sotienvay option').each((_, element) => {
    const percent = Number($(element).text().replace('%', ''));
    if (Number.isFinite(percent)) $(element).attr('value', String(Math.round(Number(car.price) * percent / 100)));
  });
  $('#goilai #tieude').attr('value', title);
  $('.tragop_r .sotien').text('Chọn khoản vay để xem mức trả góp ước tính');
  $('.right-pro-detail a[href$="#spec"]').attr('href', `/${car.slug}#tskt`);
  if (car.branch?.phone) $('.right-pro-detail .lienhe_ct a[href^="tel:"]')
    .attr('href', `tel:${car.branch.phone}`).find('span').text(car.branch.phone);
  $('.right-pro-detail .c_laithu').remove();
  if (car.branch?.mapUrl && /^https?:\/\//i.test(car.branch.mapUrl)) {
    $('.right-pro-detail .c_goilai').before($('<a class="c_chinhanh"></a>')
      .attr({ href: car.branch.mapUrl, target: '_blank', rel: 'noopener noreferrer', title: car.branch.name })
      .text('Chi nhánh'));
  }
  $('.zalo-share-button').attr('data-href', `/${car.slug}`);
  const related = await publicApi<PageResult<PublicCar>>('/cars', { brand: car.brand.slug, limit: 7 });
  const relatedCards = cardMarkup(related.data.filter(item => item.slug !== car.slug).slice(0, 6));
  $('.grid-pro-detail').parent().children('.quantam').find('.wap_item').first().html(relatedCards.html);
  $('.share a[href]').first().attr('href', `/${car.slug}`);
  return { ...page, route: `/${car.slug}`, title, description: `${title} • ${formatCarPrice(car.price)} • ${car.year}`,
    canonical: `/${car.slug}`, openGraphImage: images[0]?.url || '', content: $.html(), cars: relatedCards.mapped };
}

export async function getPublicPage(pathname: string, searchParams: SearchParams = {}): Promise<LegacyPageData | null> {
  let page = await getLegacyPage(pathname, searchParams);
  if (pathname === '/') {
    if (!page) return null;
    const result = await publicApi<PageResult<PublicCar>>('/cars', { limit: 6, sort: 'newest' });
    const $ = load(page.content, {}, false);
    const cards = cardMarkup(result.data);
    $('.wap_sanpham .loadthem_sp1').html(cards.html);
    const [slides, brands, styles] = await Promise.all([
      publicApi<PageResult<Slide>>('/slides', { limit: 20 }), publicApi<PublicBrand[]>('/brands'),
      publicApi<PageResult<PublicLookup>>('/lookups/body-styles', { limit: 100 }),
    ]);
    if (slides.data.length) {
      const slider = $('.slider_slick').first().empty();
      for (const slide of slides.data) slider.append($('<a></a>').attr({ href: publicHref(slide.link), title: slide.title })
        .append($('<img class="no_lazy">').attr({ src: slide.imageUrl, alt: slide.title })));
    }
    const groups = [brands, styles.data];
    $('.muaxe .thuonghieu').each((index, element) => {
      const group = groups[index];
      if (!group) return;
      $(element).empty();
      for (const item of group) {
        const anchor = $('<a></a>').attr({ href: `/${item.slug}`, title: item.name });
        if (item.imageUrl) anchor.append($('<img>').attr({ src: item.imageUrl, alt: item.name }));
        anchor.append(item.name);
        $(element).append($('<p class="img"></p>').append(anchor));
      }
    });
    await populateCarFormBrands($);
    return { ...page, content: $.html(), cars: cards.mapped };
  }
  if (pathname === '/tin-tuc' && page) return articleListPage(page);
  if (pathname === '/cau-hoi' && page) return faqPage(page);
  if (pathname === '/cam-nhan' && page) return testimonialPage(page);
  if (pathname === '/dich-vu-khac' && page) return servicesPage(page);
  if (pathname === '/he-thong-oto-toan-trung-tuyen-dung' && page) return recruitmentsPage(page);
  if (pathname === '/ban-xe' && page) return settingsPage(page, 'thiet-lap-text-ban-xe');
  if (pathname === '/len-doi' && page) return settingsPage(page, 'thiet-lap-text-len-doi');
  if (pathname === '/hoi-nghi-khach-hang-cong-ty-honda-viet-nam' || !page) {
    const article = await optionalPublicApi<Article>(`/articles/${encodeURIComponent(pathname.slice(1))}`);
    if (article) {
      page ??= await getLegacyPage('/hoi-nghi-khach-hang-cong-ty-honda-viet-nam');
      return page ? articleDetailPage(article, page) : null;
    }
    if (pathname === '/hoi-nghi-khach-hang-cong-ty-honda-viet-nam') return null;
  }
  const isLegacyCar = Boolean(page?.content.includes('grid-pro-detail'));
  if (isLegacyCar || !page) {
    const slug = pathname.slice(1);
    if (!slug || slug.includes('/')) return page;
    const car = await optionalPublicApi<CarDetail>(`/cars/${encodeURIComponent(slug)}`);
    if (car) {
      page ??= await getLegacyPage('/ford-everest-titanium-4x2-2023');
      return page ? detailPage(car, page) : null;
    }
    if (isLegacyCar) return null;
    if (!page) {
      const slug = pathname.slice(1);
      if (slug && !slug.includes('/')) {
        const [brands, styles] = await Promise.all([
          publicApi<PublicBrand[]>('/brands'),
          publicApi<PageResult<PublicLookup>>('/lookups/body-styles', { limit: 100 }),
        ]);
        const category = brands.find(item => item.slug === slug) || styles.data.find(item => item.slug === slug);
        const matchingModel = category ? null : await publicApi<PageResult<PublicCar>>('/cars', { model: slug, limit: 1 });
        if (category || matchingModel?.meta.total) {
          page = await getLegacyPage('/san-pham');
          if (page) {
            const title = category?.name || matchingModel?.data[0]?.model.name || slug;
            const $ = load(page.content, {}, false);
            $('.title-main span').first().text(title);
            page = { ...page, route: pathname, title, content: $.html() };
          }
        }
      }
    }
  }
  if (!page && !pathname.slice(1).includes('/')) {
    const template = await getLegacyPage('/ve-chung-toi');
    if (template) {
      const cms = await cmsPage(template, pathname);
      if (cms !== template) return { ...cms, route: pathname, canonical: pathname };
    }
  }
  if (!page) return null;
  if (pathname === '/san-pham' || pathname === '/tim-kiem-nang-cao' || page.content.includes('<car-card'))
    return listingPage(page, pathname, searchParams);
  if (page.content.includes('content-main') && !pathname.startsWith('/account/')) return cmsPage(page, pathname);
  return page;
}
