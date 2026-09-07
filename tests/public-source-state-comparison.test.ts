import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicEvidenceManifest } from '../lib/public-evidence-manifest';
import { derivePublicMarketSnapshot } from '../lib/public-market-snapshot';
import { createPublicMarketArchiveSnapshot } from '../lib/public-market-snapshot-store';
import {
  compareLatestPublicSourceStates,
  comparePublicSourceStates,
} from '../lib/public-source-state-comparison';
import type { SteoBalancePoint } from '../lib/steo';

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
const baseSteo: SteoBalancePoint = {
  period: '2026-09',
  supplyMbpd: 105.12,
  demandMbpd: 104.11,
  balanceMbpd: 1.01,
  classification: 'forecast',
};

function buildState(options: {
  retrievedAt?: string;
  brent?: typeof baseBrent;
  wti?: typeof baseWti;
  inventories?: typeof baseInventories;
  steo?: SteoBalancePoint | null;
  steoFingerprint?: string;
} = {}) {
  const retrievedAt = options.retrievedAt ?? '2026-09-07T03:40:00.000Z';
  const brent = options.brent ?? baseBrent;
  const wti = options.wti ?? baseWti;
  const inventories = options.inventories ?? baseInventories;
  const steo = options.steo === undefined ? baseSteo : options.steo;
  const steoFingerprint = options.steoFingerprint ?? 'a'.repeat(64);
  const publicSnapshot = derivePublicMarketSnapshot({
    brent,
    wti,
    inventories,
    steoForecast: steo ? [steo] : null,
  });
  const steoEvidence = steo
    ? {
        sourceUrl: 'https://www.eia.gov/outlooks/steo/' as const,
        revisionFingerprint: steoFingerprint,
        seriesIds: { supply: 'PAPR_WORLD' as const, demand: 'PATC_WORLD' as const },
        forecast: [steo],
      }
    : null;
  const publicEvidenceManifest = buildPublicEvidenceManifest({
    generatedAt: retrievedAt,
    retrievedAt,
    brent,
    wti,
    inventories,
    snapshot: publicSnapshot,
    steo: steoEvidence,
  });

  return createPublicMarketArchiveSnapshot({
    retrievedAt,
    prices: { brent, wti },
    inventories,
    publicSnapshot,
    publicEvidenceManifest,
    steo: steo
      ? {
          sourceUrl: 'https://www.eia.gov/outlooks/steo/',
          revisionFingerprint: steoFingerprint,
          seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
          nearTermPoint: steo,
        }
      : null,
  });
}

test('separates source observation revisions from same-window derived changes', () => {
  const baseline = buildState();
  const reference = buildState({
    retrievedAt: '2026-09-08T03:40:00.000Z',
    brent: [
      { period: '2026-08', value: 80.5, units: 'USD/bbl' },
      baseBrent[1],
    ],
  });

  const comparison = comparePublicSourceStates(baseline, reference);
  assert.equal(comparison.method, 'lastbarrel-public-source-state-comparison-v1');
  assert.deepEqual(comparison.sourceChangeSummary, {
    total: 1,
    added: 0,
    removed: 0,
    revised: 1,
    bySeries: {
      RBRTE: { total: 1, added: 0, removed: 0, revised: 1 },
      RWTC: { total: 0, added: 0, removed: 0, revised: 0 },
      WCESTUS1: { total: 0, added: 0, removed: 0, revised: 0 },
    },
  });
  assert.deepEqual(comparison.sourceChanges[0], {
    seriesId: 'RBRTE',
    period: '2026-08',
    kind: 'revised',
    baselineValue: 80,
    referenceValue: 80.5,
    delta: 0.5,
    baselineUnits: 'USD/bbl',
    referenceUnits: 'USD/bbl',
    classification: 'public-source-observation-change',
    baselineEvidenceId: 'eia:RBRTE:2026-08',
    referenceEvidenceId: 'eia:RBRTE:2026-08',
  });
  assert.equal(comparison.derived.brentWtiSpread.comparability, 'same-window');
  assert.equal(comparison.derived.brentWtiSpread.delta, 0.5);
  assert.equal(comparison.derived.brentWtiSpread.baselineEvidenceId, 'derived:brent-wti-spread:2026-08');
  assert.equal(comparison.steo.revisionIdentityChanged, false);
  assert.equal(comparison.steo.balanceDeltaMbpd, 0);
});

