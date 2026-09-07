import {
  assertPublicMarketArchiveSnapshot,
  type PublicMarketArchiveSnapshot,
} from './public-market-snapshot-store';
import type { PublicSeriesObservation } from './public-market-snapshot';

export type PublicSeriesId = 'RBRTE' | 'RWTC' | 'WCESTUS1';
export type PublicSourceChangeKind = 'added' | 'removed' | 'revised';

export type PublicSourceObservationChange = {
  seriesId: PublicSeriesId;
  period: string;
  kind: PublicSourceChangeKind;
  baselineValue: number | null;
  referenceValue: number | null;
  delta: number | null;
  baselineUnits: string | null;
  referenceUnits: string | null;
  classification: 'public-source-observation-change';
  baselineEvidenceId: string | null;
  referenceEvidenceId: string | null;
};

export type DerivedMetricComparison<T> = {
  metric: string;
  comparability: 'same-window' | 'window-shifted' | 'added' | 'removed' | 'unavailable-both';
  baseline: T | null;
  reference: T | null;
  delta: number | null;
  baselineEvidenceId: string | null;
  referenceEvidenceId: string | null;
  classification: 'derived-public-comparison';
};

export type SteoSourceStateComparison = {
  comparability: 'same-period' | 'period-shifted' | 'added' | 'removed' | 'unavailable-both';
  baselineRevisionFingerprint: string | null;
  referenceRevisionFingerprint: string | null;
  revisionIdentityChanged: boolean | null;
  baselinePeriod: string | null;
  referencePeriod: string | null;
  supplyDeltaMbpd: number | null;
  demandDeltaMbpd: number | null;
  balanceDeltaMbpd: number | null;
  classification: 'forecast-source-state-comparison';
};

export type PublicSourceStateComparison = {
  method: 'lastbarrel-public-source-state-comparison-v1';
  baseline: {
    sourceFingerprint: string;
    retrievedAt: string;
  };
  reference: {
    sourceFingerprint: string;
    retrievedAt: string;
  };
  chronology: {
    elapsedMs: number;
    referenceIsLater: true;
  };
  sourceChanges: PublicSourceObservationChange[];
  sourceChangeSummary: {
    total: number;
    added: number;
    removed: number;
    revised: number;
    bySeries: Record<PublicSeriesId, { total: number; added: number; removed: number; revised: number }>;
  };
  derived: {
    brentWtiSpread: DerivedMetricComparison<PublicMarketArchiveSnapshot['publicSnapshot']['brentWtiSpread']>;
    inventoryChange: DerivedMetricComparison<PublicMarketArchiveSnapshot['publicSnapshot']['inventoryChange']>;
    nearTermBalance: DerivedMetricComparison<PublicMarketArchiveSnapshot['publicSnapshot']['nearTermBalance']>;
  };
  steo: SteoSourceStateComparison;
  limitations: string[];
};

function round(value: number, decimals = 6) {
  return Number(value.toFixed(decimals));
}

function evidenceId(snapshot: PublicMarketArchiveSnapshot, metric: string): string | null {
  return snapshot.publicEvidenceManifest.derivations.find((item) => item.metric === metric)?.evidenceId ?? null;
}

function sourceEvidenceId(seriesId: PublicSeriesId, period: string) {
  return `eia:${seriesId}:${period}`;
}

function compareSeries(
  seriesId: PublicSeriesId,
  baseline: PublicSeriesObservation[],
  reference: PublicSeriesObservation[],
): PublicSourceObservationChange[] {
  const left = new Map(baseline.map((point) => [point.period, point] as const));
  const right = new Map(reference.map((point) => [point.period, point] as const));
  const periods = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes: PublicSourceObservationChange[] = [];

  for (const period of periods) {
    const baselinePoint = left.get(period);
    const referencePoint = right.get(period);
    if (!baselinePoint && referencePoint) {
      changes.push({
        seriesId,
        period,
        kind: 'added',
        baselineValue: null,
        referenceValue: referencePoint.value,
        delta: null,
        baselineUnits: null,
        referenceUnits: referencePoint.units ?? null,
        classification: 'public-source-observation-change',
        baselineEvidenceId: null,
        referenceEvidenceId: sourceEvidenceId(seriesId, period),
      });
      continue;
    }
    if (baselinePoint && !referencePoint) {
      changes.push({
        seriesId,
        period,
        kind: 'removed',
        baselineValue: baselinePoint.value,
        referenceValue: null,
        delta: null,
        baselineUnits: baselinePoint.units ?? null,
        referenceUnits: null,
        classification: 'public-source-observation-change',
        baselineEvidenceId: sourceEvidenceId(seriesId, period),
        referenceEvidenceId: null,
      });
      continue;
    }
    if (!baselinePoint || !referencePoint) continue;
    const baselineUnits = baselinePoint.units ?? null;
    const referenceUnits = referencePoint.units ?? null;
    if (baselinePoint.value === referencePoint.value && baselineUnits === referenceUnits) continue;
    changes.push({
      seriesId,
      period,
      kind: 'revised',
      baselineValue: baselinePoint.value,
      referenceValue: referencePoint.value,
      delta: round(referencePoint.value - baselinePoint.value),
      baselineUnits,
      referenceUnits,
      classification: 'public-source-observation-change',
      baselineEvidenceId: sourceEvidenceId(seriesId, period),
      referenceEvidenceId: sourceEvidenceId(seriesId, period),
    });
  }

  return changes;
}

