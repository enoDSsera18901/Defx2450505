import path from 'node:path';
import { listPublicMarketArchiveSnapshots } from '../lib/public-market-snapshot-store';
import { compareLatestPublicSourceStates, comparePublicSourceStates } from '../lib/public-source-state-comparison';

function main() {
  const directory = path.resolve(process.argv[2] ?? 'data/public-market-snapshots');
  const baselineFingerprint = process.argv[3] ?? null;
  const referenceFingerprint = process.argv[4] ?? null;
  const archive = listPublicMarketArchiveSnapshots(directory);

  if ((baselineFingerprint && !referenceFingerprint) || (!baselineFingerprint && referenceFingerprint)) {
    throw new Error('Provide both baseline and reference fingerprints, or neither');
  }

  if (!baselineFingerprint && !referenceFingerprint) {
    if (archive.length < 2) {
      process.stdout.write(`${JSON.stringify({
        status: 'insufficient-history',
        directory,
        sourceStates: archive.length,
        requiredSourceStates: 2,
        message: 'At least two distinct genuine archived public source states are required; no synthetic comparison is produced.',
      }, null, 2)}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${JSON.stringify({
      status: 'available',
      directory,
      sourceStates: archive.length,
      comparison: compareLatestPublicSourceStates(archive),
    }, null, 2)}\n`);
    return;
  }

  const baseline = archive.find((item) => item.sourceFingerprint === baselineFingerprint);
  const reference = archive.find((item) => item.sourceFingerprint === referenceFingerprint);
  if (!baseline) throw new Error(`Baseline source fingerprint not found in archive: ${baselineFingerprint}`);
  if (!reference) throw new Error(`Reference source fingerprint not found in archive: ${referenceFingerprint}`);

  process.stdout.write(`${JSON.stringify({
    status: 'available',
    directory,
    sourceStates: archive.length,
    comparison: comparePublicSourceStates(baseline, reference),
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
