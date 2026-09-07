import { type PhysicalObservation, validatePhysicalObservation } from './physical-data';
import { assessObservationFreshness, type FreshnessStatus, type ObservationKind } from './physical-provider';
import {
  resolveCargoObservationReferences,
  resolveFreightObservationReferences,
  resolvePortEventReference,
  resolveRouteEstimateReferences,
  validatePhysicalReferenceCatalog,
  type PhysicalReferenceCatalog,
  type PhysicalReferenceKind,
  type PhysicalReferenceResolution,
} from './physical-reference';

export type ProviderTrialDataset = {
  providerId: string;
  capturedAt: string;
  freshnessThresholdHours: Record<ObservationKind, number>;
  referenceCatalog: PhysicalReferenceCatalog;
  records: PhysicalObservation[];
};

export type TrialEvidenceCheck = {
  id:
    | 'valid_canonical_records'
    | 'reference_catalog'
    | 'reference_resolution_complete'
    | 'sample_size'
    | 'completed_voyage'
    | 'missing_or_ambiguous_destination'
    | 'multiple_routes'
    | 'multiple_grades'
    | 'freight_observation';
  pass: boolean;
  detail: string;
};

export type ReferenceResolutionIssue = {
  recordKind: ObservationKind;
  recordId: string;
  field: string;
  rawValue: string;
  referenceKind: PhysicalReferenceKind;
  status: 'ambiguous' | 'unresolved';
  candidateIds: string[];
  sourceRecordIds: string[];
  reason: string;
};

export type ReferenceResolutionCoverage = {
  present: number;
  resolved: number;
  ambiguous: number;
  unresolved: number;
};

export type ProviderTrialReferenceResolution = {
  catalogAvailable: boolean;
  catalogValid: boolean;
  catalogErrors: string[];
  fieldsPresent: number;
  resolved: number;
  ambiguous: number;
  unresolved: number;
  resolvedPct: number | null;
  byKind: Record<PhysicalReferenceKind, ReferenceResolutionCoverage>;
  distinctCanonicalGrades: number;
  distinctCanonicalRoutes: number;
  issues: ReferenceResolutionIssue[];
};

export type ProviderTrialReport = {
  providerId: string;
  capturedAt: string;
  recordCounts: Record<ObservationKind, number> & { total: number; vesselAndCargo: number };
  cargoCoverage: {
    cargoes: number;
    withCommodity: number;
    withGrade: number;
    withQuantity: number;
    withDestination: number;
    delivered: number;
    missingOrAmbiguousDestination: number;
    distinctRawGradeLabels: number;
    distinctCanonicalGrades: number;
    distinctRawRoutes: number;
    distinctCanonicalRoutes: number;
    gradeCoveragePct: number | null;
    quantityCoveragePct: number | null;
    destinationCoveragePct: number | null;
  };
  referenceResolution: ProviderTrialReferenceResolution;
  freshness: Record<FreshnessStatus, number>;
  checks: TrialEvidenceCheck[];
  errors: string[];
  evidenceComplete: boolean;
};

const KINDS: ObservationKind[] = ['vessel', 'cargo', 'port_event', 'route', 'freight'];
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validIso = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const supportedKind = (value: unknown): value is ObservationKind => typeof value === 'string' && KINDS.includes(value as ObservationKind);

