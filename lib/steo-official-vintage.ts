import fs from 'node:fs';
import path from 'node:path';
import { fingerprintSteoForecast, type ComparableSteoPoint } from './steo-revision';

export const EIA_STEO_SOURCE = 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook';
export const EIA_STEO_SOURCE_PAGE = 'https://www.eia.gov/outlooks/steo/';
export const OFFICIAL_STEO_REVISION_METHOD =
  'sha256 of sorted paired PAPR_WORLD/PATC_WORLD values extracted from official archived STEO workbook';

const SUPPLY_SERIES = 'PAPR_WORLD';
const DEMAND_SERIES = 'PATC_WORLD';
const UNIT = 'million barrels per day';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const OFFICIAL_ARCHIVE_PATH_PATTERN = /^\/outlooks\/steo\/archives\/([a-z]{3})(\d{2})_base\.xlsx$/;

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

const MONTH_ABBREVIATIONS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export type OfficialSteoHistoricalPoint = ComparableSteoPoint & {
  classification: 'historical-public-estimate';
};

export type OfficialSteoForecastPoint = ComparableSteoPoint & {
  classification: 'forecast';
};

export type OfficialSteoVintage = {
  schemaVersion: 1;
  source: typeof EIA_STEO_SOURCE;
  sourceKind: 'eia-steo-official-archive-xlsx';
  sourcePageUrl: typeof EIA_STEO_SOURCE_PAGE;
  sourceArtifactUrl: string;
  sourceArtifactName: string;
  sourceArtifactSha256: string;
  issue: string;
  releaseDate: string;
  modelingCompletedDate: string;
  importedAt: string;
  historicalThroughPeriod: string;
  revisionFingerprint: string;
  revisionMethod: typeof OFFICIAL_STEO_REVISION_METHOD;
  seriesIds: { supply: typeof SUPPLY_SERIES; demand: typeof DEMAND_SERIES };
  unit: typeof UNIT;
  revisionBasis: ComparableSteoPoint[];
  historical: OfficialSteoHistoricalPoint[];
  forecast: OfficialSteoForecastPoint[];
};

export type OfficialSteoVintageParseInput = {
  datesRows: unknown[][];
  balanceRows: unknown[][];
  issue: string;
  releaseDate: string;
  importedAt: string;
  sourceArtifactUrl: string;
  sourceArtifactSha256: string;
};

export type StoredOfficialSteoVintage = {
  path: string;
  created: boolean;
  artifactSha256: string;
  revisionFingerprint: string;
};

function finiteNumber(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function parsePeriod(value: unknown, label: string): string {
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : String(value ?? '').trim();
  if (!/^\d{6}$/.test(raw)) throw new Error(`${label} must use YYYYMM`);
  const period = `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
  if (!PERIOD_PATTERN.test(period)) throw new Error(`${label} has an invalid month`);
  return period;
}

function toIsoDate(value: unknown, label: string): string {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000);
  } else {
    const raw = String(value ?? '').trim();
    if (ISO_DATE_PATTERN.test(raw)) return raw;
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date`);
  return date.toISOString().slice(0, 10);
}

function parseForecastMonth(value: unknown): string {
  const match = String(value ?? '').trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) throw new Error('Dates forecast month must look like "August 2026"');
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) throw new Error(`Unsupported forecast month: ${match[1]}`);
  return `${match[2]}-${month}`;
}

function officialArtifactIdentity(urlValue: string) {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || url.hostname !== 'www.eia.gov') {
    throw new Error('Official STEO archive artifact must use https://www.eia.gov');
  }
  const match = url.pathname.match(OFFICIAL_ARCHIVE_PATH_PATTERN);
  if (!match) throw new Error('Official STEO archive artifact URL must end in <mon><yy>_base.xlsx');
  const month = MONTH_ABBREVIATIONS[match[1]];
  if (!month) throw new Error('Official STEO archive filename has an unsupported month abbreviation');
  return {
    name: path.posix.basename(url.pathname),
    issue: `20${match[2]}-${month}`,
  };
}

function samePoint(a: ComparableSteoPoint, b: ComparableSteoPoint) {
  return a.period === b.period && a.supplyMbpd === b.supplyMbpd && a.demandMbpd === b.demandMbpd && a.balanceMbpd === b.balanceMbpd;
}

function balanceMatches(point: ComparableSteoPoint) {
  return Number((point.supplyMbpd - point.demandMbpd).toFixed(2)) === point.balanceMbpd;
}

