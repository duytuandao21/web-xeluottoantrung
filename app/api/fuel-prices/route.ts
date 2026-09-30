import { NextResponse } from 'next/server';
import { fetchFuelPrices } from '@/lib/fuel-prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ prices: await fetchFuelPrices() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Could not load Petrolimex fuel prices:', error);
    return NextResponse.json({ message: 'Chưa thể lấy giá xăng dầu lúc này. Vui lòng thử lại sau.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
