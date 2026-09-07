import path from 'node:path';
import { NextResponse } from 'next/server';
import { buildSteoRevisionIntelligence } from '../../../../lib/steo-revision-intelligence';
import { listOfficialSteoVintages } from '../../../../lib/steo-official-vintage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const directory = path.join(process.cwd(), 'data', 'steo-official-vintages');
    const vintages = listOfficialSteoVintages(directory);
    return NextResponse.json({ status: 'available', data: buildSteoRevisionIntelligence(vintages) });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'STEO revision intelligence unavailable',
        data: null,
      },
      { status: 200 },
    );
  }
}