function alignedSeriesValues(rows: unknown[][], seriesId: string, periods: string[]) {
  const candidates = rows.filter((row) => String(row?.[0] ?? '').trim().toUpperCase() === seriesId);
  if (!candidates.length) throw new Error(`Official STEO workbook is missing ${seriesId}`);

  const parsed = candidates.map((row, rowIndex) => periods.map((period, index) =>
    finiteNumber(row?.[index + 2], `${seriesId} ${period} row ${rowIndex + 1}`),
  ));

  const canonical = parsed[0];
  for (const candidate of parsed.slice(1)) {
    if (candidate.length !== canonical.length || candidate.some((value, index) => value !== canonical[index])) {
      throw new Error(`Official STEO workbook has conflicting duplicate ${seriesId} rows`);
    }
  }
  return canonical;
}

function lastNonEmptyIndex(values: unknown[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null && values[index] !== undefined && values[index] !== '') return index;
  }
  return -1;
}

export function parseOfficialSteoVintage(input: OfficialSteoVintageParseInput): OfficialSteoVintage {
  if (!Array.isArray(input.datesRows) || input.datesRows.length < 13) throw new Error('Dates sheet is missing required rows');
  if (!Array.isArray(input.balanceRows) || !input.balanceRows.length) throw new Error('3atab sheet is empty');
  if (!PERIOD_PATTERN.test(input.issue)) throw new Error('Official STEO issue must use YYYY-MM');
  if (!ISO_DATE_PATTERN.test(input.releaseDate)) throw new Error('Official STEO releaseDate must use YYYY-MM-DD');
  if (Number.isNaN(Date.parse(input.importedAt))) throw new Error('Official STEO importedAt must be an ISO-compatible timestamp');
  if (!SHA256_PATTERN.test(input.sourceArtifactSha256)) throw new Error('Official STEO source artifact SHA-256 is malformed');

  const artifact = officialArtifactIdentity(input.sourceArtifactUrl);
  if (artifact.issue !== input.issue) throw new Error(`Archive filename issue ${artifact.issue} does not match requested issue ${input.issue}`);

  const workbookIssue = parseForecastMonth(input.datesRows[0]?.[3]);
  if (workbookIssue !== input.issue) throw new Error(`Workbook forecast month ${workbookIssue} does not match requested issue ${input.issue}`);
  if (input.releaseDate.slice(0, 7) !== input.issue) throw new Error('Release date month must match the STEO issue');

  const modelingCompletedDate = toIsoDate(input.datesRows[1]?.[3], 'Dates modeling completion');
  if (modelingCompletedDate > input.releaseDate) throw new Error('STEO modeling completion date cannot be after release date');
  const historicalThroughPeriod = parsePeriod(input.datesRows[6]?.[3], 'Dates last historical month');

  const periodCells = (input.datesRows[10] ?? []).slice(2);
  const finalPeriodIndex = lastNonEmptyIndex(periodCells);
  if (finalPeriodIndex < 0) throw new Error('Dates sheet contains no monthly period vector');
  const periods = periodCells.slice(0, finalPeriodIndex + 1).map((value, index) => parsePeriod(value, `Dates period ${index + 1}`));
  if (new Set(periods).size !== periods.length) throw new Error('Dates sheet contains duplicate monthly periods');
  for (let index = 1; index < periods.length; index += 1) {
    if (periods[index] <= periods[index - 1]) throw new Error('Dates sheet monthly periods must be strictly increasing');
  }

  const historicalCells = (input.datesRows[12] ?? []).slice(2, 2 + periods.length);
  if (historicalCells.length !== periods.length) throw new Error('Dates historical flags do not align to the period vector');
  const historicalFlags = historicalCells.map((value, index) => {
    const flag = finiteNumber(value, `Dates historical flag ${periods[index]}`);
    if (flag !== 0 && flag !== 1) throw new Error(`Dates historical flag ${periods[index]} must be 0 or 1`);
    return flag as 0 | 1;
  });
  const firstForecastIndex = historicalFlags.indexOf(0);
  if (firstForecastIndex <= 0) throw new Error('Official STEO vintage must include both historical and forecast periods');
  if (historicalFlags.slice(firstForecastIndex).some((flag) => flag !== 0)) {
    throw new Error('Dates historical flags must transition once from historical to forecast');
  }
  if (periods[firstForecastIndex] !== input.issue) {
    throw new Error(`First source-labelled forecast period ${periods[firstForecastIndex]} does not match issue ${input.issue}`);
  }
  if (periods[firstForecastIndex - 1] !== historicalThroughPeriod) {
    throw new Error('Dates last historical month does not match the historical flag boundary');
  }

  const supply = alignedSeriesValues(input.balanceRows, SUPPLY_SERIES, periods);
  const demand = alignedSeriesValues(input.balanceRows, DEMAND_SERIES, periods);
  const revisionBasis = periods.map((period, index) => ({
    period,
    supplyMbpd: supply[index],
    demandMbpd: demand[index],
    balanceMbpd: Number((supply[index] - demand[index]).toFixed(2)),
  }));

  const historical: OfficialSteoHistoricalPoint[] = revisionBasis
    .filter((_, index) => historicalFlags[index] === 1)
    .map((point) => ({ ...point, classification: 'historical-public-estimate' }));
  const forecast: OfficialSteoForecastPoint[] = revisionBasis
    .filter((_, index) => historicalFlags[index] === 0)
    .map((point) => ({ ...point, classification: 'forecast' }));

  const vintage: OfficialSteoVintage = {
    schemaVersion: 1,
    source: EIA_STEO_SOURCE,
    sourceKind: 'eia-steo-official-archive-xlsx',
    sourcePageUrl: EIA_STEO_SOURCE_PAGE,
    sourceArtifactUrl: input.sourceArtifactUrl,
    sourceArtifactName: artifact.name,
    sourceArtifactSha256: input.sourceArtifactSha256,
    issue: input.issue,
    releaseDate: input.releaseDate,
    modelingCompletedDate,
    importedAt: input.importedAt,
    historicalThroughPeriod,
    revisionFingerprint: fingerprintSteoForecast(revisionBasis),
    revisionMethod: OFFICIAL_STEO_REVISION_METHOD,
    seriesIds: { supply: SUPPLY_SERIES, demand: DEMAND_SERIES },
    unit: UNIT,
    revisionBasis,
    historical,
    forecast,
  };

  const errors = validateOfficialSteoVintage(vintage);
  if (errors.length) throw new Error(`Invalid official STEO vintage: ${errors.join('; ')}`);
  return vintage;
}

