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

async function fetchFilterLookups() {
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

type FilterLookups = Awaited<ReturnType<typeof fetchFilterLookups>>;
let filterLookupsSnapshot: { value: FilterLookups; expiresAt: number } | undefined;
let filterLookupsPending: Promise<FilterLookups> | undefined;
async function filterLookups(): Promise<FilterLookups> {
  if (filterLookupsSnapshot && Date.now() < filterLookupsSnapshot.expiresAt) return filterLookupsSnapshot.value;
  filterLookupsPending ??= fetchFilterLookups().then(value => {
    filterLookupsSnapshot = { value, expiresAt: Date.now() + 15_000 };
    return value;
  }).finally(() => { filterLookupsPending = undefined; });
  return filterLookupsPending;
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
  $('#keyword').after('<button type="button" class="vehicle-search__submit" data-vehicle-search-submit aria-label="Tìm kiếm xe"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><span>Tìm kiếm</span></button>');
  const resetSearch = $('<a class="vehicle-search__reset" href="/san-pham" aria-label="Làm mới: xóa từ khóa và toàn bộ bộ lọc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg><span>Làm mới</span></a>');
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
  $('.timnhieu').parent('.cuonngang').remove();
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
    if (group === 'budget') parsed.sort((a, b) => (a.bounds?.min ?? Infinity) - (b.bounds?.min ?? Infinity) ||
      (a.bounds?.max ?? Infinity) - (b.bounds?.max ?? Infinity));
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
  const selectedValues = (key: string) => selected(key)?.split(',').filter(Boolean) || [];
  const urlFor = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(effectiveSearch)) {
      const text = single(value);
      if (key !== 'page' && text) query.set(key, text);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value); else query.delete(key);
    }
    return `/san-pham${query.size ? `?${query}` : ''}`;
  };
  const facetParams = (without: string[]) => Object.fromEntries(Object.entries(params)
    .filter(([key, value]) => !['page', 'limit', 'sort', ...without].includes(key) && value !== undefined)) as Record<string, string | number>;
  const brandValues = selectedValues('hang-xe');
  const modelSlug = selected('dong-xe');
  const colorValues = selectedValues('mau-sac');
  const transmissionValues = selectedValues('hop-so');
  const completeCurrentPage = result.meta.page === 1 && result.meta.total === result.data.length;
  const modelCars = brandValues.length === 1 && !modelSlug
    ? completeCurrentPage ? result.data : await allPublicLookups<PublicCar>('/cars', facetParams(['model'])) : [];
  const modelCounts = new Map<string, { name: string; count: number }>();
  for (const car of modelCars) {
    const previous = modelCounts.get(car.model.slug);
    modelCounts.set(car.model.slug, { name: car.model.name, count: (previous?.count || 0) + 1 });
  }
  const colorCars = brandValues.length === 1 && modelSlug && !colorValues.length
    ? completeCurrentPage ? result.data : await allPublicLookups<PublicCar>('/cars', facetParams(['color'])) : [];
  const colorCounts = new Map<string, number>();
  for (const car of colorCars) {
    if (car.colorSlug) colorCounts.set(car.colorSlug, (colorCounts.get(car.colorSlug) || 0) + 1);
  }
  const availableColors = filters.colors.map(color => ({ color, count: colorCounts.get(color.slug) || 0 }))
    .filter(item => item.count > 0);
  const transmissionCars = brandValues.length === 1 && modelSlug && colorValues.length && !transmissionValues.length
    ? completeCurrentPage ? result.data : await allPublicLookups<PublicCar>('/cars', facetParams(['transmission'])) : [];
  const transmissionCounts = new Map<string, number>();
  for (const car of transmissionCars) {
    const lookup = filters.transmissions.find(item => item.name === car.transmission);
    if (lookup) transmissionCounts.set(lookup.slug, (transmissionCounts.get(lookup.slug) || 0) + 1);
  }
  let selectedModelName = result.data.find(car => car.model.slug === modelSlug)?.model.name || modelSlug;
  if (brandValues.length === 1 && modelSlug && selectedModelName === modelSlug) {
    const modelResult = await publicApi<PageResult<PublicCar>>('/cars', { brand: selected('hang-xe'), model: modelSlug, limit: 1 });
    selectedModelName = modelResult.data[0]?.model.name || modelSlug;
  }
  const filterPanel = $('<section class="vehicle-filter-panel" aria-label="Tìm kiếm và lọc xe"></section>');
  filterPanel.attr('data-filter-base', urlFor({}));
  searchBar.before(filterPanel);
  $('#keyword').attr('placeholder', 'Tìm kiếm theo hãng xe, dòng xe hoặc từ khóa...');
  filterPanel.append($('<div class="vehicle-search-row"></div>').append(searchBar, resetSearch));
  const brandRow = $('<div class="vehicle-brands" aria-label="Chọn hãng xe"></div>');
  brandRow.append('<button type="button" class="vehicle-brands__arrow" data-filter-scroll="-1" aria-label="Cuộn hãng xe sang trái">‹</button>');
  const brandTrack = $('<div class="vehicle-brands__track"></div>');
  for (const brand of filters.brands) {
    const active = brandValues.includes(brand.slug);
    const next = active ? brandValues.filter(value => value !== brand.slug) : [...brandValues, brand.slug];
    const link = $('<a class="vehicle-brands__option" data-filter-link="true"></a>')
      .attr({ href: urlFor({ 'hang-xe': next.join(',') || null, 'dong-xe': null, 'mau-sac': null, 'hop-so': null }),
        'aria-label': `${active ? 'Bỏ chọn' : 'Chọn'} hãng ${brand.name}`, 'aria-current': active ? 'true' : 'false' });
    if (active) link.addClass('is-selected');
    if (brand.imageUrl) link.append($('<img loading="lazy">').attr({ src: brand.imageUrl, alt: '', 'data-brand-logo': 'true' }));
    link.append($('<span class="vehicle-brands__fallback" aria-hidden="true"></span>')
      .attr('hidden', brand.imageUrl ? 'hidden' : null).text(brand.name.slice(0, 1)));
    link.append($('<span></span>').text(brand.name));
    brandTrack.append(link);
  }
  brandRow.append(brandTrack, '<button type="button" class="vehicle-brands__arrow" data-filter-scroll="1" aria-label="Cuộn hãng xe sang phải">›</button>');
  filterPanel.append(brandRow);
  const filterBar = $('<div class="vehicle-filter-bar" aria-label="Bộ lọc nhanh"></div>');
  const filterTrack = $('<div class="vehicle-filter-bar__track"></div>');
  filterTrack.append('<button type="button" class="vehicle-filter-panel__open" data-id=".hangxe_tk">Bộ lọc</button>');
  type FilterChoice = { name: string; value: string };
  const rangeChoices = (group: RangeGroup, items: RangeOption[]): FilterChoice[] => items
    .map(item => ({ item, bounds: optionRange(item, group) })).filter(entry => entry.bounds)
    .map(({ item, bounds }) => ({ name: item.name, value: `${bounds!.min ?? ''}-${bounds!.max ?? ''}` }));
  const options: Array<{ key: string; title: string; choices: FilterChoice[]; multiple?: boolean; range?: RangeGroup }> = [
    { key: 'ngan-sach', title: 'Giá', range: 'budget', choices: rangeChoices('budget', filters.ranges.filter(item => item.group === 'budget'))
      .sort((a, b) => (parseRangeQuery(a.value)?.min ?? 0) - (parseRangeQuery(b.value)?.min ?? 0)) },
    { key: 'nam-san-xuat', title: 'Năm SX', range: 'year', choices: rangeChoices('year', filters.yearSuggestions.map(item => ({ name: item.title }))) },
    { key: 'kieu-dang', title: 'Kiểu dáng', choices: filters.styles.map(item => ({ name: item.name, value: item.slug })), multiple: true },
    { key: 'hop-so', title: 'Hộp số', choices: filters.transmissions.map(item => ({ name: item.name, value: item.slug })), multiple: true },
    { key: 'so-km', title: 'Số km', range: 'mileage', choices: rangeChoices('mileage', filters.ranges.filter(item => item.group === 'mileage')) },
    { key: 'mau-sac', title: 'Màu sắc', choices: filters.colors.map(item => ({ name: item.name, value: item.slug })), multiple: true },
    { key: 'chi-nhanh', title: 'Chi nhánh', choices: filters.branches.map(item => ({ name: item.name, value: item.slug })) },
  ];
  const formatBound = (value: number | undefined, group: RangeGroup) => value === undefined ? ''
    : group === 'budget' ? `${value >= 1000 ? `${Number((value / 1000).toFixed(1))} tỷ` : `${value}tr`}`
      : group === 'mileage' ? `${value.toLocaleString('vi-VN')} km` : String(value);
  for (const option of options) {
    const values = selectedValues(option.key);
    const chosen = option.range ? single(effectiveSearch[option.key]) : values.join(',');
    const bounds = option.range ? parseRangeQuery(chosen) : undefined;
    const names = values.map(value => {
      const name = option.choices.find(choice => choice.value === value)?.name || value;
      return option.key === 'chi-nhanh' ? name.replace(/^Showroom\s+/i, '') : name;
    });
    const rawLabel = option.range && bounds
      ? option.choices.find(choice => choice.value === chosen)?.name || `${formatBound(bounds.min, option.range)}–${formatBound(bounds.max, option.range)}`
      : names.length ? `${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}` : option.title;
    const label = bounds && option.range === 'year' ? `Năm: ${rawLabel}`
      : bounds && option.range === 'mileage' ? `Km: ${rawLabel}` : rawLabel;
    const active = Boolean(option.range ? bounds : values.length);
    const chip = $('<div class="vehicle-filter-chip"></div>');
    if (active) chip.addClass('is-selected');
    const popoverId = `vehicle-filter-${option.key}`;
    chip.append($('<button type="button" class="vehicle-filter-chip__main" data-filter-popover-trigger="true" aria-expanded="false"></button>')
      .attr({ 'aria-controls': popoverId, 'aria-label': `${option.title}: ${label}. Thay đổi lựa chọn` })
      .append($('<span></span>').text(label), '<span class="vehicle-filter-chip__chevron" aria-hidden="true"></span>'));
    if (active) chip.append($('<a class="vehicle-filter-chip__clear" data-filter-link="true">×</a>')
      .attr({ href: urlFor({ [option.key]: null }), 'aria-label': `Xóa bộ lọc ${option.title}` }));
    const popover = $('<div class="vehicle-filter-popover" hidden></div>').attr({ id: popoverId, role: 'group', 'aria-label': option.title });
    popover.append($('<strong class="vehicle-filter-popover__title"></strong>').text(option.title));
    const choices = $('<div class="vehicle-filter-popover__choices"></div>');
    for (const choice of option.choices) {
      const isActive = option.range ? chosen === choice.value : values.includes(choice.value);
      const nextValues = isActive ? values.filter(value => value !== choice.value) : [...values, choice.value];
      const next = option.range ? (isActive ? null : choice.value)
        : option.multiple ? (nextValues.join(',') || null) : (isActive ? null : choice.value);
      const link = $('<a data-filter-link="true"></a>').attr({ href: urlFor({ [option.key]: next }),
        'aria-current': isActive ? 'true' : 'false' }).text(choice.name);
      if (isActive) link.addClass('is-selected');
      choices.append(link);
    }
    popover.append(choices);
    if (option.range) {
      const range = parseRangeQuery(single(effectiveSearch[option.key]));
      const form = $('<form class="vehicle-filter-popover__range" data-filter-range="true"></form>')
        .attr('data-range-key', option.key);
      form.append($('<label>Từ</label>').append($('<input type="number" min="0" inputmode="numeric" name="min" placeholder="Tối thiểu">')
        .attr('value', range?.min === undefined ? '' : String(range.min))));
      form.append($('<label>Đến</label>').append($('<input type="number" min="0" inputmode="numeric" name="max" placeholder="Tối đa">')
        .attr('value', range?.max === undefined ? '' : String(range.max))));
      form.append('<button type="submit" aria-label="Lọc theo khoảng đã nhập">Lọc khoảng</button>');
      popover.append(form);
    }
    chip.append(popover);
    filterTrack.append(chip);
  }
  filterBar.append(filterTrack);
  filterPanel.append(filterBar);
  if (brandValues.length === 1) {
    const smart = $('<div class="vehicle-smart" aria-live="polite"></div>');
    const selectedFilters = $('<div class="vehicle-smart__selected"></div>');
    if (modelSlug) {
      selectedFilters.append($('<a class="vehicle-smart__model" data-filter-link="true"></a>')
        .attr({ href: urlFor({ 'dong-xe': null, 'mau-sac': null, 'hop-so': null }), 'aria-label': `Bỏ dòng xe ${selectedModelName}` })
        .text(`Dòng xe: ${selectedModelName} ×`));
    }
    for (const slug of colorValues) {
      const name = filters.colors.find(item => item.slug === slug)?.name || slug;
      selectedFilters.append($('<a class="vehicle-smart__model" data-filter-link="true"></a>')
        .attr({ href: urlFor({ 'mau-sac': colorValues.filter(value => value !== slug).join(',') || null }), 'aria-label': `Bỏ màu sắc ${name}` })
        .text(`Màu sắc: ${name} ×`));
    }
    for (const slug of transmissionValues) {
      const name = filters.transmissions.find(item => item.slug === slug)?.name || slug;
      selectedFilters.append($('<a class="vehicle-smart__model" data-filter-link="true"></a>')
        .attr({ href: urlFor({ 'hop-so': transmissionValues.filter(value => value !== slug).join(',') || null }), 'aria-label': `Bỏ hộp số ${name}` })
        .text(`Hộp số: ${name} ×`));
    }
    if (selectedFilters.children().length) smart.append(selectedFilters);
    const prompt = $('<div class="vehicle-smart__prompt"></div>');
    const suggestions = $('<div class="vehicle-smart__suggestions"></div>');
    const addSuggestion = (name: string, changes: Record<string, string | null>) =>
      suggestions.append($('<a data-filter-link="true"></a>').attr('href', urlFor(changes))
        .text(name));
    if (!modelSlug) {
      prompt.append('<strong>Dòng xe:</strong>');
      for (const [slug, item] of modelCounts) addSuggestion(item.name, { 'dong-xe': slug });
    } else if (!colorValues.length) {
      prompt.append('<strong>Màu sắc:</strong>');
      for (const { color } of availableColors) addSuggestion(color.name, { 'mau-sac': color.slug });
    } else if (!transmissionValues.length) {
      prompt.append('<strong>Hộp số:</strong>');
      for (const item of filters.transmissions) {
        const count = transmissionCounts.get(item.slug) || 0;
        if (count) addSuggestion(item.name, { 'hop-so': item.slug });
      }
    } else prompt.append($('<span class="vehicle-smart__complete"></span>').text(`Đã tìm thấy ${result.meta.total} xe phù hợp`));
    if (!suggestions.children().length && !transmissionValues.length) prompt.append('<span class="vehicle-smart__empty">Không có gợi ý phù hợp với bộ lọc hiện tại.</span>');
    prompt.append(suggestions);
    smart.append(prompt);
    filterPanel.append(smart);
  }
  const commitments = $('<ul class="vehicle-commitments" aria-label="Toàn Trung cam kết"></ul>');
  for (const text of ['Pháp lý rõ ràng', 'Không đâm đụng – ngập nước', 'Chất xe đúng mô tả']) {
    commitments.append($('<li></li>')
      .append('<span class="vehicle-commitments__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/></svg></span>')
      .append($('<span></span>').text(text)));
  }
  // Tạm ẩn hàng cam kết; giữ nguyên nội dung để có thể bật lại khi cần.
  filterPanel.append($('<div class="vehicle-filter-panel__actions" hidden></div>').append(
    $('<aside class="vehicle-assurance" aria-label="Toàn Trung cam kết"></aside>')
      .append('<div class="vehicle-assurance__label"><strong><span>Toàn Trung</span> cam kết</strong></div>', commitments)));
  const cards = cardMarkup(result.data);
  $('.wap_item').first().attr('data-sale-search-query', JSON.stringify(params)).html(cards.html);
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
  const testimonials = await allPublicLookups<Testimonial>('/testimonials');
  const $ = load(page.content, {}, false);
  renderTestimonials($, '.wap_news', testimonials, false);
  return { ...page, content: $.html() };
}

