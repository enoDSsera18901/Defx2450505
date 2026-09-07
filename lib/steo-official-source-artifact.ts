import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISSUE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const OFFICIAL_ARCHIVE_URL = /^https:\/\/www\.eia\.gov\/outlooks\/steo\/archives\/([a-z]{3})(\d{2})_base\.xlsx$/;
const MAX_OFFICIAL_STEO_XLSX_BYTES = 15 * 1024 * 1024;

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export type OfficialSteoSourceArtifactManifest = {
  schemaVersion: 1;
  sourceKind: 'eia-steo-official-archive-xlsx-raw';
  issue: string;
  sourceArtifactUrl: string;
  sourceArtifactSha256: string;
  byteLength: number;
  firstRetrievedAt: string;
};

export type StoredOfficialSteoSourceArtifact = {
  created: boolean;
  workbookPath: string;
  manifestPath: string;
  manifest: OfficialSteoSourceArtifactManifest;
};

export type OfficialSteoSourceArtifactInput = {
  issue: string;
  sourceArtifactUrl: string;
  retrievedAt: string;
  bytes: Buffer;
};

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSourceIdentity(issue: string, sourceArtifactUrl: string) {
  if (!ISSUE_PATTERN.test(issue)) throw new Error('Official STEO source issue must use YYYY-MM');
  const match = sourceArtifactUrl.match(OFFICIAL_ARCHIVE_URL);
  if (!match) throw new Error('Official STEO source must use the canonical EIA archive XLSX URL');
  const month = MONTHS[match[1]];
  if (!month) throw new Error('Official STEO source URL has an unsupported month');
  const urlIssue = `20${match[2]}-${month}`;
  if (urlIssue !== issue) throw new Error(`Official STEO source URL issue ${urlIssue} does not match ${issue}`);
}

function assertSourceBytes(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Official STEO source workbook is empty');
  if (bytes.length > MAX_OFFICIAL_STEO_XLSX_BYTES) throw new Error('Official STEO source workbook exceeds the 15 MiB safety limit');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Official STEO source workbook is not an XLSX/ZIP file');
}

function validateManifest(manifest: OfficialSteoSourceArtifactManifest) {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (manifest.sourceKind !== 'eia-steo-official-archive-xlsx-raw') errors.push('sourceKind is invalid');
  if (!SHA256_PATTERN.test(manifest.sourceArtifactSha256 ?? '')) errors.push('sourceArtifactSha256 must be SHA-256');
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0) errors.push('byteLength must be a positive integer');
  if (Number.isNaN(Date.parse(manifest.firstRetrievedAt))) errors.push('firstRetrievedAt must be an ISO-compatible timestamp');
  try {
    assertSourceIdentity(manifest.issue, manifest.sourceArtifactUrl);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'source identity is invalid');
  }
  return errors;
}

function atomicWrite(filePath: string, data: Buffer | string) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, data, { flag: 'wx' });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function artifactPaths(directory: string, digest: string) {
  if (!SHA256_PATTERN.test(digest)) throw new Error('Official STEO source artifact digest is malformed');
  const resolved = path.resolve(directory);
  return {
    workbookPath: path.join(resolved, `${digest}.xlsx`),
    manifestPath: path.join(resolved, `${digest}.manifest.json`),
  };
}

export function readOfficialSteoSourceArtifact(
  workbookPath: string,
  manifestPath: string,
): OfficialSteoSourceArtifactManifest {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as OfficialSteoSourceArtifactManifest;
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`Invalid official STEO source artifact manifest: ${errors.join('; ')}`);

  const expected = artifactPaths(path.dirname(workbookPath), manifest.sourceArtifactSha256);
  if (path.resolve(workbookPath) !== expected.workbookPath) throw new Error('Official STEO source workbook filename must match its SHA-256');
  if (path.resolve(manifestPath) !== expected.manifestPath) throw new Error('Official STEO source manifest filename must match its SHA-256');

  const bytes = fs.readFileSync(workbookPath);
  assertSourceBytes(bytes);
  if (bytes.length !== manifest.byteLength) throw new Error('Official STEO source workbook byte length does not match manifest');
  if (sha256(bytes) !== manifest.sourceArtifactSha256) throw new Error('Official STEO source workbook SHA-256 does not match manifest');
  return manifest;
}

export function writeOfficialSteoSourceArtifact(
  input: OfficialSteoSourceArtifactInput,
  directory: string,
): StoredOfficialSteoSourceArtifact {
  assertSourceIdentity(input.issue, input.sourceArtifactUrl);
  if (Number.isNaN(Date.parse(input.retrievedAt))) throw new Error('Official STEO source retrievedAt must be an ISO-compatible timestamp');
  assertSourceBytes(input.bytes);

  const digest = sha256(input.bytes);
  const paths = artifactPaths(directory, digest);
  const candidate: OfficialSteoSourceArtifactManifest = {
    schemaVersion: 1,
    sourceKind: 'eia-steo-official-archive-xlsx-raw',
    issue: input.issue,
    sourceArtifactUrl: input.sourceArtifactUrl,
    sourceArtifactSha256: digest,
    byteLength: input.bytes.length,
    firstRetrievedAt: input.retrievedAt,
  };

  if (fs.existsSync(paths.workbookPath) || fs.existsSync(paths.manifestPath)) {
    if (!fs.existsSync(paths.workbookPath) || !fs.existsSync(paths.manifestPath)) {
      throw new Error('Official STEO source artifact is incomplete: workbook and manifest must exist together');
    }
    const existing = readOfficialSteoSourceArtifact(paths.workbookPath, paths.manifestPath);
    const stableExisting = { ...existing, firstRetrievedAt: candidate.firstRetrievedAt };
    if (JSON.stringify(stableExisting) !== JSON.stringify(candidate)) {
      throw new Error('Official STEO source artifact SHA already exists with conflicting provenance');
    }
    return { created: false, ...paths, manifest: existing };
  }

  atomicWrite(paths.workbookPath, input.bytes);
  try {
    atomicWrite(paths.manifestPath, `${JSON.stringify(candidate, null, 2)}\n`);
    readOfficialSteoSourceArtifact(paths.workbookPath, paths.manifestPath);
  } catch (error) {
    if (fs.existsSync(paths.manifestPath)) fs.unlinkSync(paths.manifestPath);
    if (fs.existsSync(paths.workbookPath)) fs.unlinkSync(paths.workbookPath);
    throw error;
  }

  return { created: true, ...paths, manifest: candidate };
}
