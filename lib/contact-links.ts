export function zaloHref(number?: string): string {
  const digits = (number || '').replace(/\D/g, '');
  return `https://zalo.me/${/^\d{9,12}$/.test(digits) ? digits : '0777393913'}`;
}
