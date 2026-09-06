import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fingerprintSteoForecast } from '../lib/steo-revision';
import {
  listSteoSnapshots,
  readSteoSnapshot,
  validateSteoSnapshot,
  writeSteoSnapshot,
  type SteoSnapshot,
} from '../lib/steo-snapshot-store';

function makeSnapshot(retrievedAt: string, shift = 0): SteoSnapshot {
  const revisionBasis = [
    { period: '2026-09', supplyMbpd: 105.0 + shift, demandMbpd: 104.8, balanceMbpd: 0.2 + shift },
    { period: '2026-10', supplyMbpd: 105.2 + shift, demandMbpd: 104.9, balanceMbpd: 0.3 + shift },
    { period: '2026-11', supplyMbpd: 105.4 + shift, demandMbpd: 105.1, balanceMbpd: 0.3 + shift },
  ];
  const forecast = revisionBasis.slice(1).map((point) => ({ ...point, classification: 'forecast' as const }));
  return {
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook',
    sourceUrl: 'https://www.eia.gov/outlooks/steo/',
    retrievedAt,
    revisionFingerprint: fingerprintSteoForecast(revisionBasis),
    revisionMethod: 'sha256 of sorted paired PAPR_WORLD/PATC_WORLD source response window values',
    revisionBasis,
    seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
    unit: 'million barrels per day',
    forecast,
  };
}

function tempArchive() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-'));
}

test('writes an immutable fingerprint-named snapshot', () => {
  const directory = tempArchive();
  const snapshot = makeSnapshot('2026-09-07T01:00:00Z');
  const stored = writeSteoSnapshot(snapshot, directory);

  assert.equal(stored.created, true);
  assert.equal(path.basename(stored.path), `${snapshot.revisionFingerprint}.json`);
  assert.deepEqual(readSteoSnapshot(stored.path), snapshot);
});

test('re-capturing the same source revision is idempotent even if the forward cutoff changes', () => {
  const directory = tempArchive();
  const first = makeSnapshot('2026-09-30T23:59:00Z');
  const second = {
    ...first,
    retrievedAt: '2026-10-01T00:01:00Z',
    forecast: first.forecast.slice(1),
  };

  const firstWrite = writeSteoSnapshot(first, directory);
  const secondWrite = writeSteoSnapshot(second, directory);

  assert.equal(firstWrite.created, true);
  assert.equal(secondWrite.created, false);
  assert.equal(second.revisionFingerprint, first.revisionFingerprint);
  assert.equal(readSteoSnapshot(firstWrite.path).retrievedAt, first.retrievedAt);
  assert.deepEqual(readSteoSnapshot(firstWrite.path).forecast, first.forecast);
});

test('stores distinct EIA source revisions as separate immutable snapshots', () => {
  const directory = tempArchive();
  const first = makeSnapshot('2026-09-07T01:00:00Z');
  const revised = makeSnapshot('2026-10-10T01:00:00Z', 0.2);

  writeSteoSnapshot(first, directory);
  writeSteoSnapshot(revised, directory);
  const snapshots = listSteoSnapshots(directory);

  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map((snapshot) => snapshot.revisionFingerprint), [first.revisionFingerprint, revised.revisionFingerprint]);
});

test('rejects a snapshot whose fingerprint does not match its revision basis', () => {
  const snapshot = makeSnapshot('2026-09-07T01:00:00Z');
  snapshot.revisionBasis[0].supplyMbpd += 1;

  assert.ok(validateSteoSnapshot(snapshot).some((error) => error.includes('does not match revisionBasis contents')));
});

test('rejects a forecast value that is not present identically in the archived revision basis', () => {
  const snapshot = makeSnapshot('2026-09-07T01:00:00Z');
  snapshot.forecast[0].supplyMbpd += 1;

  assert.ok(validateSteoSnapshot(snapshot).some((error) => error.includes('does not match the archived revision basis')));
});

test('rejects a valid snapshot stored under a misleading filename', () => {
  const directory = tempArchive();
  const snapshot = makeSnapshot('2026-09-07T01:00:00Z');
  const wrongPath = path.join(directory, `${'0'.repeat(64)}.json`);
  fs.writeFileSync(wrongPath, JSON.stringify(snapshot), 'utf8');

  assert.throws(() => readSteoSnapshot(wrongPath), /filename must match revision fingerprint/);
});

test('returns an empty list when no archive exists yet', () => {
  const missing = path.join(os.tmpdir(), `lastbarrel-missing-${Date.now()}`);
  assert.deepEqual(listSteoSnapshots(missing), []);
});
