import path from 'node:path';
import { getOfficialSteoArchiveEntries } from '../lib/steo-official-archive-manifest';
import { writeOfficialSteoVintage } from '../lib/steo-official-vintage';
import { fetchOfficialSteoVintage } from '../lib/steo-official-vintage-xlsx';

async function main() {
  const [yearArg, directoryArg] = process.argv.slice(2);
  const year = yearArg || '2026';
  if (!/^\d{4}$/.test(year)) throw new Error('STEO archive year must use YYYY');
  const directory = path.resolve(process.cwd(), directoryArg || 'data/steo-official-vintages');
  const entries = getOfficialSteoArchiveEntries(year);
  if (!entries.length) throw new Error(`No official STEO archive entries are configured for ${year}`);

  const importedAt = new Date().toISOString();
  const results = [];
  for (const entry of entries) {
    const vintage = await fetchOfficialSteoVintage(entry, importedAt);
    const stored = writeOfficialSteoVintage(vintage, directory);
    results.push({
      issue: vintage.issue,
      releaseDate: vintage.releaseDate,
      modelingCompletedDate: vintage.modelingCompletedDate,
      historicalThroughPeriod: vintage.historicalThroughPeriod,
      sourceArtifactUrl: vintage.sourceArtifactUrl,
      sourceArtifactSha256: vintage.sourceArtifactSha256,
      revisionFingerprint: vintage.revisionFingerprint,
      historicalPeriods: vintage.historical.length,
      forecastPeriods: vintage.forecast.length,
      status: stored.created ? 'imported-new-source-artifact' : 'source-artifact-already-present',
      path: stored.path,
    });
  }

  console.log(JSON.stringify({
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive',
    year,
    importedAt,
    archiveDirectory: directory,
    evidenceBoundary: 'Historical-labelled workbook values are public EIA estimates, not observed physical cargo or proprietary flow truth.',
    vintages: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
