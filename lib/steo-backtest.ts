import { assertSteoSnapshot, type SteoSnapshot } from './steo-snapshot-store';
import { fingerprintSteoForecast, type ComparableSteoPoint } from './steo-revision';

export type LaterVintageEstimateComparison = {
  period: string;
  forecast: ComparableSteoPoint;
  reference: ComparableSteoPoint;
  referenceClassification: 'later-vintage-public-estimate';
  deltaSupplyMbpd: number;
  deltaDemandMbpd: number;
  deltaBalanceMbpd: number;
  absoluteDeltaSupplyMbpd: number;
  absoluteDeltaDemandMbpd: number;
  absoluteDeltaBalanceMbpd: number;
};

export type ContinuingForecastComparison = {
  period: string;
  previousForecast: ComparableSteoPoint;
  laterForecast: ComparableSteoPoint;
  classification: 'forecast-revision';
  deltaSupplyMbpd: number;
  deltaDemandMbpd: number;
  deltaBalanceMbpd: number;
};

export type SteoLaterEstimateMetrics = {
  periods: number;
  meanDeltaSupplyMbpd: number;
  meanDeltaDemandMbpd: number;
  meanDeltaBalanceMbpd: number;
  meanAbsoluteDeltaSupplyMbpd: number;
  meanAbsoluteDeltaDemandMbpd: number;
  meanAbsoluteDeltaBalanceMbpd: number;
};

export type SteoComparableVintage = {
  vintageId: string;
  vintageDate: string;
  revisionFingerprint: string;
  revisionBasis: ComparableSteoPoint[];
  forecast: Array<ComparableSteoPoint & { classification: 'forecast' }>;
};

export type SteoVintageBacktest = {
  method: 'forecast-vs-later-vintage-public-estimate';
  baselineVintageId: string;
  referenceVintageId: string;
  baselineVintageDate: string;
  referenceVintageDate: string;
  baselineFingerprint: string;
  referenceFingerprint: string;
  laterEstimateComparisons: LaterVintageEstimateComparison[];
  continuingForecastComparisons: ContinuingForecastComparison[];
  missingReferencePeriods: string[];
  metrics: SteoLaterEstimateMetrics | null;
  limitations: string[];
};

