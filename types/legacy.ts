export interface LegacyPageData {
  route: string;
  title: string;
  description: string;
  canonical: string;
  openGraphImage: string;
  content: string;
  sourceFile: string;
  cars?: Record<string, import('./car').Car>;
}

export type SearchParams = Record<string, string | string[] | undefined>;
