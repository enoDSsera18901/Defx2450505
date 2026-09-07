import { NextResponse } from 'next/server';
import { getEiaMarketData } from '../../../lib/eia';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const market = await getEiaMarketData();
    return NextResponse.json(
      {
        status: 'available',
        data: market.publicEvidenceManifest,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Public evidence manifest unavailable',
        data: null,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
