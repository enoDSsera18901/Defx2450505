import { type PhysicalObservation, validatePhysicalObservation } from './physical-data';
import { assessObservationFreshness, type FreshnessStatus, type ObservationKind } from './physical-provider';

export type ProviderTrialDataset = {
  providerId: string;
  capturedAt: string;
  freshnessThresholdHours: Record<ObservationKind, number>;
  records: PhysicalObservation[];
};

export type TrialEvidenceCheck = {
  id:
    | 'valid_canonical_records'
    | 'sample_size'
    | 'completed_voyage'
    | 'missing_or_ambiguous_destination'
    | 'multiple_routes'
    | 'multiple_grades'
    | 'freight_observation';
  pass: boolean;
  detail: string;
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
    distinctGrades: number;
    distinctRoutes: number;
    gradeCoveragePct: number | null;
    quantityCoveragePct: number | null;
    destinationCoveragePct: number | null;
  };
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

function cargoRouteKey(record: Extract<PhysicalObservation, { kind: 'cargo' }>): string | null {
  const origin = record.loadPort?.value;
  const destination = cargoDestination(record);
  if (!nonEmpty(origin) || !nonEmpty(destination)) return null;
  return `${origin.trim().toLowerCase()}->${destination.trim().toLowerCase()}`;
}

export function evaluateProviderTrial(input: unknown): ProviderTrialReport {
  const errors: string[] = [];
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const providerId = typeof raw.providerId === 'string' ? raw.providerId : '';
  const capturedAt = typeof raw.capturedAt === 'string' ? raw.capturedAt : '';
  const rawThresholds =
    raw.freshnessThresholdHours && typeof raw.freshnessThresholdHours === 'object' && !Array.isArray(raw.freshnessThresholdHours)
      ? (raw.freshnessThresholdHours as Partial<Record<ObservationKind, unknown>>)
      : null;
  const rawRecords = Array.isArray(raw.records) ? raw.records : [];

  if (!nonEmpty(providerId)) errors.push('providerId is required');
  if (!validIso(capturedAt)) errors.push('capturedAt must be an ISO-compatible timestamp');
  if (!rawThresholds) {
    errors.push('freshnessThresholdHours is required');
  } else {
    for (const kind of KINDS) {
      if (!finitePositive(rawThresholds[kind])) {
        errors.push(`freshnessThresholdHours.${kind} must be > 0`);
      }
    }
  }
  if (!Array.isArray(raw.records)) errors.push('records must be an array');

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
      errors.push(`records[${index}] is not a supported canonical physical observation`);
      return;
    }

    const candidate = rawRecord as { kind?: unknown; provenance?: unknown };
    if (!supportedKind(candidate.kind)) {
      errors.push(`records[${index}] is not a supported canonical physical observation`);
      return;
    }

    const record = rawRecord as PhysicalObservation;
    records.push(record);
    recordCounts[record.kind] += 1;
    if (record.kind === 'vessel' || record.kind === 'cargo') recordCounts.vesselAndCargo += 1;

    const provenance = candidate.provenance;
    if (!provenance || typeof provenance !== 'object' || (provenance as { provider?: unknown }).provider !== providerId) {
      errors.push(`records[${index}] provider provenance does not match ${providerId}`);
    }

    try {
      validatePhysicalObservation(record).forEach((error) => errors.push(`records[${index}]: ${error}`));
    } catch (error) {
      errors.push(`records[${index}] could not be validated: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const threshold = rawThresholds?.[record.kind];
    if (validIso(capturedAt) && finitePositive(threshold)) {
      try {
        const assessment = assessObservationFreshness(record, capturedAt, threshold);
        freshness[assessment.status] += 1;
      } catch (error) {
        errors.push(`records[${index}] freshness could not be assessed: ${error instanceof Error ? error.message : 'unknown error'}`);
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

  const grades = new Set(
    cargoes
      .map((record) => record.grade?.value)
      .filter(nonEmpty)
      .map((value) => value.trim().toLowerCase()),
  );
  const routes = new Set(cargoes.map(cargoRouteKey).filter((value): value is string => value !== null));

  const cargoCoverage = {
    cargoes: cargoes.length,
    withCommodity,
    withGrade,
    withQuantity,
    withDestination,
    delivered,
    missingOrAmbiguousDestination,
    distinctGrades: grades.size,
    distinctRoutes: routes.size,
    gradeCoveragePct: pct(withGrade, cargoes.length),
    quantityCoveragePct: pct(withQuantity, cargoes.length),
    destinationCoveragePct: pct(withDestination, cargoes.length),
  };

  const checks: TrialEvidenceCheck[] = [
    {
      id: 'valid_canonical_records',
      pass: errors.length === 0,
      detail: errors.length === 0 ? 'All captured records satisfy the canonical/provider boundary.' : `${errors.length} validation error(s) remain.`,
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
      pass: routes.size >= 2,
      detail: `${routes.size} distinct load-to-destination cargo route(s) captured.`,
    },
    {
      id: 'multiple_grades',
      pass: grades.size >= 2,
      detail: `${grades.size} distinct observed/estimated cargo grade label(s) captured.`,
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
    freshness,
    checks,
    errors,
    evidenceComplete: checks.every((check) => check.pass),
  };
}
