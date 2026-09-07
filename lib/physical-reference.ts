import type {
  CargoObservation,
  FreightObservation,
  PortEvent,
  RouteEstimate,
} from './physical-data';

export const PHYSICAL_REFERENCE_KINDS = ['commodity', 'grade', 'location'] as const;
export type PhysicalReferenceKind = (typeof PHYSICAL_REFERENCE_KINDS)[number];

export const COMMODITY_FAMILIES = ['crude_oil', 'condensate', 'refined_product', 'other'] as const;
export const LOCATION_TYPES = ['port', 'terminal', 'country', 'region', 'other'] as const;

export type CommodityReference = {
  kind: 'commodity';
  id: string;
  name: string;
  aliases?: string[];
  family: (typeof COMMODITY_FAMILIES)[number];
};

export type GradeReference = {
  kind: 'grade';
  id: string;
  name: string;
  aliases?: string[];
  commodityId: string;
  countryCode?: string | null;
};

export type LocationReference = {
  kind: 'location';
  id: string;
  name: string;
  aliases?: string[];
  locationType: (typeof LOCATION_TYPES)[number];
  unlocode?: string | null;
  countryCode?: string | null;
};

export type PhysicalReference = CommodityReference | GradeReference | LocationReference;

export type PhysicalReferenceCatalog = {
  schemaVersion: 1;
  references: PhysicalReference[];
};

export const REFERENCE_RESOLUTION_METHOD = 'deterministic-physical-reference-resolution-v1' as const;

export type ReferenceMatchBasis = 'canonical_id' | 'unlocode' | 'canonical_name' | 'alias';

export type ResolvedPhysicalReference = {
  status: 'resolved';
  kind: PhysicalReferenceKind;
  rawValue: string;
  canonicalId: string;
  canonicalName: string;
  matchBasis: ReferenceMatchBasis;
  evidenceClass: 'derived';
  methodId: typeof REFERENCE_RESOLUTION_METHOD;
  sourceRecordIds: string[];
  asOf: string | null;
};

export type AmbiguousPhysicalReference = {
  status: 'ambiguous';
  kind: PhysicalReferenceKind;
  rawValue: string;
  candidateIds: string[];
  candidateNames: string[];
  matchedBasis: Exclude<ReferenceMatchBasis, 'canonical_id'>;
  methodId: typeof REFERENCE_RESOLUTION_METHOD;
  sourceRecordIds: string[];
  asOf: string | null;
  reason: string;
};

export type UnresolvedPhysicalReference = {
  status: 'unresolved';
  kind: PhysicalReferenceKind;
  rawValue: string;
  methodId: typeof REFERENCE_RESOLUTION_METHOD;
  sourceRecordIds: string[];
  asOf: string | null;
  reason: string;
};

export type PhysicalReferenceResolution =
  | ResolvedPhysicalReference
  | AmbiguousPhysicalReference
  | UnresolvedPhysicalReference;

export type CargoReferenceResolution = {
  cargoId: string;
  commodity: PhysicalReferenceResolution | null;
  grade: PhysicalReferenceResolution | null;
  loadLocation: PhysicalReferenceResolution | null;
  destinationLocation: PhysicalReferenceResolution | null;
  dischargeLocation: PhysicalReferenceResolution | null;
};

export type RouteReferenceResolution = {
  routeId: string;
  originLocation: PhysicalReferenceResolution | null;
  destinationLocation: PhysicalReferenceResolution | null;
};

export type PortEventReferenceResolution = {
  eventId: string;
  portLocation: PhysicalReferenceResolution;
};

export type FreightReferenceResolution = {
  freightId: string;
  originLocation: PhysicalReferenceResolution | null;
  destinationLocation: PhysicalReferenceResolution | null;
};

const ID_PATTERN = /^(commodity|grade|location):[a-z0-9][a-z0-9._-]*$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const oneOf = (value: unknown, allowed: readonly string[]) => typeof value === 'string' && allowed.includes(value);

function normalizedKey(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[._/\\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values)];
}

function validateAliases(reference: PhysicalReference, errors: string[]) {
  if (reference.aliases == null) return;
  if (!Array.isArray(reference.aliases) || reference.aliases.some((alias) => !nonEmpty(alias))) {
    errors.push(`${reference.id}.aliases must contain only non-empty strings`);
    return;
  }
  const normalized = reference.aliases.map((alias) => normalizedKey(alias));
  if (new Set(normalized).size !== normalized.length) errors.push(`${reference.id}.aliases contains duplicate normalized values`);
}

