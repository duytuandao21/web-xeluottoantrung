const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAccessoryId = (value: string) => uuid.test(value);
export const isAccessorySlug = (value?: string | null): value is string =>
  typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !uuid.test(value);

/** UUID fallback keeps a rolling deployment compatible with the previous API. */
export function accessoryHref(item: { id: string; slug?: string | null }): string {
  return `/phu-kien-o-to/${isAccessorySlug(item.slug) ? item.slug : item.id}`;
}
