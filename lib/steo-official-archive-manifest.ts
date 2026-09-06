export type OfficialSteoArchiveEntry = {
  issue: string;
  releaseDate: string;
  sourceArtifactUrl: string;
};

const ARCHIVE_ROOT = 'https://www.eia.gov/outlooks/steo/archives';

export const OFFICIAL_STEO_2026_ARCHIVE: OfficialSteoArchiveEntry[] = [
  { issue: '2026-01', releaseDate: '2026-01-13', sourceArtifactUrl: `${ARCHIVE_ROOT}/jan26_base.xlsx` },
  { issue: '2026-02', releaseDate: '2026-02-10', sourceArtifactUrl: `${ARCHIVE_ROOT}/feb26_base.xlsx` },
  { issue: '2026-03', releaseDate: '2026-03-10', sourceArtifactUrl: `${ARCHIVE_ROOT}/mar26_base.xlsx` },
  { issue: '2026-04', releaseDate: '2026-04-07', sourceArtifactUrl: `${ARCHIVE_ROOT}/apr26_base.xlsx` },
  { issue: '2026-05', releaseDate: '2026-05-12', sourceArtifactUrl: `${ARCHIVE_ROOT}/may26_base.xlsx` },
  { issue: '2026-06', releaseDate: '2026-06-09', sourceArtifactUrl: `${ARCHIVE_ROOT}/jun26_base.xlsx` },
  { issue: '2026-07', releaseDate: '2026-07-07', sourceArtifactUrl: `${ARCHIVE_ROOT}/jul26_base.xlsx` },
  { issue: '2026-08', releaseDate: '2026-08-11', sourceArtifactUrl: `${ARCHIVE_ROOT}/aug26_base.xlsx` },
];

export function getOfficialSteoArchiveEntries(year?: string) {
  if (!year) return [...OFFICIAL_STEO_2026_ARCHIVE];
  return OFFICIAL_STEO_2026_ARCHIVE.filter((entry) => entry.issue.startsWith(`${year}-`));
}
