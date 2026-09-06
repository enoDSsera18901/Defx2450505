import path from 'node:path';
import { backtestSteoVintages } from '../lib/steo-backtest';
import { listSteoSnapshots, type SteoSnapshot } from '../lib/steo-snapshot-store';

function findSnapshot(snapshots: SteoSnapshot[], fingerprint: string | undefined, fallback: SteoSnapshot) {
  if (!fingerprint) return fallback;
  const match = snapshots.find((snapshot) => snapshot.revisionFingerprint === fingerprint);
  if (!match) throw new Error(`Archived STEO snapshot not found: ${fingerprint}`);
  return match;
}

function main() {
  const [baselineFingerprint, referenceFingerprint, directoryArg] = process.argv.slice(2);
  const directory = path.resolve(process.cwd(), directoryArg || 'data/steo-snapshots');
  const snapshots = listSteoSnapshots(directory);
  if (snapshots.length < 2) {
    throw new Error(`STEO backtest requires at least two archived source revisions; found ${snapshots.length} in ${directory}`);
  }

  const baseline = findSnapshot(snapshots, baselineFingerprint, snapshots[0]);
  const reference = findSnapshot(snapshots, referenceFingerprint, snapshots[snapshots.length - 1]);
  const report = backtestSteoVintages(baseline, reference);

  console.log(JSON.stringify({
    archiveDirectory: directory,
    archivedRevisions: snapshots.length,
    baselineSelection: baselineFingerprint ? 'explicit-fingerprint' : 'earliest-archived-revision',
    referenceSelection: referenceFingerprint ? 'explicit-fingerprint' : 'latest-archived-revision',
    ...report,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
