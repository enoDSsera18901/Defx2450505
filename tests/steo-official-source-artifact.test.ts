import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readOfficialSteoSourceArtifact,
  writeOfficialSteoSourceArtifact,
} from '../lib/steo-official-source-artifact';

const URL = 'https://www.eia.gov/outlooks/steo/archives/aug26_base.xlsx';

function syntheticXlsx(label = 'source-state-a') {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`synthetic-test-only:${label}`)]);
}

test('raw official workbook retention is content-addressed and repeat retrieval is idempotent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-source-'));
  const bytes = syntheticXlsx();
  const first = writeOfficialSteoSourceArtifact({
    issue: '2026-08',
    sourceArtifactUrl: URL,
    retrievedAt: '2026-09-07T00:00:00Z',
    bytes,
  }, directory);
  const repeat = writeOfficialSteoSourceArtifact({
    issue: '2026-08',
    sourceArtifactUrl: URL,
    retrievedAt: '2026-09-08T00:00:00Z',
    bytes,
  }, directory);

  assert.equal(first.created, true);
  assert.equal(repeat.created, false);
  assert.equal(first.workbookPath, repeat.workbookPath);
  assert.equal(first.manifestPath, repeat.manifestPath);
  assert.equal(repeat.manifest.firstRetrievedAt, '2026-09-07T00:00:00Z');
  assert.equal(fs.readFileSync(first.workbookPath).equals(bytes), true);
  assert.deepEqual(readOfficialSteoSourceArtifact(first.workbookPath, first.manifestPath), first.manifest);
});

test('tampered retained workbook fails SHA-256 verification', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-source-'));
  const stored = writeOfficialSteoSourceArtifact({
    issue: '2026-08',
    sourceArtifactUrl: URL,
    retrievedAt: '2026-09-07T00:00:00Z',
    bytes: syntheticXlsx(),
  }, directory);

  fs.writeFileSync(stored.workbookPath, syntheticXlsx('tampered-state'));
  assert.throws(
    () => readOfficialSteoSourceArtifact(stored.workbookPath, stored.manifestPath),
    /byte length does not match manifest|SHA-256 does not match manifest/,
  );
});

test('source identity and payload checks fail closed before retention', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-source-'));

  assert.throws(
    () => writeOfficialSteoSourceArtifact({
      issue: '2026-07',
      sourceArtifactUrl: URL,
      retrievedAt: '2026-09-07T00:00:00Z',
      bytes: syntheticXlsx(),
    }, directory),
    /URL issue 2026-08 does not match 2026-07/,
  );

  assert.throws(
    () => writeOfficialSteoSourceArtifact({
      issue: '2026-08',
      sourceArtifactUrl: 'https://example.com/aug26_base.xlsx',
      retrievedAt: '2026-09-07T00:00:00Z',
      bytes: syntheticXlsx(),
    }, directory),
    /canonical EIA archive XLSX URL/,
  );

  assert.throws(
    () => writeOfficialSteoSourceArtifact({
      issue: '2026-08',
      sourceArtifactUrl: URL,
      retrievedAt: '2026-09-07T00:00:00Z',
      bytes: Buffer.from('<html>not a workbook</html>'),
    }, directory),
    /not an XLSX\/ZIP file/,
  );
});

test('content-addressed filenames are part of the evidence contract', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-source-'));
  const stored = writeOfficialSteoSourceArtifact({
    issue: '2026-08',
    sourceArtifactUrl: URL,
    retrievedAt: '2026-09-07T00:00:00Z',
    bytes: syntheticXlsx(),
  }, directory);
  const renamedWorkbook = path.join(directory, `wrong-${path.basename(stored.workbookPath)}`);
  fs.copyFileSync(stored.workbookPath, renamedWorkbook);

  assert.throws(
    () => readOfficialSteoSourceArtifact(renamedWorkbook, stored.manifestPath),
    /workbook filename must match its SHA-256/,
  );
});
