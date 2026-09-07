import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { listPublicMarketArchiveSnapshots } from '../lib/public-market-snapshot-store';

const archiveDirectory = path.join(process.cwd(), 'data', 'public-market-snapshots');

test('committed public market archive contains the verified seed source state', () => {
  const snapshots = listPublicMarketArchiveSnapshots(archiveDirectory);
  assert.ok(snapshots.length >= 1, 'expected at least one committed public market source state');

  const seed = snapshots.find((snapshot) => snapshot.sourceFingerprint === 'df6bec856e7074cac3b997b6939fffb02c850f0fbc3032d377ef54544c86c756');
  assert.ok(seed, 'verified 2026-09-07 public market source-state seed is missing');
  assert.equal(seed.seriesIds.brent, 'RBRTE');
  assert.equal(seed.seriesIds.wti, 'RWTC');
  assert.equal(seed.seriesIds.inventories, 'WCESTUS1');
  assert.equal(seed.prices.brent.length, 13);
  assert.equal(seed.prices.wti.length, 13);
  assert.equal(seed.inventories.length, 13);
  assert.equal(seed.publicSnapshot.brentWtiSpread?.spreadUsdBbl, 7.18);
  assert.equal(seed.publicSnapshot.inventoryChange?.deltaThousandBarrels, -4450);
  assert.equal(seed.steo?.nearTermPoint.classification, 'forecast');
  assert.equal(seed.steo?.revisionFingerprint, '0a2684b009472a16466e7c5cf3a344c4862ff17e1bba0b4880a65a022b21706c');
  assert.equal(seed.publicEvidenceManifest.integrity.steoRevisionFingerprint, seed.steo?.revisionFingerprint);
});

test('every committed public market snapshot has a unique source fingerprint', () => {
  const snapshots = listPublicMarketArchiveSnapshots(archiveDirectory);
  const fingerprints = snapshots.map((snapshot) => snapshot.sourceFingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
});
