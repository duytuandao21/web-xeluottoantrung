export interface LegacyPageData {
  route: string;
  title: string;
  description: string;
  canonical: string;
  openGraphImage: string;
  content: string;
  sourceFile: string;
}

export type SearchParams = Record<string, string | string[] | undefined>;
