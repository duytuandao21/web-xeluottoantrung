export function zaloHref(number?: string): string {
  const digits = (number || '').replace(/\D/g, '');
  return `https://zalo.me/${/^\d{9,12}$/.test(digits) ? digits : '0777393913'}`;
}

export function showroom10MapHref(branches: { name: string; mapUrl?: string | null }[]): string {
  const showroom = branches.find(branch => /\btoan\s+trung\s+10$/i.test(
    branch.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
  ));
  const url = showroom?.mapUrl?.trim();
  // Verified Showroom 10 pin; keep directions available if the catalog is temporarily unavailable.
  return url && /^https:\/\/[^\s]+$/i.test(url) ? url : 'https://maps.app.goo.gl/GNJC8kdZBz7MsoAH7';
}
