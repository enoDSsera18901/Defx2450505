import path from 'node:path';
import { NextResponse } from 'next/server';
import { listPublicMarketArchiveSnapshots } from '../../../../lib/public-market-snapshot-store';
import { compareLatestPublicSourceStates } from '../../../../lib/public-source-state-comparison';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const directory = path.join(process.cwd(), 'data', 'public-market-snapshots');
    const archive = listPublicMarketArchiveSnapshots(directory);
    const first = archive[0] ?? null;
    const latest = archive.at(-1) ?? null;
    const comparison = archive.length >= 2 ? compareLatestPublicSourceStates(archive) : null;

    return NextResponse.json({
      status: 'available',
      data: {
        archive: {
          sourceStates: archive.length,
          firstRetrievedAt: first?.retrievedAt ?? null,
          latestRetrievedAt: latest?.retrievedAt ?? null,
          fingerprints: archive.map((item) => item.sourceFingerprint),
        },
        comparisonStatus: comparison ? 'available' : 'insufficient-history',
        requiredSourceStates: 2,
        comparison,
        limitations: [
          'Only distinct preserved public EIA source states are compared; synthetic history is never inserted.',
          'Source-state differences are descriptive and do not establish market causality or physical cargo availability.',
          'Commercial cargo, vessel, freight and proprietary flow data are outside this public archive.',
        ],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Public source-state history unavailable',
        data: null,
      },
      { status: 200 },
    );
  }
}
