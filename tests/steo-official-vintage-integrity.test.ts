import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeVerifiedOfficialSteoVintage } from '../lib/steo-official-vintage-integrity';
import { parseOfficialSteoVintage, type OfficialSteoVintageParseInput } from '../lib/steo-official-vintage';

function fixture(importedAt: string, supplyOverride?: number): OfficialSteoVintageParseInput {
  const datesRows: unknown[][] = Array.from({ length: 13 }, () => []);
  datesRows[0][3] = 'August 2026';
  datesRows[1][3] = new Date('2026-08-06T00:00:00Z');
  datesRows[6][3] = 202607;
  datesRows[10] = [null, 'AAAA_DATEX or AAAA_YEAR', 202606, 202607, 202608, 202609];
  datesRows[12] = [null, 'Historical', 1, 1, 0, 0];

  const supply = ['papr_world', 'World total', 98.97399653, 101.02549124, supplyOverride ?? 98.291315677, 99.678433243];
  const balanceRows: unknown[][] = [
    supply,
    ['papr_world', 'World total duplicate', ...supply.slice(2)],
    ['patc_world', 'World total', 101.72206142, 101.48441759, 104.430551, 104.61642769],
  ];

  return {
    datesRows,
    balanceRows,
    issue: '2026-08',
    releaseDate: '2026-08-11',
    importedAt,
    sourceArtifactUrl: 'https://www.eia.gov/outlooks/steo/archives/aug26_base.xlsx',
    sourceArtifactSha256: 'a'.repeat(64),
  };
}

test('repeat retrieval of the same normalized source artifact is idempotent despite importedAt changing', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-integrity-'));
  const first = parseOfficialSteoVintage(fixture('2026-09-07T00:00:00Z'));
  const repeat = parseOfficialSteoVintage(fixture('2026-09-08T00:00:00Z'));

  assert.equal(writeVerifiedOfficialSteoVintage(first, directory).created, true);
  assert.equal(writeVerifiedOfficialSteoVintage(repeat, directory).created, false);
});

test('same raw source SHA cannot silently retain different normalized source-derived values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbarrel-steo-integrity-'));
  const first = parseOfficialSteoVintage(fixture('2026-09-07T00:00:00Z'));
  const changedNormalization = parseOfficialSteoVintage(fixture('2026-09-08T00:00:00Z', 99.291315677));

  writeVerifiedOfficialSteoVintage(first, directory);
  assert.throws(
    () => writeVerifiedOfficialSteoVintage(changedNormalization, directory),
    /different normalized content; parser\/source semantics changed and require explicit review/,
  );
});
