import path from 'node:path';
import { getOfficialSteoArchiveEntries } from '../lib/steo-official-archive-manifest';
import { writeOfficialSteoSourceArtifact } from '../lib/steo-official-source-artifact';
import { writeVerifiedOfficialSteoVintage } from '../lib/steo-official-vintage-integrity';
import { fetchOfficialSteoVintageWithSource } from '../lib/steo-official-vintage-xlsx';

async function main() {
  const [yearArg, directoryArg, sourceDirectoryArg] = process.argv.slice(2);
  const year = yearArg || '2026';
  if (!/^\d{4}$/.test(year)) throw new Error('STEO archive year must use YYYY');
  const directory = path.resolve(process.cwd(), directoryArg || 'data/steo-official-vintages');
  const sourceDirectory = path.resolve(process.cwd(), sourceDirectoryArg || 'data/steo-official-source-artifacts');
  const entries = getOfficialSteoArchiveEntries(year);
  if (!entries.length) throw new Error(`No official STEO archive entries are configured for ${year}`);

  const importedAt = new Date().toISOString();
  const results = [];
  for (const entry of entries) {
    const fetched = await fetchOfficialSteoVintageWithSource(entry, importedAt);
    const vintage = fetched.vintage;
    const rawSource = writeOfficialSteoSourceArtifact(
      {
        issue: vintage.issue,
        sourceArtifactUrl: vintage.sourceArtifactUrl,
        retrievedAt: importedAt,
        bytes: fetched.sourceBytes,
      },
      sourceDirectory,
    );
    if (rawSource.manifest.sourceArtifactSha256 !== vintage.sourceArtifactSha256) {
      throw new Error(`Raw workbook digest does not match normalized vintage digest for ${vintage.issue}`);
    }

    const stored = writeVerifiedOfficialSteoVintage(vintage, directory);
    results.push({
      issue: vintage.issue,
      releaseDate: vintage.releaseDate,
      modelingCompletedDate: vintage.modelingCompletedDate,
      historicalThroughPeriod: vintage.historicalThroughPeriod,
      sourceArtifactUrl: vintage.sourceArtifactUrl,
      sourceArtifactSha256: vintage.sourceArtifactSha256,
      sourceArtifactByteLength: rawSource.manifest.byteLength,
      rawSourceStatus: rawSource.created ? 'retained-new-raw-source-artifact' : 'raw-source-artifact-already-present-and-verified',
      rawSourceWorkbookPath: rawSource.workbookPath,
      rawSourceManifestPath: rawSource.manifestPath,
      revisionFingerprint: vintage.revisionFingerprint,
      historicalPeriods: vintage.historical.length,
      forecastPeriods: vintage.forecast.length,
      status: stored.created ? 'imported-new-source-artifact' : 'source-artifact-already-present-and-normalization-verified',
      path: stored.path,
    });
  }

  console.log(JSON.stringify({
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive',
    year,
    importedAt,
    archiveDirectory: directory,
    rawSourceArchiveDirectory: sourceDirectory,
    evidenceBoundary: 'Historical-labelled workbook values are public EIA estimates, not observed physical cargo or proprietary flow truth.',
    vintages: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
