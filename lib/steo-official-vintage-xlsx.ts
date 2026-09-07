import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readSheet } from 'read-excel-file/node';
import type { OfficialSteoArchiveEntry } from './steo-official-archive-manifest';
import {
  buildOfficialSteoWorkbookLineage,
  inspectOfficialSteoWorkbookStructure,
  type OfficialSteoWorkbookLineage,
} from './steo-official-xlsx-structure';
import { parseOfficialSteoVintage, type OfficialSteoVintage } from './steo-official-vintage';

const MAX_OFFICIAL_STEO_XLSX_BYTES = 15 * 1024 * 1024;
const OFFICIAL_ARCHIVE_URL = /^https:\/\/www\.eia\.gov\/outlooks\/steo\/archives\/[a-z]{3}\d{2}_base\.xlsx$/;

export type FetchedOfficialSteoVintage = {
  vintage: OfficialSteoVintage;
  sourceBytes: Buffer;
  lineage: OfficialSteoWorkbookLineage;
};

type ParsedOfficialSteoWorkbook = {
  vintage: OfficialSteoVintage;
  lineage: OfficialSteoWorkbookLineage;
};

function assertOfficialArchiveUrl(url: string) {
  if (!OFFICIAL_ARCHIVE_URL.test(url)) throw new Error('Refusing non-canonical official EIA STEO archive URL');
}

function assertXlsxBuffer(buffer: Buffer) {
  if (!buffer.length) throw new Error('Official EIA STEO archive workbook is empty');
  if (buffer.length > MAX_OFFICIAL_STEO_XLSX_BYTES) throw new Error('Official EIA STEO archive workbook exceeds the 15 MiB safety limit');
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Official EIA STEO archive response is not an XLSX/ZIP file');
}

async function parseWorkbookBuffer(
  buffer: Buffer,
  entry: OfficialSteoArchiveEntry,
  importedAt: string,
): Promise<ParsedOfficialSteoWorkbook> {
  assertXlsxBuffer(buffer);

  // Inspect the central directory and the exact workbook/worksheet relationship graph before
  // handing the archive to the higher-level worksheet decoder. This bounds decompression risk
  // and establishes which XML parts are authoritative for Dates and 3atab.
  const structure = await inspectOfficialSteoWorkbookStructure(buffer);
  const sourceArtifactSha256 = createHash('sha256').update(buffer).digest('hex');
  const [datesRows, balanceRows] = await Promise.all([
    readSheet(buffer, 'Dates'),
    readSheet(buffer, '3atab'),
  ]);

  // Existing semantic validation remains the authority for source period alignment,
  // classifications, duplicate-series consistency and normalized calculations.
  const vintage = parseOfficialSteoVintage({
    datesRows,
    balanceRows,
    issue: entry.issue,
    releaseDate: entry.releaseDate,
    importedAt,
    sourceArtifactUrl: entry.sourceArtifactUrl,
    sourceArtifactSha256,
  });

  // Bind the semantically accepted values back to exact workbook coordinates. Formula-backed
  // or non-numeric mapped evidence cells fail here even if a library exposes a cached value.
  const lineage = buildOfficialSteoWorkbookLineage(structure, vintage);
  return { vintage, lineage };
}

export async function fetchOfficialSteoVintageWithSource(
  entry: OfficialSteoArchiveEntry,
  importedAt = new Date().toISOString(),
): Promise<FetchedOfficialSteoVintage> {
  assertOfficialArchiveUrl(entry.sourceArtifactUrl);
  const response = await fetch(entry.sourceArtifactUrl, {
    headers: { 'user-agent': 'LastBarrel/0.1 public-EIA-vintage-import' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Official EIA STEO archive returned ${response.status} for ${entry.issue}`);
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OFFICIAL_STEO_XLSX_BYTES) {
    throw new Error('Official EIA STEO archive workbook exceeds the 15 MiB safety limit');
  }
  const sourceBytes = Buffer.from(await response.arrayBuffer());
  const parsed = await parseWorkbookBuffer(sourceBytes, entry, importedAt);
  return { ...parsed, sourceBytes };
}

export async function fetchOfficialSteoVintage(
  entry: OfficialSteoArchiveEntry,
  importedAt = new Date().toISOString(),
): Promise<OfficialSteoVintage> {
  return (await fetchOfficialSteoVintageWithSource(entry, importedAt)).vintage;
}

export async function readOfficialSteoVintageWorkbook(
  filePath: string,
  entry: OfficialSteoArchiveEntry,
  importedAt = new Date().toISOString(),
): Promise<OfficialSteoVintage> {
  assertOfficialArchiveUrl(entry.sourceArtifactUrl);
  const buffer = await readFile(filePath);
  return (await parseWorkbookBuffer(buffer, entry, importedAt)).vintage;
}