export function validatePhysicalReferenceCatalog(catalog: PhysicalReferenceCatalog): string[] {
  const errors: string[] = [];
  if (!catalog || typeof catalog !== 'object') return ['reference catalog must be an object'];
  if (catalog.schemaVersion !== 1) errors.push('reference catalog schemaVersion must be 1');
  if (!Array.isArray(catalog.references)) return [...errors, 'reference catalog references must be an array'];

  const ids = new Set<string>();
  const commodityIds = new Set(
    catalog.references
      .filter((reference) => reference?.kind === 'commodity' && nonEmpty(reference.id))
      .map((reference) => reference.id),
  );

  catalog.references.forEach((reference, index) => {
    const label = `references[${index}]`;
    if (!reference || typeof reference !== 'object') {
      errors.push(`${label} must be a reference object`);
      return;
    }
    if (!oneOf(reference.kind, PHYSICAL_REFERENCE_KINDS)) {
      errors.push(`${label}.kind is invalid`);
      return;
    }
    if (!nonEmpty(reference.id) || !ID_PATTERN.test(reference.id)) {
      errors.push(`${label}.id must be namespaced as ${reference.kind}:<stable-id>`);
    } else {
      if (!reference.id.startsWith(`${reference.kind}:`)) errors.push(`${reference.id} prefix must match kind ${reference.kind}`);
      if (ids.has(reference.id)) errors.push(`duplicate reference id: ${reference.id}`);
      ids.add(reference.id);
    }
    if (!nonEmpty(reference.name)) errors.push(`${reference.id || label}.name is required`);
    validateAliases(reference, errors);

    if (reference.kind === 'commodity' && !oneOf(reference.family, COMMODITY_FAMILIES)) {
      errors.push(`${reference.id}.family is invalid`);
    }
    if (reference.kind === 'grade') {
      if (!nonEmpty(reference.commodityId) || !commodityIds.has(reference.commodityId)) {
        errors.push(`${reference.id}.commodityId must reference a commodity in the same catalog`);
      }
      if (reference.countryCode != null && !COUNTRY_CODE_PATTERN.test(reference.countryCode)) {
        errors.push(`${reference.id}.countryCode must be an uppercase ISO alpha-2 code`);
      }
    }
    if (reference.kind === 'location') {
      if (!oneOf(reference.locationType, LOCATION_TYPES)) errors.push(`${reference.id}.locationType is invalid`);
      if (reference.unlocode != null && !UNLOCODE_PATTERN.test(reference.unlocode)) {
        errors.push(`${reference.id}.unlocode must be a five-character uppercase UN/LOCODE`);
      }
      if (reference.countryCode != null && !COUNTRY_CODE_PATTERN.test(reference.countryCode)) {
        errors.push(`${reference.id}.countryCode must be an uppercase ISO alpha-2 code`);
      }
      if (reference.unlocode && reference.countryCode && !reference.unlocode.startsWith(reference.countryCode)) {
        errors.push(`${reference.id}.unlocode country prefix must match countryCode`);
      }
    }
  });

  return errors;
}

export function assertPhysicalReferenceCatalog(catalog: PhysicalReferenceCatalog): PhysicalReferenceCatalog {
  const errors = validatePhysicalReferenceCatalog(catalog);
  if (errors.length) throw new Error(`Invalid physical reference catalog: ${errors.join('; ')}`);
  return catalog;
}

function candidateSet(
  catalog: PhysicalReferenceCatalog,
  kind: PhysicalReferenceKind,
  rawValue: string,
): { basis: ReferenceMatchBasis; references: PhysicalReference[] } | null {
  const references = catalog.references.filter((reference) => reference.kind === kind);
  const directId = references.filter((reference) => reference.id === rawValue.trim());
  if (directId.length) return { basis: 'canonical_id', references: directId };

  if (kind === 'location') {
    const upperRaw = rawValue.trim().toUpperCase();
    const unlocode = references.filter(
      (reference): reference is LocationReference => reference.kind === 'location' && reference.unlocode === upperRaw,
    );
    if (unlocode.length) return { basis: 'unlocode', references: unlocode };
  }

  const key = normalizedKey(rawValue);
  const canonicalName = references.filter((reference) => normalizedKey(reference.name) === key);
  if (canonicalName.length) return { basis: 'canonical_name', references: canonicalName };

  const aliases = references.filter((reference) => reference.aliases?.some((alias) => normalizedKey(alias) === key));
  if (aliases.length) return { basis: 'alias', references: aliases };
  return null;
}

