import { assertSteoSnapshot, type SteoSnapshot } from './steo-snapshot-store';
import type { ComparableSteoPoint } from './steo-revision';

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

export type SteoVintageBacktest = {
  method: 'forecast-vs-later-vintage-public-estimate';
  baselineFingerprint: string;
  referenceFingerprint: string;
  baselineRetrievedAt: string;
  referenceRetrievedAt: string;
  laterEstimateComparisons: LaterVintageEstimateComparison[];
  continuingForecastComparisons: ContinuingForecastComparison[];
  missingReferencePeriods: string[];
  metrics: SteoLaterEstimateMetrics | null;
  limitations: string[];
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
 * Compare an archived forecast vintage with a later archived EIA source vintage.
 *
 * Periods that remain in the later forward subset are forecast revisions. Periods
 * that have left the later forward subset but remain in the later source response
 * window are compared against that later public EIA value. Those values are
 * deliberately labelled as later-vintage public estimates, never observed actuals.
 */
export function backtestSteoVintages(
  baselineInput: SteoSnapshot,
  referenceInput: SteoSnapshot,
): SteoVintageBacktest {
  const baseline = assertSteoSnapshot(baselineInput);
  const reference = assertSteoSnapshot(referenceInput);
  const baselineTime = Date.parse(baseline.retrievedAt);
  const referenceTime = Date.parse(reference.retrievedAt);

  if (referenceTime <= baselineTime) {
    throw new Error('STEO backtest reference snapshot must be later than the baseline snapshot');
  }
  if (reference.revisionFingerprint === baseline.revisionFingerprint) {
    throw new Error('STEO backtest requires two distinct archived source revisions');
  }

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
    baselineFingerprint: baseline.revisionFingerprint,
    referenceFingerprint: reference.revisionFingerprint,
    baselineRetrievedAt: baseline.retrievedAt,
    referenceRetrievedAt: reference.retrievedAt,
    laterEstimateComparisons,
    continuingForecastComparisons,
    missingReferencePeriods,
    metrics: metrics(laterEstimateComparisons),
    limitations: [
      'Later-vintage EIA source values are public reference estimates, not observed physical flows or final actuals.',
      'The comparison is limited to the archived vintages and periods supplied; missing reference periods are reported explicitly.',
      'Forecast revisions and later-estimate differences are descriptive and do not establish causal market drivers.',
    ],
  };
}
