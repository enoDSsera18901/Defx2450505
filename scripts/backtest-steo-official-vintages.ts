import path from 'node:path';
import { backtestSteoComparableVintages, type SteoComparableVintage } from '../lib/steo-backtest';
import { listOfficialSteoVintages, type OfficialSteoVintage } from '../lib/steo-official-vintage';

function comparableVintage(vintage: OfficialSteoVintage): SteoComparableVintage {
  return {
    vintageId: `official-xlsx:${vintage.sourceArtifactSha256}`,
    vintageDate: vintage.releaseDate,
    revisionFingerprint: vintage.revisionFingerprint,
    revisionBasis: vintage.revisionBasis,
    forecast: vintage.forecast,
  };
}

function findVintage(
  vintages: OfficialSteoVintage[],
  selector: string | undefined,
  fallback: OfficialSteoVintage,
  label: string,
) {
  if (!selector) return fallback;
  const matches = vintages.filter((vintage) =>
    vintage.issue === selector
    || vintage.sourceArtifactSha256 === selector
    || vintage.sourceArtifactName === selector,
  );
  if (!matches.length) throw new Error(`Official STEO ${label} vintage not found: ${selector}`);
  if (matches.length > 1) {
    throw new Error(`Official STEO ${label} selector is ambiguous; use the full source artifact SHA-256: ${selector}`);
  }
  return matches[0];
}

function main() {
  const [baselineSelector, referenceSelector, directoryArg] = process.argv.slice(2);
  const directory = path.resolve(process.cwd(), directoryArg || 'data/steo-official-vintages');
  const vintages = listOfficialSteoVintages(directory);
  if (vintages.length < 2) {
    throw new Error(`Official STEO backtest requires at least two archived vintages; found ${vintages.length} in ${directory}`);
  }

  const baseline = findVintage(vintages, baselineSelector, vintages[0], 'baseline');
  const reference = findVintage(vintages, referenceSelector, vintages[vintages.length - 1], 'reference');
  const report = backtestSteoComparableVintages(comparableVintage(baseline), comparableVintage(reference));

  console.log(JSON.stringify({
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive',
    archiveDirectory: directory,
    archivedVintages: vintages.length,
    baselineSelection: baselineSelector ? 'explicit-issue-or-artifact' : 'earliest-release',
    referenceSelection: referenceSelector ? 'explicit-issue-or-artifact' : 'latest-release',
    baseline: {
      issue: baseline.issue,
      releaseDate: baseline.releaseDate,
      sourceArtifactName: baseline.sourceArtifactName,
      sourceArtifactSha256: baseline.sourceArtifactSha256,
      historicalThroughPeriod: baseline.historicalThroughPeriod,
    },
    reference: {
      issue: reference.issue,
      releaseDate: reference.releaseDate,
      sourceArtifactName: reference.sourceArtifactName,
      sourceArtifactSha256: reference.sourceArtifactSha256,
      historicalThroughPeriod: reference.historicalThroughPeriod,
    },
    evidenceBoundary: 'Later-vintage historical-labelled values are public EIA estimates, not observed cargo, vessel, freight, proprietary flow data, or final actuals.',
    ...report,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
