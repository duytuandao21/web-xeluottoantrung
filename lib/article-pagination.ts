export const ARTICLE_PAGE_KEYS = ['tin-tuc-page', 'cau-hoi-page', 'kinh-nghiem-page'] as const;
export type ArticlePageKey = typeof ARTICLE_PAGE_KEYS[number];
export type ArticlePages = Record<ArticlePageKey, number>;
export const ARTICLE_SECTION_IDS: Record<ArticlePageKey, string> = { 'tin-tuc-page': 'muc-tin-tuc', 'cau-hoi-page': 'muc-cau-hoi', 'kinh-nghiem-page': 'muc-kinh-nghiem' };

export function articlePageNumber(value?: string | string[]): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const number = candidate && /^\d+$/.test(candidate) ? Number(candidate) : 1;
  return Number.isSafeInteger(number) && number >= 1 && number <= 100000 ? number : 1;
}

export function articleHubHref(pages: ArticlePages, key: ArticlePageKey, page: number): string {
  const updated = { ...pages, [key]: page };
  const params = new URLSearchParams();
  for (const name of ARTICLE_PAGE_KEYS) if (updated[name] > 1) params.set(name, String(updated[name]));
  return `/bai-viet${params.size ? `?${params}` : ''}#${ARTICLE_SECTION_IDS[key]}`;
}

export function articlePageLinks(page: number, totalPages: number): number[] {
  return [...new Set([1, totalPages, page - 1, page, page + 1])].filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b);
}
