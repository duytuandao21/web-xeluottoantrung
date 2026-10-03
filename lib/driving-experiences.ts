import 'server-only';
import { cache } from 'react';
import { load } from 'cheerio';
import { optionalPublicApi, type Article } from './public-api';
import { safeHtml } from './safe-html';

export const getDrivingExperience = cache((slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240
  ? optionalPublicApi<Article>(`/driving-experiences/${slug}`) : Promise.resolve(null));

export function experienceSummary(article: Article) {
  return article.excerpt || load(safeHtml(article.content || ''), {}, false).text().replace(/\s+/g, ' ').trim().slice(0, 180);
}