export function validateOfficialSteoVintage(vintage: OfficialSteoVintage): string[] {
  const errors: string[] = [];
  if (!vintage || typeof vintage !== 'object') return ['vintage must be an object'];
  if (vintage.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (vintage.source !== EIA_STEO_SOURCE) errors.push('source must identify EIA STEO');
  if (vintage.sourceKind !== 'eia-steo-official-archive-xlsx') errors.push('sourceKind must identify official archive XLSX');
  if (vintage.sourcePageUrl !== EIA_STEO_SOURCE_PAGE) errors.push('sourcePageUrl must be the canonical EIA STEO page');
  if (!PERIOD_PATTERN.test(vintage.issue ?? '')) errors.push('issue must use YYYY-MM');
  if (!ISO_DATE_PATTERN.test(vintage.releaseDate ?? '')) errors.push('releaseDate must use YYYY-MM-DD');
  if (!ISO_DATE_PATTERN.test(vintage.modelingCompletedDate ?? '')) errors.push('modelingCompletedDate must use YYYY-MM-DD');
  if (Number.isNaN(Date.parse(vintage.importedAt))) errors.push('importedAt must be an ISO-compatible timestamp');
  if (!SHA256_PATTERN.test(vintage.sourceArtifactSha256 ?? '')) errors.push('sourceArtifactSha256 must be a SHA-256 hex digest');
  if (!SHA256_PATTERN.test(vintage.revisionFingerprint ?? '')) errors.push('revisionFingerprint must be a SHA-256 hex digest');
  if (vintage.revisionMethod !== OFFICIAL_STEO_REVISION_METHOD) errors.push('revisionMethod must identify official archive paired-series fingerprinting');
  if (vintage.seriesIds?.supply !== SUPPLY_SERIES || vintage.seriesIds?.demand !== DEMAND_SERIES) errors.push('seriesIds must be PAPR_WORLD and PATC_WORLD');
  if (vintage.unit !== UNIT) errors.push('unit must be million barrels per day');

  try {
    const artifact = officialArtifactIdentity(vintage.sourceArtifactUrl);
    if (artifact.name !== vintage.sourceArtifactName) errors.push('sourceArtifactName must match sourceArtifactUrl');
    if (artifact.issue !== vintage.issue) errors.push('source artifact filename issue must match vintage issue');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'source artifact URL validation failed');
  }

  if (vintage.releaseDate?.slice(0, 7) !== vintage.issue) errors.push('releaseDate month must match issue');
  if (vintage.modelingCompletedDate > vintage.releaseDate) errors.push('modelingCompletedDate cannot be after releaseDate');

  if (!Array.isArray(vintage.revisionBasis) || !vintage.revisionBasis.length) {
    errors.push('revisionBasis must contain paired periods');
  } else {
    for (const point of vintage.revisionBasis) {
      if (!balanceMatches(point)) errors.push(`revisionBasis ${point.period} balance is not reproducible from supply minus demand`);
    }
    try {
      if (fingerprintSteoForecast(vintage.revisionBasis) !== vintage.revisionFingerprint) {
        errors.push('revisionFingerprint does not match revisionBasis');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'revisionBasis fingerprint validation failed');
    }
  }

  if (!Array.isArray(vintage.historical) || !vintage.historical.length) errors.push('historical must contain source-labelled historical periods');
  if (!Array.isArray(vintage.forecast) || !vintage.forecast.length) errors.push('forecast must contain source-labelled forecast periods');
  if (Array.isArray(vintage.historical) && vintage.historical.some((point) => point.classification !== 'historical-public-estimate')) {
    errors.push('historical points must be labelled historical-public-estimate');
  }
  if (Array.isArray(vintage.forecast) && vintage.forecast.some((point) => point.classification !== 'forecast')) {
    errors.push('forecast points must be labelled forecast');
  }

  if (Array.isArray(vintage.revisionBasis) && Array.isArray(vintage.historical) && Array.isArray(vintage.forecast)) {
    const basisByPeriod = new Map(vintage.revisionBasis.map((point) => [point.period, point]));
    const classified = [...vintage.historical, ...vintage.forecast];
    if (classified.length !== vintage.revisionBasis.length) errors.push('historical and forecast classifications must cover every revisionBasis period exactly once');
    const seen = new Set<string>();
    for (const point of classified) {
      if (seen.has(point.period)) errors.push(`period ${point.period} is classified more than once`);
      seen.add(point.period);
      const basis = basisByPeriod.get(point.period);
      if (!basis || !samePoint(point, basis)) errors.push(`classified period ${point.period} does not match revisionBasis`);
    }
    const finalHistorical = vintage.historical[vintage.historical.length - 1]?.period;
    const firstForecast = vintage.forecast[0]?.period;
    if (finalHistorical !== vintage.historicalThroughPeriod) errors.push('historicalThroughPeriod must match final source-labelled historical period');
    if (firstForecast !== vintage.issue) errors.push('first source-labelled forecast period must match issue');
  }

  return errors;
}