function compareDerived<T>(input: {
  metric: string;
  baseline: T | null;
  reference: T | null;
  baselineWindow: string | null;
  referenceWindow: string | null;
  baselineValue: number | null;
  referenceValue: number | null;
  baselineEvidenceId: string | null;
  referenceEvidenceId: string | null;
}): DerivedMetricComparison<T> {
  let comparability: DerivedMetricComparison<T>['comparability'];
  let delta: number | null = null;

  if (!input.baseline && !input.reference) comparability = 'unavailable-both';
  else if (!input.baseline) comparability = 'added';
  else if (!input.reference) comparability = 'removed';
  else if (input.baselineWindow === input.referenceWindow) {
    comparability = 'same-window';
    if (input.baselineValue !== null && input.referenceValue !== null) {
      delta = round(input.referenceValue - input.baselineValue);
    }
  } else comparability = 'window-shifted';

  return {
    metric: input.metric,
    comparability,
    baseline: input.baseline,
    reference: input.reference,
    delta,
    baselineEvidenceId: input.baselineEvidenceId,
    referenceEvidenceId: input.referenceEvidenceId,
    classification: 'derived-public-comparison',
  };
}

function compareSteo(baseline: PublicMarketArchiveSnapshot, reference: PublicMarketArchiveSnapshot): SteoSourceStateComparison {
  const left = baseline.steo;
  const right = reference.steo;
  if (!left && !right) {
    return {
      comparability: 'unavailable-both',
      baselineRevisionFingerprint: null,
      referenceRevisionFingerprint: null,
      revisionIdentityChanged: null,
      baselinePeriod: null,
      referencePeriod: null,
      supplyDeltaMbpd: null,
      demandDeltaMbpd: null,
      balanceDeltaMbpd: null,
      classification: 'forecast-source-state-comparison',
    };
  }
  if (!left && right) {
    return {
      comparability: 'added',
      baselineRevisionFingerprint: null,
      referenceRevisionFingerprint: right.revisionFingerprint,
      revisionIdentityChanged: null,
      baselinePeriod: null,
      referencePeriod: right.nearTermPoint.period,
      supplyDeltaMbpd: null,
      demandDeltaMbpd: null,
      balanceDeltaMbpd: null,
      classification: 'forecast-source-state-comparison',
    };
  }
  if (left && !right) {
    return {
      comparability: 'removed',
      baselineRevisionFingerprint: left.revisionFingerprint,
      referenceRevisionFingerprint: null,
      revisionIdentityChanged: null,
      baselinePeriod: left.nearTermPoint.period,
      referencePeriod: null,
      supplyDeltaMbpd: null,
      demandDeltaMbpd: null,
      balanceDeltaMbpd: null,
      classification: 'forecast-source-state-comparison',
    };
  }
  if (!left || !right) throw new Error('unreachable STEO comparison state');

  const samePeriod = left.nearTermPoint.period === right.nearTermPoint.period;
  return {
    comparability: samePeriod ? 'same-period' : 'period-shifted',
    baselineRevisionFingerprint: left.revisionFingerprint,
    referenceRevisionFingerprint: right.revisionFingerprint,
    revisionIdentityChanged: left.revisionFingerprint !== right.revisionFingerprint,
    baselinePeriod: left.nearTermPoint.period,
    referencePeriod: right.nearTermPoint.period,
    supplyDeltaMbpd: samePeriod ? round(right.nearTermPoint.supplyMbpd - left.nearTermPoint.supplyMbpd) : null,
    demandDeltaMbpd: samePeriod ? round(right.nearTermPoint.demandMbpd - left.nearTermPoint.demandMbpd) : null,
    balanceDeltaMbpd: samePeriod ? round(right.nearTermPoint.balanceMbpd - left.nearTermPoint.balanceMbpd) : null,
    classification: 'forecast-source-state-comparison',
  };
}

function summarize(changes: PublicSourceObservationChange[]): PublicSourceStateComparison['sourceChangeSummary'] {
  const empty = () => ({ total: 0, added: 0, removed: 0, revised: 0 });
  const bySeries: PublicSourceStateComparison['sourceChangeSummary']['bySeries'] = {
    RBRTE: empty(),
    RWTC: empty(),
    WCESTUS1: empty(),
  };
  const summary = { total: 0, added: 0, removed: 0, revised: 0, bySeries };
  for (const change of changes) {
    summary.total += 1;
    summary[change.kind] += 1;
    const series = summary.bySeries[change.seriesId];
    series.total += 1;
    series[change.kind] += 1;
  }
  return summary;
}

