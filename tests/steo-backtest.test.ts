import assert from 'node:assert/strict';
import test from 'node:test';
import { backtestSteoVintages } from '../lib/steo-backtest';
import { fingerprintSteoForecast, type ComparableSteoPoint } from '../lib/steo-revision';
import type { SteoSnapshot } from '../lib/steo-snapshot-store';

const SOURCE = 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook';
const SOURCE_URL = 'https://www.eia.gov/outlooks/steo/';
const REVISION_METHOD = 'sha256 of sorted paired PAPR_WORLD/PATC_WORLD source response window values';

function snapshot(
  retrievedAt: string,
  revisionBasis: ComparableSteoPoint[],
  forecastPeriods: string[],
): SteoSnapshot {
  const wanted = new Set(forecastPeriods);
  const forecast = revisionBasis
    .filter((point) => wanted.has(point.period))
    .map((point) => ({ ...point, classification: 'forecast' as const }));

  return {
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    retrievedAt,
    revisionFingerprint: fingerprintSteoForecast(revisionBasis),
    revisionMethod: REVISION_METHOD,
    revisionBasis,
    seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
    unit: 'million barrels per day',
    forecast,
  };
}

const baselineBasis: ComparableSteoPoint[] = [
  { period: '2026-09', supplyMbpd: 100, demandMbpd: 100, balanceMbpd: 0 },
  { period: '2026-10', supplyMbpd: 101, demandMbpd: 100, balanceMbpd: 1 },
  { period: '2026-11', supplyMbpd: 102, demandMbpd: 101, balanceMbpd: 1 },
  { period: '2026-12', supplyMbpd: 103, demandMbpd: 102, balanceMbpd: 1 },
];

test('compares matured forecast periods only to explicitly labelled later-vintage public estimates', () => {
  const baseline = snapshot('2026-09-07T01:00:00Z', baselineBasis, ['2026-10', '2026-11', '2026-12']);
  const laterBasis: ComparableSteoPoint[] = [
    { period: '2026-10', supplyMbpd: 101.5, demandMbpd: 100.2, balanceMbpd: 1.3 },
    { period: '2026-11', supplyMbpd: 101.8, demandMbpd: 101.1, balanceMbpd: 0.7 },
    { period: '2026-12', supplyMbpd: 103.2, demandMbpd: 102.4, balanceMbpd: 0.8 },
    { period: '2027-01', supplyMbpd: 104, demandMbpd: 103, balanceMbpd: 1 },
  ];
  const reference = snapshot('2027-01-10T01:00:00Z', laterBasis, ['2027-01']);

  const result = backtestSteoVintages(baseline, reference);

  assert.equal(result.method, 'forecast-vs-later-vintage-public-estimate');
  assert.equal(result.laterEstimateComparisons.length, 3);
  assert.equal(result.continuingForecastComparisons.length, 0);
  assert.equal(result.missingReferencePeriods.length, 0);
  assert.ok(result.laterEstimateComparisons.every((point) => point.referenceClassification === 'later-vintage-public-estimate'));
  assert.deepEqual(result.metrics, {
    periods: 3,
    meanDeltaSupplyMbpd: 0.1667,
    meanDeltaDemandMbpd: 0.2333,
    meanDeltaBalanceMbpd: -0.0667,
    meanAbsoluteDeltaSupplyMbpd: 0.3,
    meanAbsoluteDeltaDemandMbpd: 0.2333,
    meanAbsoluteDeltaBalanceMbpd: 0.2667,
  });
  assert.ok(result.limitations.some((text) => text.includes('not observed physical flows or final actuals')));
});

test('keeps a period classified as forecast revision while it remains forward in the later vintage', () => {
  const baseline = snapshot('2026-09-07T01:00:00Z', baselineBasis, ['2026-12']);
  const laterBasis: ComparableSteoPoint[] = [
    { period: '2026-12', supplyMbpd: 103.4, demandMbpd: 102.1, balanceMbpd: 1.3 },
    { period: '2027-01', supplyMbpd: 104, demandMbpd: 103, balanceMbpd: 1 },
  ];
  const reference = snapshot('2026-11-10T01:00:00Z', laterBasis, ['2026-12', '2027-01']);

  const result = backtestSteoVintages(baseline, reference);

  assert.equal(result.laterEstimateComparisons.length, 0);
  assert.equal(result.metrics, null);
  assert.deepEqual(result.continuingForecastComparisons[0], {
    period: '2026-12',
    previousForecast: baselineBasis[3],
    laterForecast: laterBasis[0],
    classification: 'forecast-revision',
    deltaSupplyMbpd: 0.4,
    deltaDemandMbpd: 0.1,
    deltaBalanceMbpd: 0.3,
  });
});

test('reports baseline periods that are absent from the later archived source window', () => {
  const baseline = snapshot('2026-09-07T01:00:00Z', baselineBasis, ['2026-10']);
  const laterBasis: ComparableSteoPoint[] = [
    { period: '2026-11', supplyMbpd: 102, demandMbpd: 101, balanceMbpd: 1 },
    { period: '2026-12', supplyMbpd: 103, demandMbpd: 102, balanceMbpd: 1 },
  ];
  const reference = snapshot('2026-12-10T01:00:00Z', laterBasis, ['2026-12']);

  const result = backtestSteoVintages(baseline, reference);
  assert.deepEqual(result.missingReferencePeriods, ['2026-10']);
  assert.equal(result.metrics, null);
});

test('rejects reverse chronology and same-revision pseudo backtests', () => {
  const baseline = snapshot('2026-09-07T01:00:00Z', baselineBasis, ['2026-10']);
  const laterSameRevision = { ...baseline, retrievedAt: '2026-09-08T01:00:00Z' };

  assert.throws(
    () => backtestSteoVintages(baseline, { ...baseline, retrievedAt: '2026-09-06T01:00:00Z' }),
    /reference snapshot must be later/,
  );
  assert.throws(
    () => backtestSteoVintages(baseline, laterSameRevision),
    /requires two distinct archived source revisions/,
  );
});