function renderTestimonials($: ReturnType<typeof load>, selector: string, testimonials: Testimonial[], home: boolean) {
  const target = $(selector).first();
  const template = target.find('.item_cn').first().parent().clone();
  target.empty().addClass(home ? 'tt-home-testimonials' : 'tt-testimonials-page');
  if (!testimonials.length) {
    target.append('<p class="tt-testimonials-empty">Cảm nhận của khách hàng đang được cập nhật.</p>');
    return;
  }
  const visible = home
    ? [...testimonials].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 5)
    : testimonials;
  for (const testimonial of visible) {
    const item = template.clone();
    item.find('.name_post').text(testimonial.name);
    item.find('.desc_post').html(safeHtml(testimonial.content));
    const stars = Math.max(0, Math.min(5, Number(testimonial.rating) || 0));
    const date = testimonial.purchaseDate && /^\d{4}-\d{2}-\d{2}/.test(testimonial.purchaseDate)
      ? `${testimonial.purchaseDate.slice(8, 10)}/${testimonial.purchaseDate.slice(5, 7)}/${testimonial.purchaseDate.slice(0, 4)}` : '';
    item.find('.sao').empty().append('<i class="fas fa-star"></i>'.repeat(stars));
    if (date) item.find('.sao').append($('<span></span>').text(home ? date : `Ngày mua: ${date}`));
    item.find('.img_post').remove();
    if (testimonial.avatarUrl) {
      const image = $('<img loading="lazy" decoding="async">').attr({ src: testimonial.avatarUrl, alt: `Khách hàng ${testimonial.name}` });
      if (home) item.find('.name_post').prepend(image.addClass('tt-home-avatar'));
      else item.find('.sao').after($('<p class="img_post"></p>').append(image));
    }
    const bought = item.find('.chucvu').empty();
    if (testimonial.carBought) bought.append($('<span class="tt-bought-car"></span>').text(testimonial.carBought));
    target.append(item);
  }
}

