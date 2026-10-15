import { load as originalLoad } from 'cheerio';
import { perfEnabled, perfSync } from './perf-observer';

export function measuredCheerio(label: string) {
  const load: typeof originalLoad = (...args) => {
    const api = perfSync('cheerio.parse', label, () => originalLoad(...args));
    if (perfEnabled()) {
      const originalHtml = api.html;
      api.html = function(this: unknown, ...args: unknown[]) {
        return perfSync('cheerio.serialize', label, () => Reflect.apply(originalHtml, this, args));
      } as typeof originalHtml;
    }
    return api;
  };
  return { load };
}
