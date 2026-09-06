import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  listOfficialSteoVintages,
  parseOfficialSteoVintage,
  readOfficialSteoVintage,
  writeOfficialSteoVintage,
  type OfficialSteoVintageParseInput,
} from '../lib/steo-official-vintage';

function fixture(overrides: Partial<OfficialSteoVintageParseInput> = {}): OfficialSteoVintageParseInput {
  const datesRows: unknown[][] = Array.from({ length: 13 }, () => []);
  datesRows[0][3] = 'August 2026';
  datesRows[1][3] = new Date('2026-08-06T00:00:00Z');
  datesRows[6][3] = 202607;
  datesRows[10] = [null, 'AAAA_DATEX or AAAA_YEAR', 202606, 202607, 202608, 202609];
  datesRows[12] = [null, 'Historical', 1, 1, 0, 0];

  const supply = ['papr_world', 'World total', 98.97399653, 101.02549124, 98.291315677, 99.678433243];
  const balanceRows: unknown[][] = [
    ['header'],
    supply,
    ['papr_world', 'World total duplicate', ...supply.slice(2)],
    ['patc_world', 'World total', 101.72206142, 101.48441759, 104.430551, 104.61642769],
  ];

  return {
    datesRows,
    balanceRows,
    issue: '2026-08',
    releaseDate: '2026-08-11',
    importedAt: '2026-09-07T00:00:00Z',
    sourceArtifactUrl: 'https://www.eia.gov/outlooks/steo/archives/aug26_base.xlsx',
    sourceArtifactSha256: 'a'.repeat(64),
    ...overrides,
  };
}

test('parses source-native historical and forecast classifications from an official STEO workbook', () => {
  const vintage = parseOfficialSteoVintage(fixture());

  assert.equal(vintage.issue, '2026-08');
  assert.equal(vintage.releaseDate, '2026-08-11');
  assert.equal(vintage.modelingCompletedDate, '2026-08-06');
  assert.equal(vintage.historicalThroughPeriod, '2026-07');
  assert.equal(vintage.sourceArtifactName, 'aug26_base.xlsx');
  assert.match(vintage.revisionFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(vintage.historical.map((point) => point.period), ['2026-06', '2026-07']);
  assert.ok(vintage.historical.every((point) => point.classification === 'historical-public-estimate'));
  assert.deepEqual(vintage.forecast.map((point) => point.period), ['2026-08', '2026-09']);
  assert.ok(vintage.forecast.every((point) => point.classification === 'forecast'));
  assert.deepEqual(vintage.revisionBasis.map((point) => point.balanceMbpd), [-2.75, -0.46, -6.14, -4.94]);
});

test('rejects conflicting duplicate PAPR_WORLD rows rather than guessing which row is authoritative', () => {
  const input = fixture();
  input.balanceRows[2][5] = 123;
  assert.throws(() => parseOfficialSteoVintage(input), /conflicting duplicate PAPR_WORLD rows/);
});

test('rejects a source-native historical boundary that does not match the workbook issue', () => {
  const input = fixture();
  input.datesRows[12] = [null, 'Historical', 1, 0, 0, 0];
  assert.throws(() => parseOfficialSteoVintage(input), /First source-labelled forecast period 2026-07 does not match issue 2026-08/);
});

test('rejects metadata that points an August workbook at a different issue', () => {
  assert.throws(
    () => parseOfficialSteoVintage(fixture({ issue: '2026-07', releaseDate: '2026-07-07' })),
    /Archive filename issue 2026-08 does not match requested issue 2026-07/,
  );
});

test('stores official vintages immutably by release date and raw source artifact SHA-256', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-official-steo-'));
  const vintage = parseOfficialSteoVintage(fixture());
  const first = writeOfficialSteoVintage(vintage, directory);
  const second = writeOfficialSteoVintage(vintage, directory);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(path.basename(first.path), `2026-08-11_${'a'.repeat(64)}.json`);
  assert.deepEqual(readOfficialSteoVintage(first.path), vintage);
  assert.deepEqual(listOfficialSteoVintages(directory).map((item) => item.issue), ['2026-08']);
});

test('rejects a valid vintage JSON stored under a misleading provenance filename', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-official-steo-'));
  const vintage = parseOfficialSteoVintage(fixture());
  const wrongPath = path.join(directory, `2026-08-11_${'b'.repeat(64)}.json`);
  fs.writeFileSync(wrongPath, JSON.stringify(vintage), 'utf8');
  assert.throws(() => readOfficialSteoVintage(wrongPath), /filename must match provenance identity/);
});