test('does not difference derived metrics when their observation windows shift', () => {
  const baseline = buildState();
  const reference = buildState({
    retrievedAt: '2026-09-14T03:40:00.000Z',
    brent: [{ period: '2026-09', value: 81, units: 'USD/bbl' }, ...baseBrent],
    wti: [{ period: '2026-09', value: 76.5, units: 'USD/bbl' }, ...baseWti],
    inventories: [
      { period: '2026-09-11', value: 407000, units: 'thousand barrels' },
      ...baseInventories,
    ],
  });

  const comparison = comparePublicSourceStates(baseline, reference);
  assert.equal(comparison.sourceChangeSummary.added, 3);
  assert.equal(comparison.derived.brentWtiSpread.comparability, 'window-shifted');
  assert.equal(comparison.derived.brentWtiSpread.delta, null);
  assert.equal(comparison.derived.inventoryChange.comparability, 'window-shifted');
  assert.equal(comparison.derived.inventoryChange.delta, null);
  assert.ok(comparison.limitations.some((item) => item.includes('shifted windows')));
});

test('reports a same-period STEO revision as forecast evidence rather than an actual', () => {
  const baseline = buildState();
  const revisedSteo: SteoBalancePoint = {
    period: '2026-09',
    supplyMbpd: 105.32,
    demandMbpd: 104.21,
    balanceMbpd: 1.11,
    classification: 'forecast',
  };
  const reference = buildState({
    retrievedAt: '2026-09-10T03:40:00.000Z',
    steo: revisedSteo,
    steoFingerprint: 'b'.repeat(64),
  });

  const comparison = comparePublicSourceStates(baseline, reference);
  assert.equal(comparison.steo.comparability, 'same-period');
  assert.equal(comparison.steo.revisionIdentityChanged, true);
  assert.equal(comparison.steo.supplyDeltaMbpd, 0.2);
  assert.equal(comparison.steo.demandDeltaMbpd, 0.1);
  assert.equal(comparison.steo.balanceDeltaMbpd, 0.1);
  assert.equal(comparison.steo.classification, 'forecast-source-state-comparison');
  assert.equal(comparison.derived.nearTermBalance.comparability, 'same-window');
  assert.equal(comparison.derived.nearTermBalance.delta, 0.1);
  assert.ok(comparison.limitations.some((item) => item.includes('not observed physical-flow truth')));
});

test('surfaces removed observations and added or removed STEO evidence explicitly', () => {
  const baseline = buildState();
  const reference = buildState({
    retrievedAt: '2026-09-08T03:40:00.000Z',
    brent: [baseBrent[0]],
    steo: null,
  });

  const comparison = comparePublicSourceStates(baseline, reference);
  assert.equal(comparison.sourceChangeSummary.removed, 1);
  assert.equal(comparison.sourceChanges[0].kind, 'removed');
  assert.equal(comparison.sourceChanges[0].period, '2026-07');
  assert.equal(comparison.steo.comparability, 'removed');
  assert.equal(comparison.steo.referenceRevisionFingerprint, null);
  assert.equal(comparison.derived.nearTermBalance.comparability, 'removed');
});

test('rejects identical source states and reverse chronology', () => {
  const baseline = buildState();
  const sameSourceLater = buildState({ retrievedAt: '2026-09-08T03:40:00.000Z' });
  assert.equal(baseline.sourceFingerprint, sameSourceLater.sourceFingerprint);
  assert.throws(() => comparePublicSourceStates(baseline, sameSourceLater), /identical public source-state fingerprints/);

  const changedEarlier = buildState({
    retrievedAt: '2026-09-06T03:40:00.000Z',
    brent: [{ period: '2026-08', value: 80.5, units: 'USD/bbl' }, baseBrent[1]],
  });
  assert.throws(() => comparePublicSourceStates(baseline, changedEarlier), /must be retrieved after baseline/);
});

test('latest comparison requires two states and selects the latest chronological pair', () => {
  const first = buildState({ retrievedAt: '2026-09-01T03:40:00.000Z' });
  assert.throws(() => compareLatestPublicSourceStates([first]), /At least two distinct archived public source states/);

  const second = buildState({
    retrievedAt: '2026-09-08T03:40:00.000Z',
    brent: [{ period: '2026-08', value: 80.5, units: 'USD/bbl' }, baseBrent[1]],
  });
  const third = buildState({
    retrievedAt: '2026-09-15T03:40:00.000Z',
    brent: [{ period: '2026-08', value: 81, units: 'USD/bbl' }, baseBrent[1]],
  });
  const comparison = compareLatestPublicSourceStates([third, first, second]);
  assert.equal(comparison.baseline.sourceFingerprint, second.sourceFingerprint);
  assert.equal(comparison.reference.sourceFingerprint, third.sourceFingerprint);
  assert.equal(comparison.sourceChanges[0].delta, 0.5);
});
