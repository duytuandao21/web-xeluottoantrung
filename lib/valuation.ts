export type ConditionField = 'exteriorCondition' | 'interiorCondition' | 'accidentLevel' | 'floodLevel' | 'engineCondition' | 'transmissionCondition' | 'serviceHistory' | 'usageType';
export interface ValuationConfig {
  enabled: boolean; disclaimer: string; ctaLabel: string; policyVersion?: string; configurationKey?: string;
  limits?: { minModelYear: number; maxModelYear: number; maxVehicleAge: number; maxOdometerKm: number };
  conditionOptions?: { field: ConditionField; category: string; code: string; label: string; isUnknown: boolean }[];
  colors?: { id: string; name: string; colorCode?: string | null }[];
}
export interface CatalogItem { id: string; name: string; imageUrl?: string | null }
export interface CatalogResult<T = CatalogItem> { policyVersion: string; configurationKey?: string; data: T[] }
export interface EstimateInput {
  brandId: string; modelId: string; variantId: string; modelYear: number; odometerKm?: number;
  exteriorCondition?: string; interiorCondition?: string; accidentLevel?: string; floodLevel?: string;
  engineCondition?: string; transmissionCondition?: string; serviceHistory?: string; ownerCount?: number; usageType?: string; colorId?: string;
}
export interface ValuationResult {
  recordId?: string; leadToken?: string; leadTokenExpiresAt?: string;
  status: 'ESTIMATED' | 'MANUAL_INSPECTION' | 'MISSING_REFERENCE' | 'INSUFFICIENT_DATA';
  policyVersion: string; calculatedAt: string;
  vehicle: { brandName: string; modelName: string; variantName: string; modelYear: number };
  referencePrice: number | null; referenceType: 'ORIGINAL_MSRP' | 'CURRENT_MSRP' | 'MARKET_REFERENCE' | null;
  marketRange: { min: number; max: number } | null; dealerBuyingRange: { min: number; max: number } | null;
  confidenceScore: number; confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH'; missingFields: string[];
  manualInspectionRequired: boolean; reasons: { code: string; message: string }[];
  summaryFactors: { type: string; label: string; direction: 'INCREASE' | 'DECREASE' }[];
  disclaimer: string; ctaLabel: string;
}
export class ValuationApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface ValuationLeadInput { leadToken: string; name?: string; phone: string; city?: string; note?: string; consent: true }
export async function valuationApi<T>(path: string, options?: { body?: EstimateInput | ValuationLeadInput; signal?: AbortSignal }): Promise<T> {
  const response = await fetch(`/api/v1/valuation/${path}`, { method: options?.body ? 'POST' : 'GET', cache: 'no-store', signal: options?.signal,
    ...(options?.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}) }).catch(error => {
      if (options?.signal?.aborted) throw error;
      throw new Error('Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
    });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 429 ? 'Bạn đã tra cứu nhiều lần trong thời gian ngắn. Vui lòng đợi khoảng một phút rồi thử lại.'
      : response.status >= 500 ? 'Tiện ích chưa sẵn sàng. Vui lòng thử lại sau hoặc liên hệ Toàn Trung.'
      : typeof result?.message === 'string' && result.message !== 'Request failed' ? result.message : 'Thông tin chưa hợp lệ. Vui lòng kiểm tra và thử lại.';
    throw new ValuationApiError(response.status, message);
  }
  if (!result) throw new Error('Không đọc được kết quả. Vui lòng thử lại.');
  return result as T;
}
// Only normalize valid Vietnamese thousands separators. Preserve invalid input
// for validation rather than changing a negative/decimal number into valid km.
export function kmDigits(value: string) { return /^\d*(?:\.\d{3})*$/.test(value) ? value.replaceAll('.', '') : value; }
export function formatKm(value: string | number) { return value === '' ? '' : /^\d+$/.test(String(value)) ? new Intl.NumberFormat('vi-VN').format(Number(value)) : String(value); }
export function formatKmInput(previous: string, rawValue: string, position: number, inputType: string, data: string | null) {
  let value = rawValue, caret = position;
  // Deleting a separator should delete the adjacent digit, rather than putting
  // the same separator back and making Backspace/Delete appear unresponsive.
  if (previous[caret] === '.' && value === previous.slice(0, caret) + previous.slice(caret + 1)) {
    if (inputType === 'deleteContentBackward' && caret > 0) {
      value = value.slice(0, caret - 1) + value.slice(caret); caret--;
    } else if (inputType === 'deleteContentForward') {
      value = value.slice(0, caret) + value.slice(caret + 1);
    }
  }
  const editingDigits = /^\d*(?:\.\d{3})*$/.test(previous) && /^[\d.]*$/.test(value) &&
    (inputType.startsWith('delete') || inputType === 'insertText' && data !== null && /^\d+$/.test(data));
  const digits = editingDigits ? value.replaceAll('.', '') : kmDigits(value);
  const formatted = formatKm(digits);
  if (formatted === value || !/^\d*$/.test(digits)) return { value: formatted, caret };
  if (caret >= value.length) return { value: formatted, caret: formatted.length };
  let remaining = value.slice(0, caret).replaceAll('.', '').length, nextCaret = 0;
  while (nextCaret < formatted.length && remaining > 0) {
    if (/\d/.test(formatted[nextCaret])) remaining--;
    nextCaret++;
  }
  return { value: formatted, caret: nextCaret };
}
export function formatMoney(value: number) { return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value / 1000000)} triệu`; }
export const fieldLabels: Record<string, string> = {
  odometerKm: 'Số km đã sử dụng', exteriorCondition: 'Ngoại thất', interiorCondition: 'Nội thất', accidentLevel: 'Tai nạn', floodLevel: 'Ngập nước',
  engineCondition: 'Động cơ', transmissionCondition: 'Hộp số', serviceHistory: 'Bảo dưỡng', ownerCount: 'Số chủ', usageType: 'Mục đích sử dụng', colorId: 'Màu xe', referencePrice: 'Giá tham chiếu',
};
