import path from 'node:path';
import { DOMParser, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { Open } from 'unzipper-esm';
import type { OfficialSteoVintage } from './steo-official-vintage';

const WORKBOOK_PART = 'xl/workbook.xml';
const WORKBOOK_RELS_PART = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml';
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REQUIRED_SHEETS = ['Dates', '3atab'] as const;

export const OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS = {
  maxEntries: 4096,
  maxMemberUncompressedBytes: 128 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 500,
} as const;

export type OfficialSteoMappedPeriodLineage = {
  period: string;
  periodCell: string;
  historicalFlagCell: string;
  supplyCells: string[];
  demandCells: string[];
};

export type OfficialSteoWorkbookLineage = {
  schemaVersion: 1;
  relationshipPolicy: 'required-sheets-must-use-safe-internal-worksheet-relationships-v1';
  formulaPolicy: 'mapped-cells-must-not-be-formula-backed-v1';
  archiveLimits: typeof OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS;
  sheets: {
    Dates: string;
    '3atab': string;
  };
  metadata: {
    issueCell: 'Dates!D1';
    modelingCompletedCell: 'Dates!D2';
    historicalThroughCell: 'Dates!D7';
  };
  periods: OfficialSteoMappedPeriodLineage[];
};

type StructuralCell = {
  ref: string;
  row: number;
  column: string;
  type: string | null;
  value: string | number | boolean | null;
  hasFormula: boolean;
};

type StructuralSheet = {
  name: (typeof REQUIRED_SHEETS)[number];
  part: string;
  cells: Map<string, StructuralCell>;
};

export type OfficialSteoWorkbookStructure = {
  sheets: {
    Dates: StructuralSheet;
    '3atab': StructuralSheet;
  };
};

function localName(node: XmlElement) {
  return node.localName || node.nodeName.split(':').pop() || node.nodeName;
}

function descendants(parent: XmlDocument | XmlElement, name: string): XmlElement[] {
  const nodes = parent.getElementsByTagName('*');
  const result: XmlElement[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes.item(index);
    if (node && localName(node) === name) result.push(node);
  }
  return result;
}

function parseXml(xml: string, label: string): XmlDocument {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (!document?.documentElement) throw new Error('document has no root element');
    const parserErrors = descendants(document, 'parsererror');
    if (parserErrors.length) throw new Error(parserErrors[0].textContent || 'XML parser error');
    return document;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Official STEO XLSX ${label} is malformed XML: ${detail}`);
  }
}

function assertSafeMemberPath(memberPath: string) {
  if (!memberPath || memberPath.includes('\\') || memberPath.startsWith('/') || /^[A-Za-z]:/.test(memberPath)) {
    throw new Error(`Official STEO XLSX contains unsafe member path: ${memberPath || '<empty>'}`);
  }
  const segments = memberPath.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Official STEO XLSX contains unsafe member path: ${memberPath}`);
  }
  const normalized = path.posix.normalize(memberPath);
  if (normalized !== memberPath || normalized.startsWith('../')) {
    throw new Error(`Official STEO XLSX contains non-canonical member path: ${memberPath}`);
  }
}