export function comparePublicSourceStates(
  baseline: PublicMarketArchiveSnapshot,
  reference: PublicMarketArchiveSnapshot,
): PublicSourceStateComparison {
  assertPublicMarketArchiveSnapshot(baseline);
  assertPublicMarketArchiveSnapshot(reference);
  if (baseline.sourceFingerprint === reference.sourceFingerprint) {
    throw new Error('Cannot compare identical public source-state fingerprints');
  }
  const baselineTime = Date.parse(baseline.retrievedAt);
  const referenceTime = Date.parse(reference.retrievedAt);
  if (!(referenceTime > baselineTime)) {
    throw new Error('Reference public source state must be retrieved after baseline');
  }

  const sourceChanges = [
    ...compareSeries('RBRTE', baseline.prices.brent, reference.prices.brent),
    ...compareSeries('RWTC', baseline.prices.wti, reference.prices.wti),
    ...compareSeries('WCESTUS1', baseline.inventories, reference.inventories),
  ].sort((a, b) => a.seriesId.localeCompare(b.seriesId) || a.period.localeCompare(b.period));

  const baselineSpread = baseline.publicSnapshot.brentWtiSpread;
  const referenceSpread = reference.publicSnapshot.brentWtiSpread;
  const baselineInventory = baseline.publicSnapshot.inventoryChange;
  const referenceInventory = reference.publicSnapshot.inventoryChange;
  const baselineBalance = baseline.publicSnapshot.nearTermBalance;
  const referenceBalance = reference.publicSnapshot.nearTermBalance;

  return {
    method: 'lastbarrel-public-source-state-comparison-v1',
    baseline: { sourceFingerprint: baseline.sourceFingerprint, retrievedAt: baseline.retrievedAt },
    reference: { sourceFingerprint: reference.sourceFingerprint, retrievedAt: reference.retrievedAt },
    chronology: { elapsedMs: referenceTime - baselineTime, referenceIsLater: true },
    sourceChanges,
    sourceChangeSummary: summarize(sourceChanges),
    derived: {
      brentWtiSpread: compareDerived({
        metric: 'Brent-WTI spread',
        baseline: baselineSpread,
        reference: referenceSpread,
        baselineWindow: baselineSpread?.period ?? null,
        referenceWindow: referenceSpread?.period ?? null,
        baselineValue: baselineSpread?.spreadUsdBbl ?? null,
        referenceValue: referenceSpread?.spreadUsdBbl ?? null,
        baselineEvidenceId: evidenceId(baseline, 'Brent-WTI spread'),
        referenceEvidenceId: evidenceId(reference, 'Brent-WTI spread'),
      }),
      inventoryChange: compareDerived({
        metric: 'U.S. crude inventory change',
        baseline: baselineInventory,
        reference: referenceInventory,
        baselineWindow: baselineInventory ? `${baselineInventory.previousPeriod}->${baselineInventory.latestPeriod}` : null,
        referenceWindow: referenceInventory ? `${referenceInventory.previousPeriod}->${referenceInventory.latestPeriod}` : null,
        baselineValue: baselineInventory?.deltaThousandBarrels ?? null,
        referenceValue: referenceInventory?.deltaThousandBarrels ?? null,
        baselineEvidenceId: evidenceId(baseline, 'U.S. crude inventory change'),
        referenceEvidenceId: evidenceId(reference, 'U.S. crude inventory change'),
      }),
      nearTermBalance: compareDerived({
        metric: 'Near-term implied world balance',
        baseline: baselineBalance,
        reference: referenceBalance,
        baselineWindow: baselineBalance?.period ?? null,
        referenceWindow: referenceBalance?.period ?? null,
        baselineValue: baselineBalance?.balanceMbpd ?? null,
        referenceValue: referenceBalance?.balanceMbpd ?? null,
        baselineEvidenceId: evidenceId(baseline, 'Near-term implied world balance'),
        referenceEvidenceId: evidenceId(reference, 'Near-term implied world balance'),
      }),
    },
    steo: compareSteo(baseline, reference),
    limitations: [
      'This comparison describes differences between two preserved public EIA retrieval states; it does not identify market causality.',
      'Public historical observations may themselves be revised by EIA; a changed archived value is a source revision, not proof that an earlier physical observation was false.',
      'Derived metric deltas are only calculated when the underlying comparison window is identical; shifted windows are labelled and not differenced.',
      'STEO values remain forecasts or public estimates as labelled and are not observed physical-flow truth.',
      'No cargo, vessel, freight, commitment, proprietary flow, trading recommendation or bullish/bearish score is inferred.',
    ],
  };
}

export function compareLatestPublicSourceStates(archive: PublicMarketArchiveSnapshot[]): PublicSourceStateComparison {
  const ordered = [...archive].sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt));
  if (ordered.length < 2) throw new Error('At least two distinct archived public source states are required for comparison');
  const baseline = ordered.at(-2);
  const reference = ordered.at(-1);
  if (!baseline || !reference) throw new Error('Unable to select latest archived public source states');
  return comparePublicSourceStates(baseline, reference);
}
