import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  buildOfficialSteoWorkbookLineage,
  inspectOfficialSteoWorkbookStructure,
} from '../lib/steo-official-xlsx-structure';
import { parseOfficialSteoVintage, type OfficialSteoVintageParseInput } from '../lib/steo-official-vintage';

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dates" sheetId="1" r:id="rId1"/>
    <sheet name="3atab" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

const RELATIONSHIPS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`;

const DATES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="D1" t="inlineStr"><is><t>August 2026</t></is></c></row>
    <row r="2"><c r="D2"><v>46240</v></c></row>
    <row r="7"><c r="D7"><v>202607</v></c></row>
    <row r="11">
      <c r="C11"><v>202606</v></c><c r="D11"><v>202607</v></c><c r="E11"><v>202608</v></c><c r="F11"><v>202609</v></c>
    </row>
    <row r="13">
      <c r="C13"><v>1</v></c><c r="D13"><v>1</v></c><c r="E13"><v>0</v></c><c r="F13"><v>0</v></c>
    </row>
  </sheetData>
</worksheet>`;

const BALANCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="2"><c r="A2" t="inlineStr"><is><t>PAPR_WORLD</t></is></c><c r="C2"><v>98.97399653</v></c><c r="D2"><v>101.02549124</v></c><c r="E2"><v>98.291315677</v></c><c r="F2"><v>99.678433243</v></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>PATC_WORLD</t></is></c><c r="C4"><v>101.72206142</v></c><c r="D4"><v>101.48441759</v></c><c r="E4"><v>104.430551</v></c><c r="F4"><v>104.61642769</v></c></row>
  </sheetData>
