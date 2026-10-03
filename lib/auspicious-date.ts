export const purposeLabels = { BUY_CAR: 'Mua xe', RECEIVE_CAR: 'Nhận xe', SIGN_CONTRACT: 'Ký hợp đồng' };
export const classificationLabels = { VERY_GOOD: 'Rất phù hợp', NORMAL: 'Bình thường', AVOID: 'Nên tránh' };
export type Purpose = keyof typeof purposeLabels;
export type Classification = 'VERY_GOOD' | 'GOOD' | 'NORMAL' | 'NOT_RECOMMENDED' | 'AVOID';
export function displayClassification(classification: Classification): keyof typeof classificationLabels {
  if (classification === 'GOOD') return 'VERY_GOOD';
  if (classification === 'NOT_RECOMMENDED') return 'AVOID';
  return classification;
}
export interface DateConfig {
  enabled: boolean; name: string; maxSearchDays: number; purposes: Purpose[]; defaultPurpose: Purpose;
  display: { showLunarDate: boolean; showCanChi: boolean; showGoodHours: boolean; showExplanation: boolean; showScore: boolean };
  disclaimer: string; ctaLabel: string; seoTitle: string; seoDescription: string; currentDate: string;
  minDate: string; maxDate: string; defaultFrom: string; defaultTo: string;
}
export interface SearchInput { birthDate: string; purpose: Purpose; gender?: string; from: string; to: string }
export interface LunarDate { day: number; month: number; year: number; leap: boolean }
export interface Reason { code: string; effect: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; title: string; shortDescription: string; detailDescription?: string }
export interface DateResult { date: string; classification: Classification; score?: number; criticalViolations: number; summaryReasons: Reason[]; lunar?: LunarDate }
export interface CalendarMonth { key: string; label: string; cells: ({ date: string; day: number; classification: Classification | null } | null)[] }
export interface SearchResult { rulesetVersion: string; from: string; to: string; results: DateResult[]; months: CalendarMonth[]; recommended: DateResult[]; disclaimer: string; ctaLabel: string }
export interface DetailResult extends DateResult { calendar: { solarDate: string; lunar?: LunarDate; canChi?: { year: { label: string }; month: { label: string }; day: { label: string } }; solarTerm?: string }; reasonGroups: { category: string; reasons: Reason[] }[]; goodHours: { branch: string; start: string; end: string; crossesMidnight: boolean }[]; disclaimer: string; ctaLabel: string; rulesetVersion: string }
export function formatDate(date: string): string { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; }
export async function dateApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/auspicious-dates/${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(path === 'config' ? 'Chưa thể tải tiện ích. Vui lòng thử lại sau.' : typeof result.message === 'string' && result.message !== 'Invalid input' ? result.message : 'Không thể tra cứu. Vui lòng kiểm tra thông tin và thử lại.');
  return result as T;
}