export function resolvePhysicalReference(
  catalogInput: PhysicalReferenceCatalog,
  kind: PhysicalReferenceKind,
  rawValue: string,
  sourceRecordIds: string[],
  asOf: string | null = null,
): PhysicalReferenceResolution {
  const catalog = assertPhysicalReferenceCatalog(catalogInput);
  if (!oneOf(kind, PHYSICAL_REFERENCE_KINDS)) throw new Error('reference resolution kind is invalid');
  if (!nonEmpty(rawValue)) throw new Error('reference resolution rawValue is required');
  if (!Array.isArray(sourceRecordIds) || sourceRecordIds.length === 0 || sourceRecordIds.some((id) => !nonEmpty(id))) {
    throw new Error('reference resolution requires at least one stable source record ID');
  }

  const sourceIds = uniqueStrings(sourceRecordIds);
  const match = candidateSet(catalog, kind, rawValue);
  if (!match) {
    return {
      status: 'unresolved',
      kind,
      rawValue,
      methodId: REFERENCE_RESOLUTION_METHOD,
      sourceRecordIds: sourceIds,
      asOf,
      reason: 'No deterministic canonical reference match exists for the supplied raw value.',
    };
  }

  if (match.references.length > 1) {
    return {
      status: 'ambiguous',
      kind,
      rawValue,
      candidateIds: match.references.map((reference) => reference.id).sort(),
      candidateNames: match.references.map((reference) => reference.name).sort(),
      matchedBasis: match.basis as Exclude<ReferenceMatchBasis, 'canonical_id'>,
      methodId: REFERENCE_RESOLUTION_METHOD,
      sourceRecordIds: sourceIds,
      asOf,
      reason: `Multiple canonical ${kind} references match the same ${match.basis}; no reference was selected.`,
    };
  }

  const reference = match.references[0];
  return {
    status: 'resolved',
    kind,
    rawValue,
    canonicalId: reference.id,
    canonicalName: reference.name,
    matchBasis: match.basis,
    evidenceClass: 'derived',
    methodId: REFERENCE_RESOLUTION_METHOD,
    sourceRecordIds: sourceIds,
    asOf,
  };
}

function resolveEvidenceText(
  catalog: PhysicalReferenceCatalog,
  kind: PhysicalReferenceKind,
  item: { value: string; sourceRecordIds: string[]; asOf?: string | null } | null | undefined,
) {
  if (!item) return null;
  return resolvePhysicalReference(catalog, kind, item.value, item.sourceRecordIds, item.asOf ?? null);
}

export function resolveCargoObservationReferences(
  cargo: CargoObservation,
  catalog: PhysicalReferenceCatalog,
): CargoReferenceResolution {
  return {
    cargoId: cargo.cargoId,
    commodity: resolveEvidenceText(catalog, 'commodity', cargo.commodity),
    grade: resolveEvidenceText(catalog, 'grade', cargo.grade),
    loadLocation: resolveEvidenceText(catalog, 'location', cargo.loadPort),
    destinationLocation: resolveEvidenceText(catalog, 'location', cargo.destination),
    dischargeLocation: resolveEvidenceText(catalog, 'location', cargo.dischargePort),
  };
}

export function resolveRouteEstimateReferences(
  route: RouteEstimate,
  catalog: PhysicalReferenceCatalog,
): RouteReferenceResolution {
  return {
    routeId: route.routeId,
    originLocation: resolveEvidenceText(catalog, 'location', route.origin),
    destinationLocation: resolveEvidenceText(catalog, 'location', route.destination),
  };
}

export function resolvePortEventReference(
  event: PortEvent,
  catalog: PhysicalReferenceCatalog,
): PortEventReferenceResolution {
  return {
    eventId: event.eventId,
    portLocation: resolvePhysicalReference(
      catalog,
      'location',
      event.port.value,
      event.port.sourceRecordIds,
      event.port.asOf ?? null,
    ),
  };
}

export function resolveFreightObservationReferences(
  freight: FreightObservation,
  catalog: PhysicalReferenceCatalog,
): FreightReferenceResolution {
  const sourceIds = freight.provenance.providerRecordIds;
  const asOf = freight.provenance.observedAt ?? freight.provenance.effectiveAt ?? null;
  return {
    freightId: freight.freightId,
    originLocation: freight.origin
      ? resolvePhysicalReference(catalog, 'location', freight.origin, sourceIds, asOf)
      : null,
    destinationLocation: freight.destination
      ? resolvePhysicalReference(catalog, 'location', freight.destination, sourceIds, asOf)
      : null,
  };
}