</worksheet>`;

function zipWorkbook(overrides: {
  workbookXml?: string;
  relationshipsXml?: string;
  datesXml?: string;
  balanceXml?: string;
  extra?: Zippable;
} = {}) {
  const members: Zippable = {
    'xl/workbook.xml': strToU8(overrides.workbookXml ?? WORKBOOK_XML),
    'xl/_rels/workbook.xml.rels': strToU8(overrides.relationshipsXml ?? RELATIONSHIPS_XML),
    'xl/worksheets/sheet1.xml': strToU8(overrides.datesXml ?? DATES_XML),
    'xl/worksheets/sheet2.xml': strToU8(overrides.balanceXml ?? BALANCE_XML),
    ...(overrides.extra ?? {}),
  };
  return Buffer.from(zipSync(members, { level: 9 }));
}

function semanticVintage() {
  const datesRows: unknown[][] = Array.from({ length: 13 }, () => []);
  datesRows[0][3] = 'August 2026';
  datesRows[1][3] = new Date('2026-08-06T00:00:00Z');
  datesRows[6][3] = 202607;
  datesRows[10] = [null, 'AAAA_DATEX or AAAA_YEAR', 202606, 202607, 202608, 202609];
  datesRows[12] = [null, 'Historical', 1, 1, 0, 0];
  const input: OfficialSteoVintageParseInput = {
    datesRows,
    balanceRows: [
      ['PAPR_WORLD', 'World total', 98.97399653, 101.02549124, 98.291315677, 99.678433243],
      ['PATC_WORLD', 'World total', 101.72206142, 101.48441759, 104.430551, 104.61642769],
    ],
    issue: '2026-08',
    releaseDate: '2026-08-11',
    importedAt: '2026-09-07T00:00:00Z',
    sourceArtifactUrl: 'https://www.eia.gov/outlooks/steo/archives/aug26_base.xlsx',
    sourceArtifactSha256: 'a'.repeat(64),
  };
  return parseOfficialSteoVintage(input);
}

test('resolves required worksheets through internal relationships and emits exact mapped cell lineage', async () => {
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook());
  const lineage = buildOfficialSteoWorkbookLineage(structure, semanticVintage());

  assert.deepEqual(lineage.sheets, {
    Dates: 'xl/worksheets/sheet1.xml',
    '3atab': 'xl/worksheets/sheet2.xml',
  });
  assert.deepEqual(lineage.metadata, {
    issueCell: 'Dates!D1',
    modelingCompletedCell: 'Dates!D2',
    historicalThroughCell: 'Dates!D7',
    historicalThroughFormula: null,
  });
  assert.deepEqual(lineage.periods[0], {
    period: '2026-06',
    periodCell: 'Dates!C11',
    periodFormula: null,
    historicalFlagCell: 'Dates!C13',
    supplyCells: ['3atab!C2'],
    demandCells: ['3atab!C4'],
  });
  assert.equal(lineage.periods.at(-1)?.periodCell, 'Dates!F11');
});

test('accepts a formula-backed Dates!D7 only when its cached value matches the independently validated boundary', async () => {
  const datesXml = DATES_XML.replace(
    '<c r="D7"><v>202607</v></c>',
    '<c r="D7"><f>MAX(C11:F11*(C13:F13=1))</f><v>202607</v></c>',
  );
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ datesXml }));
  const lineage = buildOfficialSteoWorkbookLineage(structure, semanticVintage());
  assert.equal(lineage.metadata.historicalThroughFormula, 'MAX(C11:F11*(C13:F13=1))');
  assert.equal(
    lineage.formulaPolicy,
    'economic-values-and-flags-reject-formulas;Dates-row11-and-D7-cache-require-independent-crosschecks-v1',
  );
});

test('rejects a formula-backed Dates!D7 when its cached value disagrees with the validated historical boundary', async () => {
  const datesXml = DATES_XML.replace(
    '<c r="D7"><v>202607</v></c>',
    '<c r="D7"><f>202606</f><v>202606</v></c>',
  );
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ datesXml }));
  assert.throws(
    () => buildOfficialSteoWorkbookLineage(structure, semanticVintage()),
    /D7 cached value does not match the independently validated historical flag boundary/,
  );
});

test('accepts formula-backed row-11 period caches only when they match the issue-anchored monthly sequence', async () => {
  const datesXml = DATES_XML.replace(
    '<c r="C11"><v>202606</v></c>',
    '<c r="C11"><f>EDATE(E11,-2)</f><v>202606</v></c>',
  );
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ datesXml }));
  const lineage = buildOfficialSteoWorkbookLineage(structure, semanticVintage());
  assert.equal(lineage.periods[0].periodFormula, 'EDATE(E11,-2)');
});

test('rejects a formula-backed row-11 period cache that breaks the issue-anchored monthly sequence', async () => {
  const datesXml = DATES_XML.replace(
    '<c r="C11"><v>202606</v></c>',
    '<c r="C11"><f>202605</f><v>202605</v></c>',
  );
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ datesXml }));
  assert.throws(
    () => buildOfficialSteoWorkbookLineage(structure, semanticVintage()),
    /Dates!C11 does not match the issue-anchored monthly period sequence/,
  );
});

test('rejects external worksheet relationships', async () => {
  const relationshipsXml = RELATIONSHIPS_XML.replace(
    'Target="worksheets/sheet1.xml"',
    'Target="https://example.invalid/sheet.xml" TargetMode="External"',
  );
  await assert.rejects(
    inspectOfficialSteoWorkbookStructure(zipWorkbook({ relationshipsXml })),
    /worksheet relationship must not be external/,
  );
});

test('rejects traversal worksheet relationship targets', async () => {
  const relationshipsXml = RELATIONSHIPS_XML.replace('Target="worksheets/sheet1.xml"', 'Target="../sheet1.xml"');
  await assert.rejects(
    inspectOfficialSteoWorkbookStructure(zipWorkbook({ relationshipsXml })),
    /relationship traversal is not allowed/,
  );
});

test('rejects a missing required Dates worksheet mapping', async () => {
  const workbookXml = WORKBOOK_XML.replace('name="Dates"', 'name="DatesRenamed"');
  await assert.rejects(
    inspectOfficialSteoWorkbookStructure(zipWorkbook({ workbookXml })),
    /exactly one Dates worksheet; found 0/,
  );
});

test('rejects formula-backed mapped series evidence even when a cached value exists', async () => {
  const balanceXml = BALANCE_XML.replace('<c r="C2"><v>98.97399653</v></c>', '<c r="C2"><f>97+1.97399653</f><v>98.97399653</v></c>');
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ balanceXml }));
  assert.throws(
    () => buildOfficialSteoWorkbookLineage(structure, semanticVintage()),
    /3atab!C2 is formula-backed; cached formula values are not accepted/,
  );
});

test('rejects nonnumeric mapped series values', async () => {
  const balanceXml = BALANCE_XML.replace(
    '<c r="C2"><v>98.97399653</v></c>',
    '<c r="C2" t="inlineStr"><is><t>not-a-number</t></is></c>',
  );
  const structure = await inspectOfficialSteoWorkbookStructure(zipWorkbook({ balanceXml }));
  assert.throws(
    () => buildOfficialSteoWorkbookLineage(structure, semanticVintage()),
    /3atab!C2 must be numeric/,
  );
});

test('rejects a suspiciously high-compression ZIP member before worksheet expansion', async () => {
  const repetitive = strToU8('A'.repeat(2_000_000));
  await assert.rejects(
    inspectOfficialSteoWorkbookStructure(zipWorkbook({ extra: { 'xl/suspicious.xml': repetitive } })),
    /exceeds the compression-ratio limit/,
  );
});

test('rejects a worksheet relationship that resolves to a missing member', async () => {
  const relationshipsXml = RELATIONSHIPS_XML.replace('Target="worksheets/sheet2.xml"', 'Target="worksheets/missing.xml"');
  await assert.rejects(
    inspectOfficialSteoWorkbookStructure(zipWorkbook({ relationshipsXml })),
    /3atab relationship points to missing member/,
  );
});
