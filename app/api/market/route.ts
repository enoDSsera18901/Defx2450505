import { NextResponse } from 'next/server';
import { getEiaMarketData } from '../../../lib/eia';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ status: 'live', data: await getEiaMarketData() });
  } catch (error) {
    return NextResponse.json({ status: 'fallback', error: error instanceof Error ? error.message : 'EIA unavailable', data: null }, { status: 200 });
  }
}