type ServiceStep = { title: string; body?: string | null; imageUrl?: string | null };
type ServiceKind = 'buoc-mua-xe' | 'buoc-ban-xe' | 'buoc-len-doi';

function renderServiceSteps($: ReturnType<typeof load>, panel: ReturnType<ReturnType<typeof load>>, kind: ServiceKind, steps: ServiceStep[]) {
  panel.attr('data-service', kind);
  const slider = panel.children('.main_fix').first();
  slider.removeClass('slick321').addClass('slick4321 control_slick').empty();
  for (const [index, step] of steps.entries()) {
    const card = $('<div class="item_buoc"></div>')
      .append($('<span class="so"></span>').text(String(index + 1)));
    if (step.imageUrl) card.append($('<p class="img_post"></p>')
      .append($('<img loading="lazy" decoding="async">').attr({ src: step.imageUrl, alt: step.title })));
    card.append($('<div class="mota"></div>')
      .append($('<h4 class="name_post"></h4>').text(step.title))
      .append($('<div class="desc_post"></div>').html(safeHtml(step.body || ''))));
    slider.append($('<div></div>').append(card));
  }
  if (!steps.length) slider.removeClass('slick4321 control_slick')
    .append('<p class="selling-process-empty">Các bước đang được cập nhật.</p>');
}

