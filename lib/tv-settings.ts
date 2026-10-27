import type { TVHotline } from '@/types/tv';
import { defaultTVAnniversary, parseTVAnniversary, type TVAnniversarySettings } from './tv-anniversary-settings';

export type TVSettings = {
  theme: 'standard' | 'anniversary-4';
  anniversary: TVAnniversarySettings;
  logoUrl: string;
  title: string;
  hotlineTitle: string;
  carIntervalSeconds: number;
  hotlineIntervalSeconds: number;
  syncSalesContacts: boolean;
  hotlines: TVHotline[];
};
export const defaultTVSettings: TVSettings = {
  theme: 'standard',
  anniversary: defaultTVAnniversary,
  logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Hotline',
  carIntervalSeconds: 15, hotlineIntervalSeconds: 5, syncSalesContacts: true, hotlines: [],
};
const normalizePhone = (phone: string) => phone.replace(/[\s().-]/g, '');
export function validTVHotlines(rows: TVHotline[]): TVHotline[] {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (!row || typeof row.phone !== 'string') return [];
    const phone = normalizePhone(row.phone);
    const identity = phone.replace(/^\+?84(?=\d{9}$)/, '0');
    if (!/^\+?\d{9,12}$/.test(phone) || seen.has(identity)) return [];
    seen.add(identity);
    return [{ name: typeof row.name === 'string' ? row.name.trim() : '', phone }];
  });
}
export function tvSalesContacts(rows: { title: string; body?: string | null; phone?: string | null; status?: string }[]): TVHotline[] {
  return validTVHotlines(rows.filter(row => (!row.status || row.status === 'active') &&
    /tu\s*van\s*ban\s*hang/.test((row.body || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))
    .map(row => ({ name: row.title, phone: row.phone || '' })));
}
/** Defensive parsing only; no metadata probes or requests during rendering. */
export function parseTVSettings(value?: string | null): TVSettings {
  if (!value) return { ...defaultTVSettings };
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid TV settings');
  const raw = data as TVSettings;
  const theme = raw.theme === undefined ? 'standard' : raw.theme;
  if (theme !== 'standard' && theme !== 'anniversary-4') throw new Error('Invalid TV theme');
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 60 ||
    typeof raw.hotlineTitle !== 'string' || !raw.hotlineTitle.trim() || raw.hotlineTitle.length > 24 ||
    typeof raw.logoUrl !== 'string' || raw.logoUrl && !/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(raw.logoUrl) ||
    typeof raw.syncSalesContacts !== 'boolean' || !Array.isArray(raw.hotlines) || raw.hotlines.length > 30 ||
    !Number.isInteger(raw.carIntervalSeconds) || raw.carIntervalSeconds < 5 || raw.carIntervalSeconds > 300 ||
    !Number.isInteger(raw.hotlineIntervalSeconds) || raw.hotlineIntervalSeconds < 2 || raw.hotlineIntervalSeconds > 120)
    throw new Error('Invalid TV settings');
  const hotlines = validTVHotlines(raw.hotlines);
  if (!raw.syncSalesContacts && !hotlines.length) throw new Error('Missing TV hotlines');
  return { ...raw, theme, anniversary: parseTVAnniversary(raw.anniversary), hotlines };
}
