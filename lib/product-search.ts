export type SearchProduct = { id: string; kind: 'car' | 'accessory'; name: string; href: string; imageUrl: string | null; price: number };
export type SearchSuggestions = { keywords: string[]; items: SearchProduct[]; total: number };
export type SearchResults = { data: SearchProduct[]; meta: { page: number; limit: number; total: number; totalPages: number } };
export const searchResultsHref = (query: string) => `/tim-kiem?${new URLSearchParams({ keyword: query.trim() })}`;
export const searchImage = (url: string | null) => url && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : '/thumbs/90x90x2/assets/images/noimage.png';
