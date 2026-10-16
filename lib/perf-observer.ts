// Shared with components rendered on server and browser. Node installs the
// observer only when PERF_DIAGNOSTICS=true; no env or Node API enters the client.
export type PerfOutcome = 'ok' | 'error' | '429' | '503';
type Observer = { record(metric: string, label: string, ms: number, outcome?: PerfOutcome): void; gauge(name: string, value: number): void };
const observer = () => (globalThis as typeof globalThis & { __ttPerfObserver?: Observer }).__ttPerfObserver;
export const perfEnabled = () => observer() !== undefined;
export function perfStart(metric: string, label: string) {
  const target = observer();
  if (!target) return () => {};
  const started = performance.now();
  let finished = false;
  return (outcome: PerfOutcome = 'ok') => { if (finished) return; finished = true; try { target.record(metric, label, performance.now() - started, outcome); } catch { /* Diagnostics cannot affect a response. */ } };
}
export function perfSync<T>(metric: string, label: string, work: () => T): T {
  if (!perfEnabled()) return work();
  const done = perfStart(metric, label);
  try { const value = work(); done(); return value; } catch (error) { done('error'); throw error; }
}
export function perfAsync<T>(metric: string, label: string, work: () => Promise<T>): Promise<T> {
  if (!perfEnabled()) return work();
  const done = perfStart(metric, label);
  try { return work().then(value => { done(); return value; }, error => { done('error'); throw error; }); }
  catch (error) { done('error'); throw error; }
}
export function perfGauge(name: string, value: number) { try { observer()?.gauge(name, value); } catch { /* Best effort. */ } }
export function perfRoute(path: string) {
  return path === '/' ? 'home' : path === '/san-pham' || path === '/tim-kiem-nang-cao' ? 'listing' :
    path === '/ban-xe' ? 'sell' : path === '/len-doi' ? 'trade-in' : 'other-page';
}
export function perfApiLabel(path: string) {
  if (path === '/content/home') return 'home-content';
  const fixed = new Set(['cars', 'brands', 'seo', 'content', 'slides', 'testimonials', 'articles', 'article-categories', 'services', 'faqs', 'recruitments', 'accessories']);
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts.length === 1 && fixed.has(parts[0])) return parts[0];
  if (parts.length === 2 && parts[0] === 'lookups' && ['branches', 'branch-regions', 'body-styles', 'transmissions', 'car-colors', 'car-versions', 'filter-options'].includes(parts[1])) return `lookup:${parts[1]}`;
  if (parts[0] === 'site-settings') return 'settings';
  if (parts[0] === 'brands' && parts.length === 3 && parts[2] === 'models') return 'brand-models';
  if (path === '/cars/menu') return 'car-menu';
  return 'read-other';
}
