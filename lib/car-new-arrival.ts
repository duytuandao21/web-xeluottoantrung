export const NEW_ARRIVAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function newArrivalExpiresAt(createdAt?: string | null): number | null {
  if (!createdAt) return null;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) ? created + NEW_ARRIVAL_DURATION_MS : null;
}

export function isNewArrival(createdAt?: string | null, now = Date.now()): boolean {
  const expires = newArrivalExpiresAt(createdAt);
  return expires !== null && now >= expires - NEW_ARRIVAL_DURATION_MS && now < expires;
}
