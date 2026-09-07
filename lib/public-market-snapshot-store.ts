import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildPublicEvidenceManifest, type PublicEvidenceManifest } from './public-evidence-manifest';
import { derivePublicMarketSnapshot, type PublicMarketSnapshot, type PublicSeriesObservation } from './public-market-snapshot';
import type { SteoBalancePoint } from './steo';

export type PublicMarketArchiveSnapshot = {
  source: 'U.S. Energy Information Administration (EIA) API';
  sourceUrl: 'https://www.eia.gov/opendata/';
  retrievedAt: string;
  sourceFingerprint: string;
  fingerprintMethod: 'sha256 of canonical RBRTE/RWTC/WCESTUS1 observations plus linked STEO revision/near-term point';
  seriesIds: {
    brent: 'RBRTE';
    wti: 'RWTC';
    inventories: 'WCESTUS1';
  };
  prices: {
    brent: PublicSeriesObservation[];
    wti: PublicSeriesObservation[];
  };
  inventories: PublicSeriesObservation[];
  steo: {
    sourceUrl: 'https://www.eia.gov/outlooks/steo/';
    revisionFingerprint: string;
    seriesIds: { supply: 'PAPR_WORLD'; demand: 'PATC_WORLD' };
    nearTermPoint: SteoBalancePoint;
  } | null;
  publicSnapshot: PublicMarketSnapshot;
  publicEvidenceManifest: PublicEvidenceManifest;
};

export type StoredPublicMarketSnapshot = {
  path: string;
  created: boolean;
  fingerprint: string;
};

const SOURCE = 'U.S. Energy Information Administration (EIA) API';
const SOURCE_URL = 'https://www.eia.gov/opendata/';
const STEO_URL = 'https://www.eia.gov/outlooks/steo/';
const FINGERPRINT_METHOD = 'sha256 of canonical RBRTE/RWTC/WCESTUS1 observations plus linked STEO revision/near-term point';
const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP_SENTINEL = '1970-01-01T00:00:00.000Z';

function validDate(value: string) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function canonicalSeries(series: PublicSeriesObservation[]) {
  return [...series]
    .map((point) => ({ period: point.period, value: point.value, units: point.units ?? null }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.value - b.value || String(a.units).localeCompare(String(b.units)));
}

function canonicalFingerprintInput(snapshot: Pick<PublicMarketArchiveSnapshot, 'prices' | 'inventories' | 'seriesIds' | 'steo'>) {
  return {
    seriesIds: snapshot.seriesIds,
    prices: {
      brent: canonicalSeries(snapshot.prices.brent),
      wti: canonicalSeries(snapshot.prices.wti),
    },
    inventories: canonicalSeries(snapshot.inventories),
    steo: snapshot.steo
      ? {
          revisionFingerprint: snapshot.steo.revisionFingerprint,
          seriesIds: snapshot.steo.seriesIds,
          nearTermPoint: snapshot.steo.nearTermPoint,
        }
      : null,
  };
}

export function fingerprintPublicMarketSource(snapshot: Pick<PublicMarketArchiveSnapshot, 'prices' | 'inventories' | 'seriesIds' | 'steo'>) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalFingerprintInput(snapshot))).digest('hex');
}

function validateSeries(series: PublicSeriesObservation[] | null | undefined, label: string, minimum: number, errors: string[]) {
  if (!Array.isArray(series) || series.length < minimum) {
    errors.push(`${label} must contain at least ${minimum} observation${minimum === 1 ? '' : 's'}`);
    return;
  }
  const periods = new Set<string>();
  for (const point of series) {
    if (!point || typeof point.period !== 'string' || !point.period.trim()) {
      errors.push(`${label} contains an observation without a period`);
      continue;
    }
    if (!Number.isFinite(point.value)) errors.push(`${label} ${point.period} value must be finite`);
    if (periods.has(point.period)) errors.push(`${label} contains duplicate period ${point.period}`);
    periods.add(point.period);
  }
}

function semantic(value: unknown) {
  return JSON.stringify(value);
}

