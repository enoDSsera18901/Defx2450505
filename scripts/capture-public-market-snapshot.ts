import path from 'node:path';
import { getEiaMarketData } from '../lib/eia';
import {
  createPublicMarketArchiveSnapshot,
  listPublicMarketArchiveSnapshots,
  writePublicMarketArchiveSnapshot,
} from '../lib/public-market-snapshot-store';

const STEO_URL = 'https://www.eia.gov/outlooks/steo/' as const;
const STEO_SERIES = { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' } as const;

async function main() {
  const directory = path.resolve(process.argv[2] ?? 'data/public-market-snapshots');
  const market = await getEiaMarketData();
  const nearTerm = market.globalBalance?.forecast
    ? [...market.globalBalance.forecast].sort((a, b) => a.period.localeCompare(b.period))[0] ?? null
    : null;

  if (market.globalBalance) {
    if (market.globalBalance.sourceUrl !== STEO_URL) {
      throw new Error(`Refusing public archive capture: unexpected STEO source URL ${market.globalBalance.sourceUrl}`);
    }
    if (
      market.globalBalance.seriesIds?.supply !== STEO_SERIES.supply
      || market.globalBalance.seriesIds?.demand !== STEO_SERIES.demand
    ) {
      throw new Error('Refusing public archive capture: unexpected STEO source series identity');
    }
  }

  const snapshot = createPublicMarketArchiveSnapshot({
    retrievedAt: market.observedAt,
    prices: market.prices,
    inventories: market.inventories,
    publicSnapshot: market.publicSnapshot,
    publicEvidenceManifest: market.publicEvidenceManifest,
    steo: market.globalBalance && nearTerm
      ? {
          sourceUrl: STEO_URL,
          revisionFingerprint: market.globalBalance.revisionFingerprint,
          seriesIds: STEO_SERIES,
          nearTermPoint: nearTerm,
        }
      : null,
  });

  const stored = writePublicMarketArchiveSnapshot(snapshot, directory);
  const archive = listPublicMarketArchiveSnapshots(directory);

  process.stdout.write(`${JSON.stringify({
    status: stored.created ? 'captured-new-source-state' : 'source-state-already-present',
    directory,
    path: stored.path,
    created: stored.created,
    sourceFingerprint: stored.fingerprint,
    retrievedAt: snapshot.retrievedAt,
    brentPeriods: snapshot.prices.brent.length,
    wtiPeriods: snapshot.prices.wti.length,
    inventoryPeriods: snapshot.inventories.length,
    steoRevisionFingerprint: snapshot.steo?.revisionFingerprint ?? null,
    steoNearTermPeriod: snapshot.steo?.nearTermPoint.period ?? null,
    archiveSourceStates: archive.length,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