function prepareServiceTabs($: ReturnType<typeof load>, section: ReturnType<ReturnType<typeof load>>) {
  section.find('.cap1 li[data-id]').each((_, element) => {
    const tab = $(element);
    const kind = tab.attr('data-id') || '';
    const panel = section.children(`.dichvu[data-service="${kind}"]`);
    const active = tab.hasClass('active');
    tab.attr({ role: 'tab', tabindex: active ? '0' : '-1', 'aria-selected': String(active), 'aria-controls': `service-${kind}` });
    panel.attr({ id: `service-${kind}`, role: 'tabpanel' });
    if (active) panel.removeAttr('hidden'); else panel.attr('hidden', '');
  });
  section.find('.cap1').attr('role', 'tablist');
}

async function serviceLandingPage(page: LegacyPageData, route: '/ban-xe' | '/len-doi'): Promise<LegacyPageData> {
  const [base, sellingSteps, tradeInSteps, testimonials] = await Promise.all([
    settingsPage(page, route === '/ban-xe' ? 'thiet-lap-text-ban-xe' : 'thiet-lap-text-len-doi'),
    publicApi<ServiceStep[]>('/content', { group: 'thiet-lap-cac-buoc-ban-xe' }),
    publicApi<ServiceStep[]>('/content', { group: 'thiet-lap-cac-buoc-len-doi' }),
    allPublicLookups<Testimonial>('/testimonials'),
  ]);
  const $ = load(base.content, {}, false);
  const section = $('.wap_dichvu2').first();
  const panel = section.children('.dichvu').first();
  if (route === '/ban-xe') {
    renderServiceSteps($, panel, 'buoc-ban-xe', sellingSteps);
    const tradeInPanel = panel.clone();
    renderServiceSteps($, tradeInPanel, 'buoc-len-doi', tradeInSteps);
    section.append(tradeInPanel);
    prepareServiceTabs($, section);
  } else {
    renderServiceSteps($, panel, 'buoc-len-doi', tradeInSteps);
  }
  renderTestimonials($, '.wap_camnhan .camnhan', testimonials, true);
  return { ...base, content: $.html() };
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
  $('.right-pro-detail .mota > ul').first().after($('<sale-plate></sale-plate>').attr('data-slug', car.slug));
  const overview = $('.grid-pro-detail').parent().children('.tongquan').first();
  const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icons = {
    fuel: icon('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 7h5v5H7zM15 9h2l2 2v7a2 2 0 0 0 4 0v-7l-2-3"/>'),
    mileage: icon('<path d="M4 18a9 9 0 1 1 16 0M12 13l4-4M5 17h2m5-11v2m7 9h-2"/><circle cx="12" cy="13" r="1"/>'),
    seats: icon('<rect x="10" y="2" width="6" height="4" rx="1.5"/><path d="M9.5 8h4a2 2 0 0 1 2 2v5h-4a3 3 0 0 1-3-3V9a1 1 0 0 1 1-1ZM5 7v9a4 4 0 0 0 4 4h10v-4h-8M8 20v2m10-2v2"/>'),
    version: icon('<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>'),
    body: icon('<path d="m5 11 2-5h10l2 5M3 11h18v7H3zM6 18v2m12-2v2M3 14h3m12 0h3"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/>'),
    drivetrain: icon('<path d="M8 3h8l2 4v10l-2 4H8l-2-4V7l2-4Z"/><rect x="2" y="6" width="3" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="19" y="6" width="3" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="2" y="14" width="3" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="19" y="14" width="3" height="4" rx="1" fill="currentColor" stroke="none"/><path d="M8 8h8m-8 8h8m-4-8v8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
    year: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m3 0h1m-11 4h2m3 0h2"/>'),
    color: icon('<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 2-2c0-1-.6-1.5-.6-2.3 0-1 .8-1.7 1.8-1.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="12" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  };
  const drivetrain = car.specifications.find(spec => /dẫn động|dan dong|drivetrain|drive.?train|4x4|4wd|2wd|awd/i.test(`${spec.key} ${spec.label}`))?.value;
  const overviewItems = [
    { label: 'Nhiên liệu', value: car.fuel, icon: icons.fuel },
    { label: 'ODO', value: car.mileage == null ? null : `${Number(car.mileage).toLocaleString('vi-VN')} km`, icon: icons.mileage },
    { label: 'Số ghế', value: car.seatCount, icon: icons.seats },
    { label: 'Phiên bản', value: car.version, icon: icons.version },
    { label: 'Kiểu dáng', value: car.bodyType, icon: icons.body },
    { label: 'Dẫn động', value: drivetrain, icon: icons.drivetrain },
    { label: 'Năm sản xuất', value: car.year, icon: icons.year },
    { label: 'Màu ngoại thất', value: car.color, icon: icons.color },
  ];
  overview.empty().addClass('vehicle-detail-overview').attr('id', 'tong-quan-ve-xe');
  overview.append('<h2 class="vehicle-detail-heading">Tổng quan về xe</h2>');
  const overviewGrid = $('<div class="vehicle-detail-overview__grid"></div>');
  for (const item of overviewItems) {
    overviewGrid.append($('<div class="vehicle-detail-overview__item"></div>')
      .append($('<span class="vehicle-detail-overview__icon"></span>').html(item.icon))
      .append($('<span class="vehicle-detail-overview__text"></span>')
        .append($('<span class="vehicle-detail-overview__label"></span>').text(item.label))
        .append($('<strong class="vehicle-detail-overview__value"></strong>').text(String(item.value ?? '').trim() || 'Chưa cập nhật'))));
  }
  overview.append(overviewGrid, '<button type="button" class="vehicle-detail-overview__more" data-src="#tskt">Xem thêm</button>');
  const descriptionSection = $('.grid-pro-detail').parent().children('.thongso').first();
  descriptionSection.empty().removeClass('tongquan thongso').addClass('vehicle-detail-description').attr('id', 'mo-ta-chi-tiet');
  descriptionSection.append('<h2 class="vehicle-detail-heading">Mô tả chi tiết</h2>');
  const descriptionHtml = safeHtml(car.description?.trim() || '');
  descriptionSection.append($('<div class="vehicle-detail-description__body"></div>')
    .html(descriptionHtml || '<p>Mô tả chi tiết đang được cập nhật.</p>'));
  $('#tskt').remove();
  const normalizeSpec = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
  const usedSpecs = new Set<number>();
  const specValue = (...names: string[]) => {
    const keys = names.map(normalizeSpec);
    const index = car.specifications.findIndex(spec => keys.some(key =>
      normalizeSpec(spec.key) === key || normalizeSpec(spec.label) === key));
    if (index < 0) return null;
    usedSpecs.add(index);
    return car.specifications[index].value;
  };
  const specificationGroups = [
    { title: 'Hộp số', rows: [
      ['Hộp số', car.transmission || specValue('hop-so', 'transmission')],
      ['Động cơ', specValue('dong-co', 'engine')],
    ] },
    { title: 'Tổng quan', rows: [
      ['Xuất xứ', specValue('xuat-xu', 'origin')], ['Kiểu dáng', car.bodyType],
      ['Số ghế', car.seatCount], ['Màu ngoại thất', car.color],
      ['Năm sản xuất', car.year], ['Phiên bản', car.version],
      ['ODO', car.mileage == null ? null : `${Number(car.mileage).toLocaleString('vi-VN')} km`],
    ] },
    { title: 'Thông số kỹ thuật động cơ', rows: [
      ['Dung tích xi lanh', specValue('dung-tich-xi-lanh', 'dung-tich-dong-co', 'engine-displacement')],
      ['Dẫn động', drivetrain], ['Mã lực', specValue('ma-luc', 'cong-suat', 'horsepower')],
      ['Kiểu hộp số', car.transmission], ['Mô men xoắn', specValue('mo-men-xoan', 'torque')],
      ['Nhiên liệu', car.fuel],
    ] },
    { title: 'Kích thước & trọng lượng', rows: [
      ['Trọng lượng không tải (kg)', specValue('trong-luong-khong-tai', 'curb-weight')],
      ['Chiều cao (mm)', specValue('chieu-cao', 'height')],
      ['Chiều dài (mm)', specValue('chieu-dai', 'length')],
      ['Chiều rộng (mm)', specValue('chieu-rong', 'width')],
    ] },
    { title: 'Phanh', rows: [
      ['Phanh trước', specValue('phanh-truoc', 'front-brake')],
      ['Phanh sau', specValue('phanh-sau', 'rear-brake')],
    ] },
  ];
  const knownLabels = new Set(specificationGroups.flatMap(group => group.rows.map(([label]) => normalizeSpec(String(label)))));
  const additionalSpecs = car.specifications.filter((spec, index) => !usedSpecs.has(index) &&
    !knownLabels.has(normalizeSpec(spec.label)) &&
    !/(bienso|licenseplate|numberplate|registrationnumber)/.test(normalizeSpec(`${spec.key} ${spec.label}`)) && spec.value?.trim());
  if (additionalSpecs.length) specificationGroups.push({ title: 'Thông số khác', rows: additionalSpecs.map(spec => [spec.label, spec.value]) });
  const specsDialog = $('<div id="tskt" class="vehicle-specs-dialog"></div>')
    .append('<h2>Thông số kỹ thuật</h2>');
  for (const group of specificationGroups) {
    const section = $('<section class="vehicle-specs-dialog__group"></section>').append($('<h3></h3>').text(group.title));
    const rows = $('<dl></dl>');
    for (const [label, value] of group.rows) rows.append($('<div class="vehicle-specs-dialog__item"></div>')
      .append($('<dt></dt>').text(String(label)))
      .append($('<dd></dd>').text(String(value ?? '').trim() || 'Chưa cập nhật')));
    specsDialog.append(section.append(rows));
  }
  $('.grid-pro-detail').parent().append(specsDialog);
  const installment = $('.grid-pro-detail').parent().find('.tragop').first();
  installment.parent().addClass('vehicle-installment');
  installment.attr('data-price', String(car.price));
  const priceText = `${Number(car.price).toLocaleString('vi-VN')} VNĐ`;
  installment.find('#giaxe').attr('value', priceText);
  installment.find('.sotienvay option').each((_, element) => {
    const percent = Number($(element).text().replace('%', ''));
    if (Number.isFinite(percent)) $(element).attr('value', String(Math.round(Number(car.price) * percent / 100)));
  });
  const selectedPercent = Number((installment.find('.sotienvay option[selected]').first().text() ||
    installment.find('.sotienvay option').first().text()).replace('%', ''));
  installment.find('#tratruoc').attr('value', `${Math.round(Number(car.price) * (1 - selectedPercent / 100)).toLocaleString('vi-VN')} VNĐ`);
  installment.find('.laisuat').attr({ inputmode: 'decimal', placeholder: 'Ví dụ: 12' });
  installment.find('.tragop_r .sotien').attr('aria-live', 'polite').text('Nhập lãi suất để xem mức trả góp ước tính');
  installment.find('.c_tragop').replaceWith('<button type="button" class="c_tragop" aria-haspopup="dialog">Xem chi tiết khoản trả góp hàng tháng</button>');
  $('#goilai #tieude').attr('value', title);
  const callbackDialog = $('#goilai');
  callbackDialog.find('.title-main span').text('Nhân viên kinh doanh sẽ liên hệ tư vấn');
  callbackDialog.find('.title-main').after(
    $('<p class="callback-intro"></p>').text(title),
  );
  callbackDialog.find('input[name="ten"]').before('<label for="ten">Họ và tên</label>');
  callbackDialog.find('input[name="dienthoai"]').before('<label for="dienthoai">Số điện thoại</label>');
  callbackDialog.find('input[type="submit"]').attr('value', 'Gửi');
  callbackDialog.find('input[type="reset"]').attr('value', 'Xóa thông tin');
  $('.right-pro-detail a[href$="#spec"]').attr('href', `/${car.slug}#mo-ta-chi-tiet`).text('Xem mô tả chi tiết');
  if (car.branch?.phone) $('.right-pro-detail .lienhe_ct a[href^="tel:"]')
    .attr('href', `tel:${car.branch.phone}`).find('span').text(car.branch.phone);
  $('.right-pro-detail .c_laithu').remove();
  if (car.branch?.mapUrl && /^https?:\/\//i.test(car.branch.mapUrl)) {
    $('.right-pro-detail .c_goilai').before($('<a class="c_chinhanh"></a>')
      .attr({ href: car.branch.mapUrl, target: '_blank', rel: 'noopener noreferrer', title: car.branch.name })
      .text('Chi nhánh'));
  }
  const checkBadge = '<circle cx="48" cy="47" r="14" fill="#fff"/><circle cx="48" cy="47" r="12" fill="#ffb914"/><path d="m41 47 5 5 10-11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  const documentIcon = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 4h28l15 15v33a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z" fill="#ed0000"/><path d="M38 4v11a4 4 0 0 0 4 4h11" fill="none" stroke="#fff" stroke-width="3"/><path d="M15 26h27M15 34h24M15 42h12" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>${checkBadge}</svg>`;
  const carIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.83 1.55h8.85c.95 0 1.78.54 2.1 1.45l1.74 3.88c1.8.37 2.58 1.49 2.58 2.88V12c0 .83-.67 1.49-1.49 1.49H4.54v1.5a1.49 1.49 0 1 1-2.98 0v-1.7C1.1 13.04.8 12.57.8 12V9.76c0-1.55 1.13-2.82 2.98-2.99L4.73 3c.32-.91 1.15-1.45 2.1-1.45Zm.69 1.55c-.39 0-.53.12-.65.47L5.94 6.77h11.32l-1.39-3.2c-.12-.35-.26-.47-.65-.47h-7.7Z" fill="#ed0000" fill-rule="evenodd"/><circle cx="4.16" cy="10.13" r=".75" fill="#fff"/><circle cx="18.7" cy="10.13" r=".75" fill="#fff"/><circle cx="17.227" cy="16.479" r="5.973" fill="#fff"/><circle cx="17.227" cy="16.479" r="5.48" fill="#ffb914"/><path d="m19.89 14.743-2.893 3.856a.748.748 0 0 1-1.126.08l-1.493-1.493" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const transferIcon = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 4h30a6 6 0 0 1 6 6v43a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6V14a5 5 0 0 1 5-5h3a4 4 0 0 0 4-5Z" fill="#ed0000"/><path d="M17 19h26M17 27h26" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="27" cy="39" r="5" fill="#fff"/><path d="M16 52c1-7 5-10 11-10s10 3 11 10" fill="#fff"/>${checkBadge}</svg>`;
  const assurance = $('<div class="detail-assurance" aria-label="Cam kết khi mua xe"></div>');
  for (const [label, icon] of [
    ['Pháp lý rõ ràng', documentIcon],
    ['Xe đúng mô tả', carIcon],
    ['Hỗ trợ sang tên', transferIcon],
  ]) {
    assurance.append($('<div class="detail-assurance__item"></div>')
      .append($('<span class="detail-assurance__icon"></span>').html(icon))
      .append($('<span class="detail-assurance__text"></span>').text(label)));
  }
  $('.right-pro-detail .dangky_ct').after(assurance);
  $('.right-pro-detail .share').remove();
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
    const [slides, brands, styles, budgets, testimonials, sellingProcess, buyingSteps, sellingSteps, tradeInSteps] = await Promise.all([
      allPublicLookups<Slide>('/slides'), publicApi<PublicBrand[]>('/brands'),
      publicApi<PageResult<PublicLookup>>('/lookups/body-styles', { limit: 100 }),
      allPublicLookups<PublicLookup & RangeOption>('/lookups/filter-options', { group: 'budget' }),
      allPublicLookups<Testimonial>('/testimonials'),
      publicApi<{ title: string; imageUrl?: string | null }[]>('/content', { group: 'thiet-lap-quy-trinh-ban-xe' }),
      publicApi<ServiceStep[]>('/content', { group: 'thiet-lap-cac-buoc-mua-xe' }),
      publicApi<ServiceStep[]>('/content', { group: 'thiet-lap-cac-buoc-ban-xe' }),
      publicApi<ServiceStep[]>('/content', { group: 'thiet-lap-cac-buoc-len-doi' }),
    ]);
    const slider = $('.slider_slick').first().empty();
    for (const slide of slides) slider.append($('<a></a>').attr({ href: publicHref(slide.link), title: slide.title })
      .append($('<img class="no_lazy">').attr({ src: slide.imageUrl, alt: slide.title })));
    if (!slides.length) {
      slider.closest('.slider').remove();
      $('.wap_muaxe').addClass('home-no-slides');
    }
    const groups = [brands, styles.data];
    const budgetOptions = budgets.map(item => ({ item, bounds: optionRange(item, 'budget') }))
      .filter(option => option.bounds)
      .sort((a, b) => (a.bounds?.min ?? 0) - (b.bounds?.min ?? 0) ||
        (a.bounds?.max ?? Infinity) - (b.bounds?.max ?? Infinity));
    $('.muaxe .ngansach').each((_, element) => {
      const target = $(element).empty();
      for (const { item, bounds } of budgetOptions) {
        const query = new URLSearchParams({ 'ngan-sach': `${bounds!.min ?? ''}-${bounds!.max ?? ''}` });
        target.append($('<a></a>').attr({ href: `/san-pham?${query}`, title: item.name }).text(item.name));
      }
      target.append('<a class="home-view-all" href="/san-pham" title="Xem tất cả xe">Xem tất cả xe</a>');
    });
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
    $('.muaxe .qcdongxe').filter((_, element) => !$(element).children().length && !$(element).text().trim()).remove();
    $('.muaxe').append('<a class="home-buy-banner" href="/san-pham" aria-label="Khám phá tất cả xe tại Toàn Trung"><img src="/images/mua-xe-banner.png" alt="Sẵn sàng tìm chiếc xe ưng ý? Khám phá kho xe chất lượng với giá tốt mỗi ngày. Mua xe ngay." width="2244" height="701" decoding="async"></a>');
    const processBox = $('.wap_muaxe .quytrinh').first();
    processBox.find('.td').first().text(sellingProcess.length ? `Quy trình ${sellingProcess.length} bước` : 'Quy trình bán xe');
    const processGrid = processBox.find('.quytrinh2').first().empty();
    for (const [index, step] of sellingProcess.entries()) {
      const card = $('<div class="item_qt"></div>');
      if (step.imageUrl) card.append($('<p class="img_post"></p>')
        .append($('<img loading="lazy" decoding="async">').attr({ src: step.imageUrl, alt: step.title })));
      card.append($('<div class="mota"></div>')
        .append($('<h4 class="name_post"></h4>').addClass(`tk${index}`).text(step.title)));
      processGrid.append(card);
    }
    if (!sellingProcess.length) processGrid.append('<p class="selling-process-empty">Quy trình đang được cập nhật.</p>');
    const serviceSection = $('.wap_dichvu').first();
    const buyingPanel = serviceSection.children('.dichvu').first();
    renderServiceSteps($, buyingPanel, 'buoc-mua-xe', buyingSteps);
    for (const [kind, steps, href, label] of [
      ['buoc-ban-xe', sellingSteps, '/ban-xe', 'Bán xe ngay'],
      ['buoc-len-doi', tradeInSteps, '/len-doi', 'Lên đời ngay'],
    ] as const) {
      const panel = buyingPanel.clone();
      renderServiceSteps($, panel, kind, steps);
      panel.find('.xemtatca a').attr('href', href).text(label);
      serviceSection.append(panel);
    }
    prepareServiceTabs($, serviceSection);
    renderTestimonials($, '.wap_camnhan .camnhan', testimonials, true);
    await populateCarFormBrands($);
    return { ...page, content: $.html(), cars: cards.mapped };
  }
  if (pathname === '/tin-tuc' && page) return articleListPage(page);
  if (pathname === '/cau-hoi' && page) return faqPage(page);
  if (pathname === '/cam-nhan' && page) return testimonialPage(page);
  if (pathname === '/dich-vu-khac' && page) return servicesPage(page);
  if (pathname === '/he-thong-oto-toan-trung-tuyen-dung' && page) return recruitmentsPage(page);
  if (pathname === '/ban-xe' && page) return serviceLandingPage(page, '/ban-xe');
  if (pathname === '/len-doi' && page) return serviceLandingPage(page, '/len-doi');
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