function normalizationSemantics(snapshot: PublicMarketArchiveSnapshot) {
  const normalized = JSON.parse(JSON.stringify(snapshot)) as PublicMarketArchiveSnapshot;
  normalized.retrievedAt = TIMESTAMP_SENTINEL;
  normalized.prices = {
    brent: canonicalSeries(normalized.prices.brent),
    wti: canonicalSeries(normalized.prices.wti),
  } as PublicMarketArchiveSnapshot['prices'];
  normalized.inventories = canonicalSeries(normalized.inventories) as PublicMarketArchiveSnapshot['inventories'];
  normalized.publicEvidenceManifest.generatedAt = TIMESTAMP_SENTINEL;
  normalized.publicEvidenceManifest.observations = normalized.publicEvidenceManifest.observations.map((item) => ({
    ...item,
    retrievedAt: item.retrievedAt === null ? null : TIMESTAMP_SENTINEL,
  }));
  return normalized;
}

export function validatePublicMarketArchiveSnapshot(snapshot: PublicMarketArchiveSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot || typeof snapshot !== 'object') return ['snapshot must be an object'];
  if (snapshot.source !== SOURCE) errors.push('source must identify the EIA API');
  if (snapshot.sourceUrl !== SOURCE_URL) errors.push('sourceUrl must be the canonical EIA Open Data URL');
  if (!validDate(snapshot.retrievedAt)) errors.push('retrievedAt must be date-compatible');
  if (snapshot.fingerprintMethod !== FINGERPRINT_METHOD) errors.push('fingerprintMethod must use the canonical public source-state method');
  if (!SHA256.test(snapshot.sourceFingerprint ?? '')) errors.push('sourceFingerprint must be a SHA-256 hex digest');
  if (snapshot.seriesIds?.brent !== 'RBRTE' || snapshot.seriesIds?.wti !== 'RWTC' || snapshot.seriesIds?.inventories !== 'WCESTUS1') {
    errors.push('seriesIds must identify RBRTE, RWTC and WCESTUS1');
  }

  validateSeries(snapshot.prices?.brent, 'Brent series', 1, errors);
  validateSeries(snapshot.prices?.wti, 'WTI series', 1, errors);
  validateSeries(snapshot.inventories, 'Inventory series', 2, errors);

  if (snapshot.steo) {
    if (snapshot.steo.sourceUrl !== STEO_URL) errors.push('STEO sourceUrl must be canonical');
    if (!SHA256.test(snapshot.steo.revisionFingerprint ?? '')) errors.push('STEO revisionFingerprint must be a SHA-256 hex digest');
    if (snapshot.steo.seriesIds?.supply !== 'PAPR_WORLD' || snapshot.steo.seriesIds?.demand !== 'PATC_WORLD') {
      errors.push('STEO seriesIds must identify PAPR_WORLD and PATC_WORLD');
    }
    const point = snapshot.steo.nearTermPoint;
    if (!point || point.classification !== 'forecast') errors.push('STEO nearTermPoint must be labelled forecast');
    if (!point || !Number.isFinite(point.supplyMbpd) || !Number.isFinite(point.demandMbpd) || !Number.isFinite(point.balanceMbpd)) {
      errors.push('STEO nearTermPoint values must be finite');
    } else if (Number((point.supplyMbpd - point.demandMbpd).toFixed(2)) !== point.balanceMbpd) {
      errors.push('STEO nearTermPoint balance must equal supply minus demand rounded to 2 decimals');
    }
  }

  try {
    const expectedFingerprint = fingerprintPublicMarketSource(snapshot);
    if (expectedFingerprint !== snapshot.sourceFingerprint) errors.push('sourceFingerprint does not match canonical source contents');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'source fingerprint validation failed');
  }

  try {
    const expectedSnapshot = derivePublicMarketSnapshot({
      brent: snapshot.prices.brent,
      wti: snapshot.prices.wti,
      inventories: snapshot.inventories,
      steoForecast: snapshot.steo ? [snapshot.steo.nearTermPoint] : null,
    });
    if (semantic(expectedSnapshot) !== semantic(snapshot.publicSnapshot)) errors.push('publicSnapshot does not reproduce from archived source observations');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'public snapshot reproduction failed');
  }

  try {
    const expectedManifest = buildPublicEvidenceManifest({
      generatedAt: snapshot.retrievedAt,
      retrievedAt: snapshot.retrievedAt,
      brent: snapshot.prices.brent,
      wti: snapshot.prices.wti,
      inventories: snapshot.inventories,
      snapshot: snapshot.publicSnapshot,
      steo: snapshot.steo
        ? {
            sourceUrl: snapshot.steo.sourceUrl,
            revisionFingerprint: snapshot.steo.revisionFingerprint,
            seriesIds: snapshot.steo.seriesIds,
            forecast: [snapshot.steo.nearTermPoint],
          }
        : null,
    });
    if (semantic(expectedManifest) !== semantic(snapshot.publicEvidenceManifest)) errors.push('publicEvidenceManifest does not reproduce from archived source observations');
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'public evidence manifest reproduction failed');
  }

  return errors;
}