export type SteoSnapshotBacktest = SteoVintageBacktest & {
  baselineRetrievedAt: string;
  referenceRetrievedAt: string;
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function delta(reference: number, baseline: number) {
  return round(reference - baseline);
}

function average(values: number[]) {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function pointWithoutClassification(point: ComparableSteoPoint): ComparableSteoPoint {
  return {
    period: point.period,
    supplyMbpd: point.supplyMbpd,
    demandMbpd: point.demandMbpd,
    balanceMbpd: point.balanceMbpd,
  };
}

function samePoint(a: ComparableSteoPoint, b: ComparableSteoPoint) {
  return a.period === b.period && a.supplyMbpd === b.supplyMbpd && a.demandMbpd === b.demandMbpd && a.balanceMbpd === b.balanceMbpd;
}

function assertComparableVintage(vintage: SteoComparableVintage, label: string) {
  if (!vintage.vintageId?.trim()) throw new Error(`${label} STEO vintage must have a stable vintageId`);
  if (Number.isNaN(Date.parse(vintage.vintageDate))) throw new Error(`${label} STEO vintageDate must be date-compatible`);
  if (!Array.isArray(vintage.revisionBasis) || !vintage.revisionBasis.length) throw new Error(`${label} STEO vintage has no revisionBasis`);
  if (!Array.isArray(vintage.forecast) || !vintage.forecast.length) throw new Error(`${label} STEO vintage has no forecast periods`);
  if (fingerprintSteoForecast(vintage.revisionBasis) !== vintage.revisionFingerprint) {
    throw new Error(`${label} STEO revisionFingerprint does not match revisionBasis`);
  }
  const basisByPeriod = new Map(vintage.revisionBasis.map((point) => [point.period, point]));
  for (const point of vintage.forecast) {
    if (point.classification !== 'forecast') throw new Error(`${label} STEO forward point ${point.period} is not labelled forecast`);
    const basis = basisByPeriod.get(point.period);
    if (!basis || !samePoint(point, basis)) throw new Error(`${label} STEO forecast period ${point.period} does not match revisionBasis`);
  }
  return vintage;
}

function laterEstimateComparison(
  forecast: ComparableSteoPoint,
  reference: ComparableSteoPoint,
): LaterVintageEstimateComparison {
  const deltaSupplyMbpd = delta(reference.supplyMbpd, forecast.supplyMbpd);
  const deltaDemandMbpd = delta(reference.demandMbpd, forecast.demandMbpd);
  const deltaBalanceMbpd = delta(reference.balanceMbpd, forecast.balanceMbpd);

  return {
    period: forecast.period,
    forecast: pointWithoutClassification(forecast),
    reference: pointWithoutClassification(reference),
    referenceClassification: 'later-vintage-public-estimate',
    deltaSupplyMbpd,
    deltaDemandMbpd,
    deltaBalanceMbpd,
    absoluteDeltaSupplyMbpd: round(Math.abs(deltaSupplyMbpd)),
    absoluteDeltaDemandMbpd: round(Math.abs(deltaDemandMbpd)),
    absoluteDeltaBalanceMbpd: round(Math.abs(deltaBalanceMbpd)),
  };
}

function continuingForecastComparison(
  previousForecast: ComparableSteoPoint,
  laterForecast: ComparableSteoPoint,
): ContinuingForecastComparison {
  return {
    period: previousForecast.period,
    previousForecast: pointWithoutClassification(previousForecast),
    laterForecast: pointWithoutClassification(laterForecast),
    classification: 'forecast-revision',
    deltaSupplyMbpd: delta(laterForecast.supplyMbpd, previousForecast.supplyMbpd),
    deltaDemandMbpd: delta(laterForecast.demandMbpd, previousForecast.demandMbpd),
    deltaBalanceMbpd: delta(laterForecast.balanceMbpd, previousForecast.balanceMbpd),
  };
}

function metrics(comparisons: LaterVintageEstimateComparison[]): SteoLaterEstimateMetrics | null {
  if (!comparisons.length) return null;

  return {
    periods: comparisons.length,
    meanDeltaSupplyMbpd: average(comparisons.map((point) => point.deltaSupplyMbpd)),
    meanDeltaDemandMbpd: average(comparisons.map((point) => point.deltaDemandMbpd)),
    meanDeltaBalanceMbpd: average(comparisons.map((point) => point.deltaBalanceMbpd)),
    meanAbsoluteDeltaSupplyMbpd: average(comparisons.map((point) => point.absoluteDeltaSupplyMbpd)),
    meanAbsoluteDeltaDemandMbpd: average(comparisons.map((point) => point.absoluteDeltaDemandMbpd)),
    meanAbsoluteDeltaBalanceMbpd: average(comparisons.map((point) => point.absoluteDeltaBalanceMbpd)),
  };
}

/**
 * Compare two truth-labelled public STEO vintages.
 *
 * `vintageDate` is deliberately source-specific: a live API snapshot uses its
 * retrieval timestamp, while an official archive workbook uses the EIA release
 * date. `vintageId` identifies the captured source artifact/revision and is kept
 * separate from the paired-value revision fingerprint.
 */
export function backtestSteoComparableVintages(
  baselineInput: SteoComparableVintage,
  referenceInput: SteoComparableVintage,
): SteoVintageBacktest {
  const baseline = assertComparableVintage(baselineInput, 'baseline');
  const reference = assertComparableVintage(referenceInput, 'reference');
  const baselineTime = Date.parse(baseline.vintageDate);
  const referenceTime = Date.parse(reference.vintageDate);

  if (referenceTime <= baselineTime) throw new Error('STEO backtest reference vintage must be later than the baseline vintage');
  if (reference.vintageId === baseline.vintageId) throw new Error('STEO backtest requires two distinct source vintages');

  const referenceForecastByPeriod = new Map(reference.forecast.map((point) => [point.period, point]));
  const referenceBasisByPeriod = new Map(reference.revisionBasis.map((point) => [point.period, point]));
  const laterEstimateComparisons: LaterVintageEstimateComparison[] = [];
  const continuingForecastComparisons: ContinuingForecastComparison[] = [];
  const missingReferencePeriods: string[] = [];

  for (const forecast of [...baseline.forecast].sort((a, b) => a.period.localeCompare(b.period))) {
    const laterForecast = referenceForecastByPeriod.get(forecast.period);
    if (laterForecast) {
      continuingForecastComparisons.push(continuingForecastComparison(forecast, laterForecast));
      continue;
    }

    const laterReference = referenceBasisByPeriod.get(forecast.period);
    if (laterReference) {
      laterEstimateComparisons.push(laterEstimateComparison(forecast, laterReference));
      continue;
    }

    missingReferencePeriods.push(forecast.period);
  }

  return {
    method: 'forecast-vs-later-vintage-public-estimate',
    baselineVintageId: baseline.vintageId,
    referenceVintageId: reference.vintageId,
    baselineVintageDate: baseline.vintageDate,
    referenceVintageDate: reference.vintageDate,
    baselineFingerprint: baseline.revisionFingerprint,
    referenceFingerprint: reference.revisionFingerprint,
    laterEstimateComparisons,
    continuingForecastComparisons,
    missingReferencePeriods,
    metrics: metrics(laterEstimateComparisons),
    limitations: [
      'Later-vintage EIA source values are public reference estimates, not observed physical flows or final actuals.',
      'The comparison is limited to the captured vintages and periods supplied; missing reference periods are reported explicitly.',
      'Forecast revisions and later-estimate differences are descriptive and do not establish causal market drivers.',
    ],
  };
}

export function backtestSteoVintages(
  baselineInput: SteoSnapshot,
  referenceInput: SteoSnapshot,
): SteoSnapshotBacktest {
  const baseline = assertSteoSnapshot(baselineInput);
  const reference = assertSteoSnapshot(referenceInput);
  const report = backtestSteoComparableVintages(
    {
      vintageId: `live-api:${baseline.revisionFingerprint}`,
      vintageDate: baseline.retrievedAt,
      revisionFingerprint: baseline.revisionFingerprint,
      revisionBasis: baseline.revisionBasis,
      forecast: baseline.forecast,
    },
    {
      vintageId: `live-api:${reference.revisionFingerprint}`,
      vintageDate: reference.retrievedAt,
      revisionFingerprint: reference.revisionFingerprint,
      revisionBasis: reference.revisionBasis,
      forecast: reference.forecast,
    },
  );
  return {
    ...report,
    baselineRetrievedAt: baseline.retrievedAt,
    referenceRetrievedAt: reference.retrievedAt,
  };
}
