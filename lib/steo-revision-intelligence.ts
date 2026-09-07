import {
  backtestSteoComparableVintages,
  type ContinuingForecastComparison,
  type LaterVintageEstimateComparison,
  type SteoLaterEstimateMetrics,
} from './steo-backtest';
import { assertOfficialSteoVintage, type OfficialSteoVintage } from './steo-official-vintage';

export type RankedSteoRevision = {
  period: string;
  classification: 'forecast-revision' | 'later-vintage-public-estimate-difference';
  deltaSupplyMbpd: number;
  deltaDemandMbpd: number;
  deltaBalanceMbpd: number;
  absoluteBalanceDeltaMbpd: number;
};

export type SteoRevisionWindow = {
  baselineIssue: string;
  referenceIssue: string;
  baselineReleaseDate: string;
  referenceReleaseDate: string;
  continuingForecastPeriods: number;
  maturedPeriods: number;
  missingReferencePeriods: string[];
  metrics: SteoLaterEstimateMetrics | null;
  largestForecastBalanceRevisions: RankedSteoRevision[];
  largestLaterEstimateBalanceDifferences: RankedSteoRevision[];
};

export type SteoRevisionIntelligence = {
  source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive';
  method: 'official-vintage-right-minus-left-descriptive-revision-v1';
  unit: 'million barrels per day';
  archive: {
    vintageCount: number;
    firstIssue: string;
    latestIssue: string;
    firstReleaseDate: string;
    latestReleaseDate: string;
  };
  latestRevision: SteoRevisionWindow;
  archiveSpan: SteoRevisionWindow;
  limitations: string[];
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function rankedForecast(point: ContinuingForecastComparison): RankedSteoRevision {
  return {
    period: point.period,
    classification: 'forecast-revision',
    deltaSupplyMbpd: point.deltaSupplyMbpd,
    deltaDemandMbpd: point.deltaDemandMbpd,
    deltaBalanceMbpd: point.deltaBalanceMbpd,
    absoluteBalanceDeltaMbpd: round(Math.abs(point.deltaBalanceMbpd)),
  };
}

function rankedLaterEstimate(point: LaterVintageEstimateComparison): RankedSteoRevision {
  return {
    period: point.period,
    classification: 'later-vintage-public-estimate-difference',
    deltaSupplyMbpd: point.deltaSupplyMbpd,
    deltaDemandMbpd: point.deltaDemandMbpd,
    deltaBalanceMbpd: point.deltaBalanceMbpd,
    absoluteBalanceDeltaMbpd: point.absoluteDeltaBalanceMbpd,
  };
}

function byAbsoluteBalanceThenPeriod(a: RankedSteoRevision, b: RankedSteoRevision) {
  return b.absoluteBalanceDeltaMbpd - a.absoluteBalanceDeltaMbpd || a.period.localeCompare(b.period);
}

function comparable(vintage: OfficialSteoVintage) {
  return {
    vintageId: `official:${vintage.issue}:${vintage.sourceArtifactSha256}`,
    vintageDate: vintage.releaseDate,
    revisionFingerprint: vintage.revisionFingerprint,
    revisionBasis: vintage.revisionBasis,
    forecast: vintage.forecast,
  };
}

function window(baseline: OfficialSteoVintage, reference: OfficialSteoVintage): SteoRevisionWindow {
  const report = backtestSteoComparableVintages(comparable(baseline), comparable(reference));
  return {
    baselineIssue: baseline.issue,
    referenceIssue: reference.issue,
    baselineReleaseDate: baseline.releaseDate,
    referenceReleaseDate: reference.releaseDate,
    continuingForecastPeriods: report.continuingForecastComparisons.length,
    maturedPeriods: report.laterEstimateComparisons.length,
    missingReferencePeriods: report.missingReferencePeriods,
    metrics: report.metrics,
    largestForecastBalanceRevisions: report.continuingForecastComparisons
      .map(rankedForecast)
      .sort(byAbsoluteBalanceThenPeriod)
      .slice(0, 5),
    largestLaterEstimateBalanceDifferences: report.laterEstimateComparisons
      .map(rankedLaterEstimate)
      .sort(byAbsoluteBalanceThenPeriod)
      .slice(0, 5),
  };
}

export function buildSteoRevisionIntelligence(vintagesInput: OfficialSteoVintage[]): SteoRevisionIntelligence {
  if (!Array.isArray(vintagesInput) || vintagesInput.length < 2) {
    throw new Error('STEO revision intelligence requires at least two official vintages');
  }

  const vintages = vintagesInput
    .map((vintage) => assertOfficialSteoVintage(vintage))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.issue.localeCompare(b.issue));

  const issues = vintages.map((vintage) => vintage.issue);
  if (new Set(issues).size !== issues.length) {
    throw new Error('STEO revision intelligence requires unique official issue identities');
  }

  const first = vintages[0];
  const latest = vintages[vintages.length - 1];
  const previous = vintages[vintages.length - 2];

  return {
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive',
    method: 'official-vintage-right-minus-left-descriptive-revision-v1',
    unit: 'million barrels per day',
    archive: {
      vintageCount: vintages.length,
      firstIssue: first.issue,
      latestIssue: latest.issue,
      firstReleaseDate: first.releaseDate,
      latestReleaseDate: latest.releaseDate,
    },
    latestRevision: window(previous, latest),
    archiveSpan: window(first, latest),
    limitations: [
      'All deltas are later-vintage minus earlier-vintage descriptive changes; they do not establish causal market drivers.',
      'Later-vintage historical-labelled EIA values are public estimates, not observed cargo flows, audited final actuals or proprietary physical data.',
      'Ranking by absolute balance revision is an analyst prioritisation aid, not a confidence score or forecast-accuracy grade.',
      'The analysis only covers official STEO vintages committed to the repository archive.',
    ],
  };
}