export function assertPublicMarketArchiveSnapshot(snapshot: PublicMarketArchiveSnapshot) {
  const errors = validatePublicMarketArchiveSnapshot(snapshot);
  if (errors.length) throw new Error(`Invalid public market snapshot: ${errors.join('; ')}`);
  return snapshot;
}

export function publicMarketSnapshotFileName(fingerprint: string) {
  if (!SHA256.test(fingerprint)) throw new Error('public market snapshot fingerprint must be a SHA-256 hex digest');
  return `${fingerprint}.json`;
}

export function createPublicMarketArchiveSnapshot(input: {
  retrievedAt: string;
  prices: { brent: PublicSeriesObservation[]; wti: PublicSeriesObservation[] };
  inventories: PublicSeriesObservation[];
  publicSnapshot: PublicMarketSnapshot;
  publicEvidenceManifest: PublicEvidenceManifest;
  steo: PublicMarketArchiveSnapshot['steo'];
}): PublicMarketArchiveSnapshot {
  const base = {
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    retrievedAt: input.retrievedAt,
    fingerprintMethod: FINGERPRINT_METHOD,
    seriesIds: { brent: 'RBRTE', wti: 'RWTC', inventories: 'WCESTUS1' },
    prices: input.prices,
    inventories: input.inventories,
    steo: input.steo,
    publicSnapshot: input.publicSnapshot,
    publicEvidenceManifest: input.publicEvidenceManifest,
  } as Omit<PublicMarketArchiveSnapshot, 'sourceFingerprint'>;
  const sourceFingerprint = fingerprintPublicMarketSource(base as PublicMarketArchiveSnapshot);
  return assertPublicMarketArchiveSnapshot({ ...base, sourceFingerprint } as PublicMarketArchiveSnapshot);
}

export function writePublicMarketArchiveSnapshot(snapshot: PublicMarketArchiveSnapshot, directory: string): StoredPublicMarketSnapshot {
  assertPublicMarketArchiveSnapshot(snapshot);
  const resolvedDirectory = path.resolve(directory);
  fs.mkdirSync(resolvedDirectory, { recursive: true });
  const filePath = path.join(resolvedDirectory, publicMarketSnapshotFileName(snapshot.sourceFingerprint));

  if (fs.existsSync(filePath)) {
    const existing = readPublicMarketArchiveSnapshot(filePath);
    if (semantic(normalizationSemantics(existing)) !== semantic(normalizationSemantics(snapshot))) {
      throw new Error('Existing public market snapshot fingerprint maps to different normalized contents');
    }
    return { path: filePath, created: false, fingerprint: snapshot.sourceFingerprint };
  }

  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { path: filePath, created: true, fingerprint: snapshot.sourceFingerprint };
}

export function readPublicMarketArchiveSnapshot(filePath: string): PublicMarketArchiveSnapshot {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PublicMarketArchiveSnapshot;
  assertPublicMarketArchiveSnapshot(snapshot);
  const expected = publicMarketSnapshotFileName(snapshot.sourceFingerprint);
  if (path.basename(filePath) !== expected) throw new Error(`Public market snapshot filename must match source fingerprint: expected ${expected}`);
  return snapshot;
}

export function listPublicMarketArchiveSnapshots(directory: string): PublicMarketArchiveSnapshot[] {
  const resolvedDirectory = path.resolve(directory);
  if (!fs.existsSync(resolvedDirectory)) return [];
  return fs
    .readdirSync(resolvedDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readPublicMarketArchiveSnapshot(path.join(resolvedDirectory, name)))
    .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt));
}
