export type TechnicalKey = 'brand' | 'bodyStyle' | 'transmission' | 'fuel';
export type RecommendationQuestion = { key: string; title: string; description: string; type: 'single' | 'multi' | 'budget' | 'technical'; required: boolean; maxSelections: number; helpText: string; options: { key: string; label: string }[] };
export type RecommendationAnswers = { purposes: string[]; budget: { min: number; max: number }; passengers: string; requireSeats: boolean; environment: string; priorities: string[]; technical: Partial<Record<TechnicalKey, string>> & { required: TechnicalKey[] }; style: string; extras: Record<string, string | string[]> };
export type RecommendationConfig = { enabled: boolean; questions: RecommendationQuestion[]; minBudget: number; maxBudget: number; budgetPresets: { label: string; min: number; max: number }[]; technicalOptions: Record<TechnicalKey, { key: string; label: string }[]>; updatedAt: string };
export type RecommendationCar = { id: string; slug: string; name: string; year: number; price: number; mileage: number | null; seatCount: number | null; brand: { name: string; slug: string }; model: { name: string; slug: string }; bodyStyle: { name: string | null; slug: string | null }; transmission: { name: string | null; slug: string | null }; fuel: string | null; cover: string | null; branch: string | null };
export type RecommendationResult = { sessionId: string; createdAt: string; expiresAt: string; results: { car: RecommendationCar; score: number; coverage: number; reasons: string[]; caveats: string[] }[]; unavailableCarIds: string[]; eligibleCount: number; pageSize: number; nextOffset: number; hasMore: boolean; totalAvailable: number };
export const blankRecommendationAnswers = (): RecommendationAnswers => ({ purposes: [], budget: { min: 0, max: 500000000 }, passengers: '', requireSeats: false, environment: '', priorities: [], technical: { required: [] }, style: '', extras: {} });
// Legacy key: only remove old progress; new survey state stays in component memory.
export const recommendationStorageKey = 'tt-car-needs-survey';
export type SurveyState = { answers: RecommendationAnswers; step: number; startedAt: number; noticeAccepted: boolean; pending?: { requestId: string; capability: string; answersKey: string; configUpdatedAt?: string } };
export function alignRecommendationAnswers(answers: RecommendationAnswers, config: RecommendationConfig): RecommendationAnswers {
  const next = structuredClone(answers), question = (key: string) => config.questions.find(q => q.key === key);
  for (const key of ['purposes', 'priorities'] as const) next[key] = next[key].filter(v => question(key)?.options.some(o => o.key === v)).slice(0, question(key)?.maxSelections || 1);
  for (const key of ['passengers', 'environment', 'style'] as const) if (!question(key)?.options.some(o => o.key === next[key])) next[key] = '';
  next.technical = question('technical') ? { ...next.technical } : { required: [] };
  for (const key of ['brand', 'bodyStyle', 'transmission', 'fuel'] as const) if (!config.technicalOptions[key].some(o => o.key === next.technical[key])) delete next.technical[key];
  next.technical.required = next.technical.required.filter(key => !!next.technical[key]);
  next.extras = {};
  for (const q of config.questions.filter(q => q.key.startsWith('custom_'))) {
    const raw = answers.extras[q.key], values = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(v => q.options.some(o => o.key === v)).slice(0, q.type === 'single' ? 1 : q.maxSelections);
    if (values.length) next.extras[q.key] = q.type === 'single' ? values[0] : values;
  }
  return next;
}
export function requestCapability() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function recommendationRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on the local HTTP IP used for phone testing.
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export class RecommendationApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function recommendationApi<T>(path: string, options: { body?: unknown; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  const response = await fetch(`/api/v1/car-recommendations/${path}`, { method: options.body ? 'POST' : 'GET', cache: 'no-store', signal: options.signal, keepalive: options.keepalive,
    ...(options.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}) }).catch(error => {
      if (options.signal?.aborted) throw error;
      throw new Error('Không thể kết nối. Vui lòng kiểm tra mạng rồi thử lại.');
    });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new RecommendationApiError(response.status, response.status === 429 ? 'Bạn đã gửi nhiều yêu cầu. Vui lòng chờ khoảng một phút rồi thử lại.' : response.status >= 500 ? 'Tiện ích đang được cập nhật. Vui lòng thử lại sau hoặc liên hệ tư vấn.' : typeof result?.message === 'string' ? result.message : 'Câu trả lời chưa hợp lệ. Vui lòng kiểm tra lại.');
  if (!result) throw new Error('Không đọc được kết quả. Vui lòng thử lại.');
  return result as T;
}