export function assertOfficialSteoVintage(vintage: OfficialSteoVintage): OfficialSteoVintage {
  const errors = validateOfficialSteoVintage(vintage);
  if (errors.length) throw new Error(`Invalid official STEO vintage: ${errors.join('; ')}`);
  return vintage;
}

export function officialSteoVintageFileName(vintage: OfficialSteoVintage) {
  assertOfficialSteoVintage(vintage);
  return `${vintage.releaseDate}_${vintage.sourceArtifactSha256}.json`;
}

export function writeOfficialSteoVintage(vintage: OfficialSteoVintage, directory: string): StoredOfficialSteoVintage {
  assertOfficialSteoVintage(vintage);
  const resolvedDirectory = path.resolve(directory);
  fs.mkdirSync(resolvedDirectory, { recursive: true });
  const filePath = path.join(resolvedDirectory, officialSteoVintageFileName(vintage));
  if (fs.existsSync(filePath)) {
    readOfficialSteoVintage(filePath);
    return { path: filePath, created: false, artifactSha256: vintage.sourceArtifactSha256, revisionFingerprint: vintage.revisionFingerprint };
  }
  fs.writeFileSync(filePath, `${JSON.stringify(vintage, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { path: filePath, created: true, artifactSha256: vintage.sourceArtifactSha256, revisionFingerprint: vintage.revisionFingerprint };
}

export function readOfficialSteoVintage(filePath: string): OfficialSteoVintage {
  const vintage = JSON.parse(fs.readFileSync(filePath, 'utf8')) as OfficialSteoVintage;
  assertOfficialSteoVintage(vintage);
  const expected = officialSteoVintageFileName(vintage);
  if (path.basename(filePath) !== expected) throw new Error(`Official STEO vintage filename must match provenance identity: expected ${expected}`);
  return vintage;
}

export function listOfficialSteoVintages(directory: string): OfficialSteoVintage[] {
  const resolvedDirectory = path.resolve(directory);
  if (!fs.existsSync(resolvedDirectory)) return [];
  return fs.readdirSync(resolvedDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readOfficialSteoVintage(path.join(resolvedDirectory, name)))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.importedAt.localeCompare(b.importedAt));
}
