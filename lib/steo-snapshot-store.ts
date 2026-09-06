import fs from 'node:fs';
import path from 'node:path';
import { fingerprintSteoForecast, type ComparableSteoPoint } from './steo-revision';

export type SteoSnapshot = {
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  revisionFingerprint: string;
  revisionMethod: string;
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

function validIso(value: string) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function validateSteoSnapshot(snapshot: SteoSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot || typeof snapshot !== 'object') return ['snapshot must be an object'];
  if (!snapshot.source?.trim()) errors.push('source is required');
  if (!snapshot.sourceUrl?.trim()) errors.push('sourceUrl is required');
  if (!validIso(snapshot.retrievedAt)) errors.push('retrievedAt must be an ISO-compatible timestamp');
  if (!FINGERPRINT_PATTERN.test(snapshot.revisionFingerprint ?? '')) errors.push('revisionFingerprint must be a SHA-256 hex digest');
  if (!snapshot.revisionMethod?.trim()) errors.push('revisionMethod is required');
  if (!snapshot.seriesIds?.supply?.trim() || !snapshot.seriesIds?.demand?.trim()) errors.push('supply and demand series IDs are required');
  if (!snapshot.unit?.trim()) errors.push('unit is required');
  if (!Array.isArray(snapshot.forecast) || snapshot.forecast.length === 0) {
    errors.push('forecast must contain at least one period');
    return errors;
  }

  if (snapshot.forecast.some((point) => point.classification !== 'forecast')) {
    errors.push('every snapshot point must be labelled forecast');
  }

  try {
    const calculated = fingerprintSteoForecast(snapshot.forecast);
    if (calculated !== snapshot.revisionFingerprint) {
      errors.push('revisionFingerprint does not match forecast contents');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'forecast fingerprint validation failed');
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
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SteoSnapshot;
    assertSteoSnapshot(existing);
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
  return assertSteoSnapshot(snapshot);
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
