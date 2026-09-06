import path from 'node:path';
import { getSteoGlobalBalance } from '../lib/steo';
import { writeSteoSnapshot, type SteoSnapshot } from '../lib/steo-snapshot-store';

async function main() {
  const directory = path.resolve(process.cwd(), process.argv[2] || 'data/steo-snapshots');
  const live = await getSteoGlobalBalance();
  const snapshot: SteoSnapshot = {
    source: live.source,
    sourceUrl: live.sourceUrl,
    retrievedAt: live.retrievedAt,
    revisionFingerprint: live.revisionFingerprint,
    revisionMethod: live.revisionMethod,
    revisionBasis: live.revisionBasis,
    seriesIds: live.seriesIds,
    unit: live.unit,
    forecast: live.forecast,
  };

  const result = writeSteoSnapshot(snapshot, directory);
  console.log(JSON.stringify({
    status: result.created ? 'captured-new-revision' : 'revision-already-present',
    fingerprint: result.fingerprint,
    path: result.path,
    retrievedAt: snapshot.retrievedAt,
    revisionBasisPeriods: snapshot.revisionBasis.length,
    forecastPeriods: snapshot.forecast.length,
    source: snapshot.source,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