function relationshipTargetPart(target: string) {
  const trimmed = target.trim();
  if (!trimmed || trimmed.includes('\\') || trimmed.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    throw new Error(`Official STEO XLSX worksheet relationship has unsafe target: ${target || '<empty>'}`);
  }
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Official STEO XLSX worksheet relationship traversal is not allowed: ${target}`);
  }
  const resolved = path.posix.normalize(path.posix.join('xl', trimmed));
  if (!resolved.startsWith('xl/') || resolved.includes('/../')) {
    throw new Error(`Official STEO XLSX worksheet relationship escapes xl/: ${target}`);
  }
  return resolved;
}

function columnFromRef(ref: string) {
  const match = ref.match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) throw new Error(`Official STEO XLSX has malformed cell reference: ${ref}`);
  return { column: match[1], row: Number(match[2]) };
}

function columnName(index: number) {
  if (!Number.isSafeInteger(index) || index < 1) throw new Error(`Invalid Excel column index: ${index}`);
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function directChild(element: XmlElement, name: string): XmlElement | undefined {
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index);
    if (child?.nodeType === 1 && localName(child as XmlElement) === name) return child as XmlElement;
  }
  return undefined;
}

function textRuns(element: XmlElement) {
  return descendants(element, 't').map((node) => node.textContent ?? '').join('');
}

function decodeSharedStrings(xml: string | undefined) {
  if (!xml) return [] as string[];
  const document = parseXml(xml, 'sharedStrings.xml');
  return descendants(document, 'si').map((item) => textRuns(item));
}

function decodeCell(cell: XmlElement, sharedStrings: string[]): StructuralCell {
  const ref = cell.getAttribute('r')?.toUpperCase() ?? '';
  const { column, row } = columnFromRef(ref);
  const type = cell.getAttribute('t');
  const formula = directChild(cell, 'f');
  const rawValue = directChild(cell, 'v')?.textContent ?? null;
  let value: StructuralCell['value'] = null;

  if (type === 'inlineStr') {
    const inline = directChild(cell, 'is');
    value = inline ? textRuns(inline) : '';
  } else if (type === 's') {
    const index = Number(rawValue);
    if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
      throw new Error(`Official STEO XLSX ${ref} has invalid shared-string index`);
    }
    value = sharedStrings[index];
  } else if (type === 'b') {
    if (rawValue !== '0' && rawValue !== '1') throw new Error(`Official STEO XLSX ${ref} has invalid boolean value`);
    value = rawValue === '1';
  } else if (type === 'str' || type === 'd' || type === 'e') {
    value = rawValue ?? '';
  } else if (rawValue !== null && rawValue !== '') {
    const numeric = Number(rawValue);
    value = Number.isFinite(numeric) ? numeric : rawValue;
  }

  return { ref, row, column, type, value, hasFormula: Boolean(formula) };
}

function parseSheet(name: (typeof REQUIRED_SHEETS)[number], part: string, xml: string, sharedStrings: string[]): StructuralSheet {
  const document = parseXml(xml, `${name} worksheet`);
  const cells = new Map<string, StructuralCell>();
  for (const element of descendants(document, 'c')) {
    const cell = decodeCell(element, sharedStrings);
    if (cells.has(cell.ref)) throw new Error(`Official STEO XLSX ${name} contains duplicate cell ${cell.ref}`);
    cells.set(cell.ref, cell);
  }
  return { name, part, cells };
}

function requiredCell(sheet: StructuralSheet, ref: string) {
  const cell = sheet.cells.get(ref);
  if (!cell) throw new Error(`Official STEO XLSX is missing mapped cell ${sheet.name}!${ref}`);
  if (cell.hasFormula) {
    throw new Error(`Official STEO XLSX mapped cell ${sheet.name}!${ref} is formula-backed; cached formula values are not accepted`);
  }
  return cell;
}

function requirePresent(sheet: StructuralSheet, ref: string) {
  const cell = requiredCell(sheet, ref);
  if (cell.value === null || cell.value === '') throw new Error(`Official STEO XLSX mapped cell ${sheet.name}!${ref} is empty`);
  return cell;
}

function requireNumeric(sheet: StructuralSheet, ref: string) {
  const cell = requirePresent(sheet, ref);
  const numeric = typeof cell.value === 'number' ? cell.value : Number(String(cell.value).trim());
  if (!Number.isFinite(numeric)) throw new Error(`Official STEO XLSX mapped cell ${sheet.name}!${ref} must be numeric`);
  return cell;
}

function stringValue(cell: StructuralCell) {
  return String(cell.value ?? '').trim();
}

function findSeriesRows(sheet: StructuralSheet, seriesId: string) {
  const rows = [...sheet.cells.values()]
    .filter((cell) => cell.column === 'A' && stringValue(cell).toUpperCase() === seriesId)
    .map((cell) => cell.row)
    .sort((left, right) => left - right);
  if (!rows.length) throw new Error(`Official STEO XLSX structural mapping is missing ${seriesId} in 3atab column A`);
  return rows;
}

async function safeZipParts(buffer: Buffer) {
  let archive: Awaited<ReturnType<typeof Open.buffer>>;
  try {
    archive = await Open.buffer(buffer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Official STEO XLSX central directory is invalid: ${detail}`);
  }

  if (archive.files.length > OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS.maxEntries) {
    throw new Error(`Official STEO XLSX contains too many ZIP members (${archive.files.length})`);
  }

  const entries = new Map<string, (typeof archive.files)[number]>();
  let totalUncompressed = 0;
  for (const entry of archive.files) {
    const memberPath = entry.path;
    assertSafeMemberPath(memberPath);
    if (entries.has(memberPath)) throw new Error(`Official STEO XLSX contains duplicate ZIP member: ${memberPath}`);
    entries.set(memberPath, entry);

    if (entry.type === 'Directory' || memberPath.endsWith('/')) continue;
    const uncompressed = Number(entry.uncompressedSize);
    const compressed = Number(entry.compressedSize);
    if (!Number.isSafeInteger(uncompressed) || uncompressed < 0 || !Number.isSafeInteger(compressed) || compressed < 0) {
      throw new Error(`Official STEO XLSX member ${memberPath} has invalid ZIP size metadata`);
    }
    if (uncompressed > OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS.maxMemberUncompressedBytes) {
      throw new Error(`Official STEO XLSX member ${memberPath} exceeds the uncompressed-size limit`);
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS.maxTotalUncompressedBytes) {
      throw new Error('Official STEO XLSX exceeds the total uncompressed-size limit');
    }
    if (uncompressed > 0) {
      if (compressed <= 0) throw new Error(`Official STEO XLSX member ${memberPath} has impossible compression metadata`);
      const ratio = uncompressed / compressed;
      if (ratio > OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS.maxCompressionRatio) {
        throw new Error(`Official STEO XLSX member ${memberPath} exceeds the compression-ratio limit`);
      }
    }
  }

  async function readPart(memberPath: string, required = true) {
    const entry = entries.get(memberPath);
    if (!entry) {
      if (!required) return undefined;
      throw new Error(`Official STEO XLSX is missing required ZIP member ${memberPath}`);
    }
    try {
      return (await entry.buffer()).toString('utf8');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Official STEO XLSX could not expand ${memberPath}: ${detail}`);
    }
  }

  return { entries, readPart };
}

function resolveRequiredSheetParts(workbookXml: string, relationshipsXml: string) {
  const workbook = parseXml(workbookXml, 'workbook.xml');
  const relationships = parseXml(relationshipsXml, 'workbook relationships');

  const relationshipById = new Map<string, XmlElement>();
  for (const relationship of descendants(relationships, 'Relationship')) {
    const id = relationship.getAttribute('Id') ?? '';
    if (!id) continue;
    if (relationshipById.has(id)) throw new Error(`Official STEO XLSX has duplicate workbook relationship ${id}`);
    relationshipById.set(id, relationship);
  }

  const result = {} as Record<(typeof REQUIRED_SHEETS)[number], string>;
  for (const requiredName of REQUIRED_SHEETS) {
    const sheets = descendants(workbook, 'sheet').filter((sheet) => sheet.getAttribute('name') === requiredName);
    if (sheets.length !== 1) {
      throw new Error(`Official STEO XLSX must contain exactly one ${requiredName} worksheet; found ${sheets.length}`);
    }
    const sheet = sheets[0];
    const relationshipId = sheet.getAttributeNS(RELATIONSHIP_NS, 'id') || sheet.getAttribute('r:id') || '';
    if (!relationshipId) throw new Error(`Official STEO XLSX ${requiredName} worksheet has no relationship id`);
    const relationship = relationshipById.get(relationshipId);
    if (!relationship) throw new Error(`Official STEO XLSX ${requiredName} worksheet relationship ${relationshipId} is missing`);
    if ((relationship.getAttribute('TargetMode') ?? '').toLowerCase() === 'external') {
      throw new Error(`Official STEO XLSX ${requiredName} worksheet relationship must not be external`);
    }
    const relationshipType = relationship.getAttribute('Type') ?? '';
    if (!relationshipType.endsWith('/worksheet')) {
      throw new Error(`Official STEO XLSX ${requiredName} relationship is not a worksheet relationship`);
    }
    result[requiredName] = relationshipTargetPart(relationship.getAttribute('Target') ?? '');
  }
  return result;
}

export async function inspectOfficialSteoWorkbookStructure(buffer: Buffer): Promise<OfficialSteoWorkbookStructure> {
  const zip = await safeZipParts(buffer);
  const [workbookXml, relationshipsXml, sharedStringsXml] = await Promise.all([
    zip.readPart(WORKBOOK_PART),
    zip.readPart(WORKBOOK_RELS_PART),
    zip.readPart(SHARED_STRINGS_PART, false),
  ]);
  const parts = resolveRequiredSheetParts(workbookXml!, relationshipsXml!);
  for (const requiredName of REQUIRED_SHEETS) {
    if (!zip.entries.has(parts[requiredName])) {
      throw new Error(`Official STEO XLSX ${requiredName} relationship points to missing member ${parts[requiredName]}`);
    }
  }
  const sharedStrings = decodeSharedStrings(sharedStringsXml);
  const [datesXml, balanceXml] = await Promise.all([
    zip.readPart(parts.Dates),
    zip.readPart(parts['3atab']),
  ]);
  return {
    sheets: {
      Dates: parseSheet('Dates', parts.Dates, datesXml!, sharedStrings),
      '3atab': parseSheet('3atab', parts['3atab'], balanceXml!, sharedStrings),
    },
  };
}

export function buildOfficialSteoWorkbookLineage(
  structure: OfficialSteoWorkbookStructure,
  vintage: OfficialSteoVintage,
): OfficialSteoWorkbookLineage {
  const dates = structure.sheets.Dates;
  const balance = structure.sheets['3atab'];
  requirePresent(dates, 'D1');
  requirePresent(dates, 'D2');
  requirePresent(dates, 'D7');

  const supplyRows = findSeriesRows(balance, 'PAPR_WORLD');
  const demandRows = findSeriesRows(balance, 'PATC_WORLD');
  const periods = vintage.revisionBasis.map((point, index) => {
    const column = columnName(index + 3);
    const periodRef = `${column}11`;
    const flagRef = `${column}13`;
    requireNumeric(dates, periodRef);
    requireNumeric(dates, flagRef);
    const supplyCells = supplyRows.map((row) => {
      const ref = `${column}${row}`;
      requireNumeric(balance, ref);
      return `3atab!${ref}`;
    });
    const demandCells = demandRows.map((row) => {
      const ref = `${column}${row}`;
      requireNumeric(balance, ref);
      return `3atab!${ref}`;
    });
    return {
      period: point.period,
      periodCell: `Dates!${periodRef}`,
      historicalFlagCell: `Dates!${flagRef}`,
      supplyCells,
      demandCells,
    };
  });

  return {
    schemaVersion: 1,
    relationshipPolicy: 'required-sheets-must-use-safe-internal-worksheet-relationships-v1',
    formulaPolicy: 'mapped-cells-must-not-be-formula-backed-v1',
    archiveLimits: OFFICIAL_STEO_XLSX_STRUCTURE_LIMITS,
    sheets: { Dates: dates.part, '3atab': balance.part },
    metadata: {
      issueCell: 'Dates!D1',
      modelingCompletedCell: 'Dates!D2',
      historicalThroughCell: 'Dates!D7',
    },
    periods,
  };
}