function pct(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function cargoDestination(record: Extract<PhysicalObservation, { kind: 'cargo' }>): string | null {
  return record.dischargePort?.value ?? record.destination?.value ?? null;
}

function rawCargoRouteKey(record: Extract<PhysicalObservation, { kind: 'cargo' }>): string | null {
  const origin = record.loadPort?.value;
  const destination = cargoDestination(record);
  if (!nonEmpty(origin) || !nonEmpty(destination)) return null;
  return `${origin.trim().toLowerCase()}->${destination.trim().toLowerCase()}`;
}

function emptyResolutionCoverage(): ReferenceResolutionCoverage {
  return { present: 0, resolved: 0, ambiguous: 0, unresolved: 0 };
}

function emptyReferenceResolution(catalogAvailable: boolean, catalogErrors: string[]): ProviderTrialReferenceResolution {
  return {
    catalogAvailable,
    catalogValid: catalogAvailable && catalogErrors.length === 0,
    catalogErrors,
    fieldsPresent: 0,
    resolved: 0,
    ambiguous: 0,
    unresolved: 0,
    resolvedPct: null,
    byKind: {
      commodity: emptyResolutionCoverage(),
      grade: emptyResolutionCoverage(),
      location: emptyResolutionCoverage(),
    },
    distinctCanonicalGrades: 0,
    distinctCanonicalRoutes: 0,
    issues: [],
  };
}

function trackResolution(
  summary: ProviderTrialReferenceResolution,
  resolution: PhysicalReferenceResolution | null,
  recordKind: ObservationKind,
  recordId: string,
  field: string,
) {
  if (!resolution) return;

  summary.fieldsPresent += 1;
  summary.byKind[resolution.kind].present += 1;

  if (resolution.status === 'resolved') {
    summary.resolved += 1;
    summary.byKind[resolution.kind].resolved += 1;
    return;
  }

  if (resolution.status === 'ambiguous') {
    summary.ambiguous += 1;
    summary.byKind[resolution.kind].ambiguous += 1;
  } else {
    summary.unresolved += 1;
    summary.byKind[resolution.kind].unresolved += 1;
  }

  summary.issues.push({
    recordKind,
    recordId,
    field,
    rawValue: resolution.rawValue,
    referenceKind: resolution.kind,
    status: resolution.status,
    candidateIds: resolution.status === 'ambiguous' ? resolution.candidateIds : [],
    sourceRecordIds: resolution.sourceRecordIds,
    reason: resolution.reason,
  });
}

export function evaluateProviderTrial(input: unknown): ProviderTrialReport {
  const errors: string[] = [];
  const boundaryErrors: string[] = [];
  const addBoundaryError = (error: string) => {
    boundaryErrors.push(error);
    errors.push(error);
  };

  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const providerId = typeof raw.providerId === 'string' ? raw.providerId : '';
  const capturedAt = typeof raw.capturedAt === 'string' ? raw.capturedAt : '';
  const rawThresholds =
    raw.freshnessThresholdHours && typeof raw.freshnessThresholdHours === 'object' && !Array.isArray(raw.freshnessThresholdHours)
      ? (raw.freshnessThresholdHours as Partial<Record<ObservationKind, unknown>>)
      : null;
  const rawRecords = Array.isArray(raw.records) ? raw.records : [];

  if (!nonEmpty(providerId)) addBoundaryError('providerId is required');
  if (!validIso(capturedAt)) addBoundaryError('capturedAt must be an ISO-compatible timestamp');
  if (!rawThresholds) {
    addBoundaryError('freshnessThresholdHours is required');
  } else {
    for (const kind of KINDS) {
      if (!finitePositive(rawThresholds[kind])) {
        addBoundaryError(`freshnessThresholdHours.${kind} must be > 0`);
      }
    }
  }
  if (!Array.isArray(raw.records)) addBoundaryError('records must be an array');

  const rawCatalog = raw.referenceCatalog;
  const catalogAvailable = Boolean(rawCatalog && typeof rawCatalog === 'object' && !Array.isArray(rawCatalog));
  let referenceCatalog: PhysicalReferenceCatalog | null = null;
  let catalogErrors: string[] = [];
  if (!catalogAvailable) {
    catalogErrors = ['referenceCatalog is required'];
  } else {
    referenceCatalog = rawCatalog as PhysicalReferenceCatalog;
    try {
      catalogErrors = validatePhysicalReferenceCatalog(referenceCatalog);
    } catch (error) {
      catalogErrors = [`reference catalog could not be validated: ${error instanceof Error ? error.message : 'unknown error'}`];
    }
  }
  catalogErrors.forEach((error) => errors.push(`referenceCatalog: ${error}`));

  const recordCounts: ProviderTrialReport['recordCounts'] = {
    vessel: 0,
    cargo: 0,
    port_event: 0,
    route: 0,
    freight: 0,
    total: rawRecords.length,
    vesselAndCargo: 0,
  };
  const freshness: Record<FreshnessStatus, number> = { fresh: 0, stale: 0, unknown: 0, future: 0 };
  const records: PhysicalObservation[] = [];

  rawRecords.forEach((rawRecord, index) => {
    if (!rawRecord || typeof rawRecord !== 'object') {
      addBoundaryError(`records[${index}] is not a supported canonical physical observation`);
      return;
    }

    const candidate = rawRecord as { kind?: unknown; provenance?: unknown };
    if (!supportedKind(candidate.kind)) {
      addBoundaryError(`records[${index}] is not a supported canonical physical observation`);
      return;
    }

    const record = rawRecord as PhysicalObservation;
    records.push(record);
    recordCounts[record.kind] += 1;
    if (record.kind === 'vessel' || record.kind === 'cargo') recordCounts.vesselAndCargo += 1;

    const provenance = candidate.provenance;
    if (!provenance || typeof provenance !== 'object' || (provenance as { provider?: unknown }).provider !== providerId) {
      addBoundaryError(`records[${index}] provider provenance does not match ${providerId}`);
    }

    try {
      validatePhysicalObservation(record).forEach((error) => addBoundaryError(`records[${index}]: ${error}`));
    } catch (error) {
      addBoundaryError(`records[${index}] could not be validated: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const threshold = rawThresholds?.[record.kind];
    if (validIso(capturedAt) && finitePositive(threshold)) {
      try {
        const assessment = assessObservationFreshness(record, capturedAt, threshold);
        freshness[assessment.status] += 1;
      } catch (error) {
        addBoundaryError(`records[${index}] freshness could not be assessed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  });

  const cargoes = records.filter((record): record is Extract<PhysicalObservation, { kind: 'cargo' }> => record.kind === 'cargo');
  const withCommodity = cargoes.filter((record) => nonEmpty(record.commodity?.value)).length;
  const withGrade = cargoes.filter((record) => nonEmpty(record.grade?.value)).length;
  const withQuantity = cargoes.filter((record) => record.quantity != null).length;
  const withDestination = cargoes.filter((record) => nonEmpty(cargoDestination(record))).length;
  const delivered = cargoes.filter((record) => record.state?.value === 'delivered').length;

  const routeRecords = records.filter((record): record is Extract<PhysicalObservation, { kind: 'route' }> => record.kind === 'route');
  const ambiguousCargoes = cargoes.filter((record) => !nonEmpty(cargoDestination(record))).length;
  const ambiguousRoutes = routeRecords.filter(
    (record) => !nonEmpty(record.destination?.value) || record.routeState?.value === 'unknown' || record.routeState?.value === 'diverted',
  ).length;
  const missingOrAmbiguousDestination = ambiguousCargoes + ambiguousRoutes;

  const rawGrades = new Set(
    cargoes
      .map((record) => record.grade?.value)
      .filter(nonEmpty)
      .map((value) => value.trim().toLowerCase()),
  );
  const rawRoutes = new Set(cargoes.map(rawCargoRouteKey).filter((value): value is string => value !== null));

  const referenceResolution = emptyReferenceResolution(catalogAvailable, catalogErrors);
  const canonicalGrades = new Set<string>();
  const canonicalRoutes = new Set<string>();

  if (referenceCatalog && catalogErrors.length === 0) {
    for (const record of records) {
      if (record.kind === 'cargo') {
        const resolved = resolveCargoObservationReferences(record, referenceCatalog);
        trackResolution(referenceResolution, resolved.commodity, 'cargo', record.cargoId, 'commodity');
        trackResolution(referenceResolution, resolved.grade, 'cargo', record.cargoId, 'grade');
        trackResolution(referenceResolution, resolved.loadLocation, 'cargo', record.cargoId, 'loadPort');
        trackResolution(referenceResolution, resolved.destinationLocation, 'cargo', record.cargoId, 'destination');
        trackResolution(referenceResolution, resolved.dischargeLocation, 'cargo', record.cargoId, 'dischargePort');

        if (resolved.grade?.status === 'resolved') canonicalGrades.add(resolved.grade.canonicalId);
        const canonicalDestination = record.dischargePort ? resolved.dischargeLocation : resolved.destinationLocation;
        if (resolved.loadLocation?.status === 'resolved' && canonicalDestination?.status === 'resolved') {
          canonicalRoutes.add(`${resolved.loadLocation.canonicalId}->${canonicalDestination.canonicalId}`);
        }
      }

      if (record.kind === 'route') {
        const resolved = resolveRouteEstimateReferences(record, referenceCatalog);
        trackResolution(referenceResolution, resolved.originLocation, 'route', record.routeId, 'origin');
        trackResolution(referenceResolution, resolved.destinationLocation, 'route', record.routeId, 'destination');
      }

      if (record.kind === 'port_event') {
        const resolved = resolvePortEventReference(record, referenceCatalog);
        trackResolution(referenceResolution, resolved.portLocation, 'port_event', record.eventId, 'port');
      }

      if (record.kind === 'freight') {
        const resolved = resolveFreightObservationReferences(record, referenceCatalog);
        trackResolution(referenceResolution, resolved.originLocation, 'freight', record.freightId, 'origin');
        trackResolution(referenceResolution, resolved.destinationLocation, 'freight', record.freightId, 'destination');
      }
    }
  }

  referenceResolution.distinctCanonicalGrades = canonicalGrades.size;
  referenceResolution.distinctCanonicalRoutes = canonicalRoutes.size;
  referenceResolution.resolvedPct = pct(referenceResolution.resolved, referenceResolution.fieldsPresent);

  const cargoCoverage = {
    cargoes: cargoes.length,
    withCommodity,
    withGrade,
    withQuantity,
    withDestination,
    delivered,
    missingOrAmbiguousDestination,
    distinctRawGradeLabels: rawGrades.size,
    distinctCanonicalGrades: canonicalGrades.size,
    distinctRawRoutes: rawRoutes.size,
    distinctCanonicalRoutes: canonicalRoutes.size,
    gradeCoveragePct: pct(withGrade, cargoes.length),
    quantityCoveragePct: pct(withQuantity, cargoes.length),
    destinationCoveragePct: pct(withDestination, cargoes.length),
  };

  const referenceResolutionComplete =
    referenceResolution.catalogValid &&
    referenceResolution.fieldsPresent > 0 &&
    referenceResolution.ambiguous === 0 &&
    referenceResolution.unresolved === 0;

  const checks: TrialEvidenceCheck[] = [
    {
      id: 'valid_canonical_records',
      pass: boundaryErrors.length === 0,
      detail:
        boundaryErrors.length === 0
          ? 'All captured records satisfy the canonical/provider boundary.'
          : `${boundaryErrors.length} canonical/provider validation error(s) remain.`,
    },
    {
      id: 'reference_catalog',
      pass: referenceResolution.catalogValid,
      detail: referenceResolution.catalogValid
        ? `${referenceCatalog?.references.length ?? 0} canonical reference(s) available for deterministic resolution.`
        : `${referenceResolution.catalogErrors.length} reference-catalog validation error(s) remain.`,
    },
    {
      id: 'reference_resolution_complete',
      pass: referenceResolutionComplete,
      detail: referenceResolution.catalogValid
        ? `${referenceResolution.resolved}/${referenceResolution.fieldsPresent} supplied reference field(s) resolved; ` +
          `${referenceResolution.ambiguous} ambiguous and ${referenceResolution.unresolved} unresolved.`
        : 'Reference resolution was not run because the canonical catalog is missing or invalid.',
    },
    {
      id: 'sample_size',
      pass: recordCounts.vesselAndCargo >= 20 && recordCounts.vesselAndCargo <= 50,
      detail: `${recordCounts.vesselAndCargo} vessel/cargo records captured; trial target is 20–50.`,
    },
    {
      id: 'completed_voyage',
      pass: delivered >= 1,
      detail: `${delivered} delivered cargo record(s) captured.`,
    },
    {
      id: 'missing_or_ambiguous_destination',
      pass: missingOrAmbiguousDestination >= 1,
      detail: `${missingOrAmbiguousDestination} missing/unknown/diverted destination path(s) captured.`,
    },
    {
      id: 'multiple_routes',
      pass: canonicalRoutes.size >= 2,
      detail:
        `${canonicalRoutes.size} distinct canonical load-to-destination route(s) resolved ` +
        `from ${rawRoutes.size} distinct raw route label pair(s).`,
    },
    {
      id: 'multiple_grades',
      pass: canonicalGrades.size >= 2,
      detail:
        `${canonicalGrades.size} distinct canonical cargo grade(s) resolved ` +
        `from ${rawGrades.size} distinct raw grade label(s).`,
    },
    {
      id: 'freight_observation',
      pass: recordCounts.freight >= 1,
      detail: `${recordCounts.freight} canonical freight observation(s) captured.`,
    },
  ];

  return {
    providerId,
    capturedAt,
    recordCounts,
    cargoCoverage,
    referenceResolution,
    freshness,
    checks,
    errors,
    evidenceComplete: checks.every((check) => check.pass),
  };
}
