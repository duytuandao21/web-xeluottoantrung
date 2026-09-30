import 'server-only';

const filter = {
  FilterBy: {
    And: [
      { SystemID: { Equals: '6783dc1271ff449e95b74a9520964169' } },
      { RepositoryID: { Equals: 'a95451e23b474fe5886bfb7cf843f53c' } },
      { RepositoryEntityID: { Equals: '3801378fe1e045b1afa10de7c5776124' } },
    ],
  },
};

const request = Buffer.from(JSON.stringify(filter), 'utf8').toString('base64url');
const endpoint = `https://portals.petrolimex.com.vn/~apis/portals/cms.item/search?x-request=${request}`;

export type FuelPrice = {
  name: string;
  zone1Price: number | null;
  zone2Price: number | null;
  updatedDate: string | null;
};

function price(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' ? Number(value.replace(/[.,\s]/g, '')) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function displayDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return `${day}/${month}/${year}`;
}

export function parseFuelPrices(data: unknown): FuelPrice[] {
  if (!data || typeof data !== 'object' || !('Objects' in data) || !Array.isArray(data.Objects)) {
    throw new Error('Petrolimex response has no Objects list');
  }
  const rows = data.Objects.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  rows.sort((a, b) => Number(a.DIsplayOrder ?? a.DisplayOrder ?? 0) - Number(b.DIsplayOrder ?? b.DisplayOrder ?? 0));
  const prices = rows.map(item => ({
    name: typeof item.Title === 'string' ? item.Title.trim() : '',
    zone1Price: price(item.Zone1Price),
    zone2Price: price(item.Zone2Price),
    updatedDate: displayDate(item.LastModified),
  })).filter(item => item.name && (item.zone1Price !== null || item.zone2Price !== null));
  if (!prices.length) throw new Error('Petrolimex response has no valid prices');
  return prices;
}

export async function fetchFuelPrices(): Promise<FuelPrice[]> {
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Petrolimex returned ${response.status}`);
  return parseFuelPrices(await response.json());
}
