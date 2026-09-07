import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicEvidenceManifest } from '../lib/public-evidence-manifest';
import { derivePublicMarketSnapshot } from '../lib/public-market-snapshot';
import { createPublicMarketArchiveSnapshot } from '../lib/public-market-snapshot-store';
import { assessPublicSourceStateWatch } from '../lib/public-source-state-watch';
import type { SteoBalancePoint } from '../lib/steo';

const brentA = [
  { period: '2026-08', value: 80, units: 'USD/bbl' },
  { period: '2026-07', value: 79, units: 'USD/bbl' },
];
const wti = [
  { period: '2026-08', value: 75, units: 'USD/bbl' },
  { period: '2026-07', value: 74.5, units: 'USD/bbl' },
];
const inventories = [
  { period: '2026-09-04', value: 410000, units: 'thousand barrels' },
  { period: '2026-08-28', value: 408000, units: 'thousand barrels' },
];
const steo: SteoBalancePoint = {
  period: '2026-09',
  supplyMbpd: 105.12,
  demandMbpd: 104.11,
  balanceMbpd: 1.01,
  classification: 'forecast',
};

function state(retrievedAt: string, brent = brentA) {
  const publicSnapshot = derivePublicMarketSnapshot({ brent, wti, inventories, steoForecast: [steo] });
  const revisionFingerprint = 'a'.repeat(64);
  const publicEvidenceManifest = buildPublicEvidenceManifest({
    generatedAt: retrievedAt,
    retrievedAt,
    brent,
    wti,
    inventories,
    snapshot: publicSnapshot,
    steo: {
      sourceUrl: 'https://www.eia.gov/outlooks/steo/',
      revisionFingerprint,
      seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
      forecast: [steo],
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
      revisionFingerprint,
      seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
      nearTermPoint: steo,
    },
  });
}

test('stays quiet when the latest committed public source state is unchanged', () => {
  const committed = state('2026-09-07T03:00:00.000Z');
  const candidate = state('2026-09-08T03:00:00.000Z');
  assert.equal(committed.sourceFingerprint, candidate.sourceFingerprint);

  const assessment = assessPublicSourceStateWatch(candidate, [committed]);
  assert.equal(assessment.status, 'unchanged');
  assert.equal(assessment.actionRequired, false);
  assert.equal(assessment.action, 'none');
  assert.equal(assessment.comparison, null);
});

test('flags a genuinely new source fingerprint and carries an auditable comparison', () => {
  const committed = state('2026-09-07T03:00:00.000Z');
  const candidate = state('2026-09-08T03:00:00.000Z', [
    { period: '2026-08', value: 80.5, units: 'USD/bbl' },
    brentA[1],
  ]);

  const assessment = assessPublicSourceStateWatch(candidate, [committed]);
  assert.equal(assessment.status, 'new-source-state');
  assert.equal(assessment.actionRequired, true);
  assert.equal(assessment.action, 'review-and-commit-new-source-state');
  assert.equal(assessment.comparison?.method, 'lastbarrel-public-source-state-comparison-v1');
  assert.equal(assessment.comparison?.sourceChangeSummary.revised, 1);
  assert.equal(assessment.comparison?.derived.brentWtiSpread.delta, 0.5);
});

test('surfaces a previously known source fingerprint reappearing after another state', () => {
  const first = state('2026-09-07T03:00:00.000Z');
  const second = state('2026-09-08T03:00:00.000Z', [
    { period: '2026-08', value: 80.5, units: 'USD/bbl' },
    brentA[1],
  ]);
  const candidate = state('2026-09-09T03:00:00.000Z');
  assert.equal(first.sourceFingerprint, candidate.sourceFingerprint);
  assert.notEqual(second.sourceFingerprint, candidate.sourceFingerprint);

  const assessment = assessPublicSourceStateWatch(candidate, [first, second]);
  assert.equal(assessment.status, 'known-source-state-reappeared');
  assert.equal(assessment.actionRequired, true);
  assert.equal(assessment.action, 'review-known-source-state-reappearance');
  assert.equal(assessment.comparison?.sourceChangeSummary.revised, 1);
  assert.equal(assessment.comparison?.derived.brentWtiSpread.delta, -0.5);
});

test('requires explicit archive seeding rather than silently accepting an empty evidence history', () => {
  const candidate = state('2026-09-08T03:00:00.000Z');
  const assessment = assessPublicSourceStateWatch(candidate, []);
  assert.equal(assessment.status, 'archive-empty');
  assert.equal(assessment.actionRequired, true);
  assert.equal(assessment.action, 'seed-archive');
  assert.equal(assessment.comparison, null);
});

test('rejects a new candidate whose retrieval time is not later than the latest committed state', () => {
  const latest = state('2026-09-08T03:00:00.000Z');
  const candidate = state('2026-09-07T03:00:00.000Z', [
    { period: '2026-08', value: 80.5, units: 'USD/bbl' },
    brentA[1],
  ]);
  assert.throws(
    () => assessPublicSourceStateWatch(candidate, [latest]),
    /must be retrieved after the latest committed archive state/,
  );
});
