import fs from 'node:fs';
import path from 'node:path';
import { fingerprintSteoForecast, type ComparableSteoPoint } from './steo-revision';

export type SteoSnapshot = {
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  revisionFingerprint: string;
  revisionMethod: string;
  revisionBasis: ComparableSteoPoint[];
  seriesIds: { supply: string; demand: string };
  unit: string;
  forecast: Array<ComparableSteoPoint & { classification: 'forecast' }>;
};

export type StoredSteoSnapshot = {
  path: string;
  created: boolean;
  fingerprint: string;
};

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const EIA_SOURCE = 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook';
const EIA_SOURCE_URL = 'https://www.eia.gov/outlooks/steo/';
const SUPPLY_SERIES = 'PAPR_WORLD';
const DEMAND_SERIES = 'PATC_WORLD';
const UNIT = 'million barrels per day';
const REVISION_METHOD = 'sha256 of sorted paired PAPR_WORLD/PATC_WORLD source response window values';

function validIso(value: string) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function samePoint(a: ComparableSteoPoint, b: ComparableSteoPoint) {
  return (
    a.period === b.period &&
    a.supplyMbpd === b.supplyMbpd &&
    a.demandMbpd === b.demandMbpd &&
    a.balanceMbpd === b.balanceMbpd
  );
}

function balanceMatches(point: ComparableSteoPoint) {
  return Number((point.supplyMbpd - point.demandMbpd).toFixed(2)) === point.balanceMbpd;
}

function validateBalances(points: ComparableSteoPoint[], label: string, errors: string[]) {
  for (const point of points) {
    if (!balanceMatches(point)) {
      errors.push(`${label} period ${point.period} balanceMbpd must equal supplyMbpd minus demandMbpd rounded to 2 decimals`);
    }
  }
}

export function validateSteoSnapshot(snapshot: SteoSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot || typeof snapshot !== 'object') return ['snapshot must be an object'];
  if (snapshot.source !== EIA_SOURCE) errors.push('source must identify the EIA Short-Term Energy Outlook');
  if (snapshot.sourceUrl !== EIA_SOURCE_URL) errors.push('sourceUrl must be the canonical EIA STEO source URL');
  if (!validIso(snapshot.retrievedAt)) errors.push('retrievedAt must be an ISO-compatible timestamp');
  if (!FINGERPRINT_PATTERN.test(snapshot.revisionFingerprint ?? '')) errors.push('revisionFingerprint must be a SHA-256 hex digest');
  if (snapshot.revisionMethod !== REVISION_METHOD) errors.push('revisionMethod must identify the canonical paired-source-window fingerprint method');
  if (snapshot.seriesIds?.supply !== SUPPLY_SERIES || snapshot.seriesIds?.demand !== DEMAND_SERIES) {
    errors.push('seriesIds must be PAPR_WORLD supply and PATC_WORLD demand');
  }
  if (snapshot.unit !== UNIT) errors.push('unit must be million barrels per day');

  if (!Array.isArray(snapshot.revisionBasis) || snapshot.revisionBasis.length === 0) {
    errors.push('revisionBasis must contain at least one paired source period');
  } else {
    validateBalances(snapshot.revisionBasis, 'revisionBasis', errors);
    try {
      const calculated = fingerprintSteoForecast(snapshot.revisionBasis);
      if (calculated !== snapshot.revisionFingerprint) {
        errors.push('revisionFingerprint does not match revisionBasis contents');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'revision basis fingerprint validation failed');
    }
  }

  if (!Array.isArray(snapshot.forecast) || snapshot.forecast.length === 0) {
    errors.push('forecast must contain at least one period');
  } else {
    validateBalances(snapshot.forecast, 'forecast', errors);
    if (snapshot.forecast.some((point) => point.classification !== 'forecast')) {
      errors.push('every snapshot forecast point must be labelled forecast');
    }

    try {
      fingerprintSteoForecast(snapshot.forecast);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'forecast validation failed');
    }

    if (Array.isArray(snapshot.revisionBasis)) {
      const basisByPeriod = new Map(snapshot.revisionBasis.map((point) => [point.period, point]));
      for (const point of snapshot.forecast) {
        const basis = basisByPeriod.get(point.period);
        if (!basis || !samePoint(point, basis)) {
          errors.push(`forecast period ${point.period} does not match the archived revision basis`);
        }
      }
    }
  }

  return errors;
}

export function assertSteoSnapshot(snapshot: SteoSnapshot): SteoSnapshot {
  const errors = validateSteoSnapshot(snapshot);
  if (errors.length) throw new Error(`Invalid STEO snapshot: ${errors.join('; ')}`);
  return snapshot;
}

export function snapshotFileName(fingerprint: string) {
  if (!FINGERPRINT_PATTERN.test(fingerprint)) throw new Error('snapshot fingerprint must be a SHA-256 hex digest');
  return `${fingerprint}.json`;
}

export function writeSteoSnapshot(snapshot: SteoSnapshot, directory: string): StoredSteoSnapshot {
  assertSteoSnapshot(snapshot);
  const resolvedDirectory = path.resolve(directory);
  fs.mkdirSync(resolvedDirectory, { recursive: true });
  const filePath = path.join(resolvedDirectory, snapshotFileName(snapshot.revisionFingerprint));

  if (fs.existsSync(filePath)) {
    const existing = readSteoSnapshot(filePath);
    if (existing.revisionFingerprint !== snapshot.revisionFingerprint) {
      throw new Error('Existing snapshot fingerprint does not match requested fingerprint');
    }
    return { path: filePath, created: false, fingerprint: snapshot.revisionFingerprint };
  }

  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { path: filePath, created: true, fingerprint: snapshot.revisionFingerprint };
}

export function readSteoSnapshot(filePath: string): SteoSnapshot {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SteoSnapshot;
  assertSteoSnapshot(snapshot);
  const expectedName = snapshotFileName(snapshot.revisionFingerprint);
  if (path.basename(filePath) !== expectedName) {
    throw new Error(`Snapshot filename must match revision fingerprint: expected ${expectedName}`);
  }
  return snapshot;
}

export function listSteoSnapshots(directory: string): SteoSnapshot[] {
  const resolvedDirectory = path.resolve(directory);
  if (!fs.existsSync(resolvedDirectory)) return [];

  return fs
    .readdirSync(resolvedDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readSteoSnapshot(path.join(resolvedDirectory, name)))
    .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt));
}
