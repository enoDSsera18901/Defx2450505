import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPublicEvidenceManifest } from '../lib/public-evidence-manifest';
import { derivePublicMarketSnapshot } from '../lib/public-market-snapshot';
import {
  createPublicMarketArchiveSnapshot,
  listPublicMarketArchiveSnapshots,
  readPublicMarketArchiveSnapshot,
  validatePublicMarketArchiveSnapshot,
  writePublicMarketArchiveSnapshot,
} from '../lib/public-market-snapshot-store';
import type { SteoBalancePoint } from '../lib/steo';

const steoPoint: SteoBalancePoint = {
  period: '2026-09',
  supplyMbpd: 105.123,
  demandMbpd: 104.111,
  balanceMbpd: 1.01,
  classification: 'forecast',
};
const steoRevisionFingerprint = 'c'.repeat(64);
const baseBrent = [
  { period: '2026-08', value: 80, units: 'USD/bbl' },
  { period: '2026-07', value: 79, units: 'USD/bbl' },
];
const baseWti = [
  { period: '2026-08', value: 75, units: 'USD/bbl' },
  { period: '2026-07', value: 74.5, units: 'USD/bbl' },
];
const baseInventories = [
  { period: '2026-09-04', value: 410000, units: 'thousand barrels' },
  { period: '2026-08-28', value: 408000, units: 'thousand barrels' },
  { period: '2026-08-21', value: 409500, units: 'thousand barrels' },
];

function buildSnapshot(options: {
  retrievedAt?: string;
  brent?: typeof baseBrent;
  wti?: typeof baseWti;
  inventories?: typeof baseInventories;
} = {}) {
  const retrievedAt = options.retrievedAt ?? '2026-09-07T03:40:00.000Z';
  const brent = options.brent ?? baseBrent;
  const wti = options.wti ?? baseWti;
  const inventories = options.inventories ?? baseInventories;
  const publicSnapshot = derivePublicMarketSnapshot({ brent, wti, inventories, steoForecast: [steoPoint] });
  const publicEvidenceManifest = buildPublicEvidenceManifest({
    generatedAt: retrievedAt,
    retrievedAt,
    brent,
    wti,
    inventories,
    snapshot: publicSnapshot,
    steo: {
      sourceUrl: 'https://www.eia.gov/outlooks/steo/',
      revisionFingerprint: steoRevisionFingerprint,
      seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
      forecast: [steoPoint],
    },
  });

  return createPublicMarketArchiveSnapshot({
    retrievedAt,
    prices: { brent, wti },
    inventories,
    publicSnapshot,
    publicEvidenceManifest,
    steo: {
      sourceUrl: 'https://www.eia.gov/outlooks/steo/',
      revisionFingerprint: steoRevisionFingerprint,
      seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
      nearTermPoint: steoPoint,
    },
  });
}

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-public-market-'));
}

test('writes, reads and lists an immutable reproducible public market source state', () => {
  const directory = temporaryDirectory();
  const snapshot = buildSnapshot();
  assert.match(snapshot.sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(validatePublicMarketArchiveSnapshot(snapshot), []);

  const stored = writePublicMarketArchiveSnapshot(snapshot, directory);
  assert.equal(stored.created, true);
  assert.equal(path.basename(stored.path), `${snapshot.sourceFingerprint}.json`);

  const read = readPublicMarketArchiveSnapshot(stored.path);
  assert.deepEqual(read, snapshot);
  assert.deepEqual(listPublicMarketArchiveSnapshots(directory), [snapshot]);
});

test('same source state captured later is idempotent despite retrieval timestamp changes', () => {
  const directory = temporaryDirectory();
  const first = buildSnapshot({ retrievedAt: '2026-09-07T03:40:00.000Z' });
  const later = buildSnapshot({ retrievedAt: '2026-09-07T04:40:00.000Z' });
  assert.equal(first.sourceFingerprint, later.sourceFingerprint);

  assert.equal(writePublicMarketArchiveSnapshot(first, directory).created, true);
  const repeated = writePublicMarketArchiveSnapshot(later, directory);
  assert.equal(repeated.created, false);
  assert.equal(listPublicMarketArchiveSnapshots(directory).length, 1);
});

test('source row ordering does not manufacture a new source-state fingerprint', () => {
  const first = buildSnapshot();
  const reordered = buildSnapshot({
    retrievedAt: '2026-09-07T04:40:00.000Z',
    brent: [...baseBrent].reverse(),
    wti: [...baseWti].reverse(),
    inventories: [...baseInventories].reverse(),
  });
  assert.equal(first.sourceFingerprint, reordered.sourceFingerprint);

  const directory = temporaryDirectory();
  writePublicMarketArchiveSnapshot(first, directory);
  assert.equal(writePublicMarketArchiveSnapshot(reordered, directory).created, false);
});

test('a changed public source value creates a new immutable source state', () => {
  const directory = temporaryDirectory();
  const first = buildSnapshot();
  const changed = buildSnapshot({
    retrievedAt: '2026-09-07T05:40:00.000Z',
    brent: [
      { period: '2026-08', value: 80.25, units: 'USD/bbl' },
      ...baseBrent.slice(1),
    ],
  });
  assert.notEqual(first.sourceFingerprint, changed.sourceFingerprint);
  assert.equal(writePublicMarketArchiveSnapshot(first, directory).created, true);
  assert.equal(writePublicMarketArchiveSnapshot(changed, directory).created, true);
  assert.equal(listPublicMarketArchiveSnapshots(directory).length, 2);
});

test('rejects tampered derived snapshot values and source fingerprints', () => {
  const snapshot = buildSnapshot();
  const tampered = JSON.parse(JSON.stringify(snapshot));
  tampered.publicSnapshot.brentWtiSpread.spreadUsdBbl = 99;
  const errors = validatePublicMarketArchiveSnapshot(tampered);
  assert.ok(errors.some((error) => error.includes('publicSnapshot does not reproduce')));
  assert.ok(errors.some((error) => error.includes('cannot reproduce Brent-WTI spread arithmetic')));

  const wrongFingerprint = JSON.parse(JSON.stringify(snapshot));
  wrongFingerprint.sourceFingerprint = 'd'.repeat(64);
  assert.ok(validatePublicMarketArchiveSnapshot(wrongFingerprint).some((error) => error.includes('sourceFingerprint does not match')));
});

test('rejects duplicate source periods rather than archiving ambiguous observations', () => {
  const snapshot = buildSnapshot();
  const invalid = JSON.parse(JSON.stringify(snapshot));
  invalid.prices.brent.push({ ...invalid.prices.brent[0] });
  assert.ok(validatePublicMarketArchiveSnapshot(invalid).some((error) => error.includes('duplicate period')));
});

test('read rejects a valid snapshot stored under the wrong filename', () => {
  const directory = temporaryDirectory();
  const snapshot = buildSnapshot();
  const wrongPath = path.join(directory, `${'e'.repeat(64)}.json`);
  fs.writeFileSync(wrongPath, `${JSON.stringify(snapshot)}\n`);
  assert.throws(() => readPublicMarketArchiveSnapshot(wrongPath), /filename must match source fingerprint/);
});
