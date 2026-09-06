import {
  type CargoObservation,
  type FreightObservation,
  type PhysicalObservation,
  type PortEvent,
  type RouteEstimate,
  type VesselObservation,
  validatePhysicalObservation,
} from './physical-data';

export const PROVIDER_CAPABILITIES = [
  'vessel_observations',
  'cargo_observations',
  'port_events',
  'route_estimates',
  'freight_observations',
] as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export type ProviderQueryBase = {
  from?: string | null;
  to?: string | null;
  limit?: number | null;
};

export type VesselQuery = ProviderQueryBase & {
  imo?: string | null;
  mmsi?: string | null;
  providerVesselIds?: string[] | null;
};

export type CargoQuery = ProviderQueryBase & {
  cargoIds?: string[] | null;
  vesselIds?: string[] | null;
  commodity?: string | null;
  origin?: string | null;
  destination?: string | null;
};

export type PortEventQuery = ProviderQueryBase & {
  vesselIds?: string[] | null;
  cargoIds?: string[] | null;
  ports?: string[] | null;
};

export type RouteQuery = ProviderQueryBase & {
  vesselIds?: string[] | null;
  cargoIds?: string[] | null;
};

export type FreightQuery = ProviderQueryBase & {
  origin?: string | null;
  destination?: string | null;
  vesselClass?: string | null;
};

export type ProviderResult<T extends PhysicalObservation> = {
  providerId: string;
  retrievedAt: string;
  requestId?: string | null;
  partial: boolean;
  warnings: string[];
  records: T[];
};

export interface PhysicalOilProvider {
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];
  getVesselObservations?(query: VesselQuery): Promise<ProviderResult<VesselObservation>>;
  getCargoObservations?(query: CargoQuery): Promise<ProviderResult<CargoObservation>>;
  getPortEvents?(query: PortEventQuery): Promise<ProviderResult<PortEvent>>;
  getRouteEstimates?(query: RouteQuery): Promise<ProviderResult<RouteEstimate>>;
  getFreightObservations?(query: FreightQuery): Promise<ProviderResult<FreightObservation>>;
}

export type ObservationKind = PhysicalObservation['kind'];
export type FreshnessStatus = 'fresh' | 'stale' | 'unknown' | 'future';

export type FreshnessAssessment = {
  status: FreshnessStatus;
  ageHours: number | null;
  timestamp: string | null;
};

const CAPABILITY_METHODS: Record<ProviderCapability, keyof PhysicalOilProvider> = {
  vessel_observations: 'getVesselObservations',
  cargo_observations: 'getCargoObservations',
  port_events: 'getPortEvents',
  route_estimates: 'getRouteEstimates',
  freight_observations: 'getFreightObservations',
};

const OBSERVATION_KINDS = ['vessel', 'cargo', 'port_event', 'route', 'freight'] as const;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validIso = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const oneOf = (value: unknown, allowed: readonly string[]) => typeof value === 'string' && allowed.includes(value);

function validateStringList(label: string, value: string[] | null | undefined, errors: string[]) {
  if (value == null) return;
  if (!Array.isArray(value) || value.some((item) => !nonEmpty(item))) {
    errors.push(`${label} must contain only non-empty strings`);
  }
}

export function validateProviderQuery(query: ProviderQueryBase): string[] {
  const errors: string[] = [];
  if (query.from != null && !validIso(query.from)) errors.push('query.from must be an ISO-compatible timestamp');
  if (query.to != null && !validIso(query.to)) errors.push('query.to must be an ISO-compatible timestamp');
  if (validIso(query.from) && validIso(query.to) && Date.parse(query.to) < Date.parse(query.from)) {
    errors.push('query.to must not precede query.from');
  }
  if (query.limit != null && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000)) {
    errors.push('query.limit must be an integer between 1 and 1000');
  }
  return errors;
}

export function validateVesselQuery(query: VesselQuery): string[] {
  const errors = validateProviderQuery(query);
  if (query.imo != null && !nonEmpty(query.imo)) errors.push('query.imo must be non-empty when supplied');
  if (query.mmsi != null && !nonEmpty(query.mmsi)) errors.push('query.mmsi must be non-empty when supplied');
  validateStringList('query.providerVesselIds', query.providerVesselIds, errors);
  return errors;
}

export function validateCargoQuery(query: CargoQuery): string[] {
  const errors = validateProviderQuery(query);
  validateStringList('query.cargoIds', query.cargoIds, errors);
  validateStringList('query.vesselIds', query.vesselIds, errors);
  if (query.commodity != null && !nonEmpty(query.commodity)) errors.push('query.commodity must be non-empty when supplied');
  if (query.origin != null && !nonEmpty(query.origin)) errors.push('query.origin must be non-empty when supplied');
  if (query.destination != null && !nonEmpty(query.destination)) errors.push('query.destination must be non-empty when supplied');
  return errors;
}

export function validatePortEventQuery(query: PortEventQuery): string[] {
  const errors = validateProviderQuery(query);
  validateStringList('query.vesselIds', query.vesselIds, errors);
  validateStringList('query.cargoIds', query.cargoIds, errors);
  validateStringList('query.ports', query.ports, errors);
  return errors;
}

export function validateRouteQuery(query: RouteQuery): string[] {
  const errors = validateProviderQuery(query);
  validateStringList('query.vesselIds', query.vesselIds, errors);
  validateStringList('query.cargoIds', query.cargoIds, errors);
  return errors;
}

export function validateFreightQuery(query: FreightQuery): string[] {
  const errors = validateProviderQuery(query);
  if (query.origin != null && !nonEmpty(query.origin)) errors.push('query.origin must be non-empty when supplied');
  if (query.destination != null && !nonEmpty(query.destination)) errors.push('query.destination must be non-empty when supplied');
  if (query.vesselClass != null && !nonEmpty(query.vesselClass)) errors.push('query.vesselClass must be non-empty when supplied');
  return errors;
}

export function validateProviderDefinition(provider: PhysicalOilProvider): string[] {
  const errors: string[] = [];
  if (!nonEmpty(provider.id)) errors.push('provider.id is required');

  const rawCapabilities: unknown = provider.capabilities;
  if (!Array.isArray(rawCapabilities)) {
    errors.push('provider.capabilities must be an array');
    return errors;
  }

  const seen = new Set<ProviderCapability>();
  rawCapabilities.forEach((rawCapability) => {
    if (!oneOf(rawCapability, PROVIDER_CAPABILITIES)) {
      errors.push(`provider capability ${String(rawCapability)} is invalid`);
      return;
    }

    const capability = rawCapability as ProviderCapability;
    if (seen.has(capability)) errors.push(`provider capability ${capability} is duplicated`);
    seen.add(capability);

    const method = CAPABILITY_METHODS[capability];
    if (typeof provider[method] !== 'function') {
      errors.push(`provider declares ${capability} but does not implement ${String(method)}`);
    }
  });

  return errors;
}

export function validateProviderResult<T extends PhysicalObservation>(
  expectedProviderId: string,
  expectedKind: ObservationKind,
  result: ProviderResult<T>,
): string[] {
  const errors: string[] = [];
  if (!nonEmpty(expectedProviderId)) errors.push('expected provider ID is required');
  if (!oneOf(expectedKind, OBSERVATION_KINDS)) errors.push('expected observation kind is invalid');
  if (!nonEmpty(result.providerId)) errors.push('result.providerId is required');
  else if (result.providerId !== expectedProviderId) {
    errors.push(`result.providerId ${result.providerId} does not match adapter ${expectedProviderId}`);
  }
  if (!validIso(result.retrievedAt)) errors.push('result.retrievedAt must be an ISO-compatible timestamp');
  if (result.requestId != null && !nonEmpty(result.requestId)) errors.push('result.requestId must be non-empty when supplied');

  const warningsValid = Array.isArray(result.warnings) && result.warnings.every((warning) => nonEmpty(warning));
  if (!warningsValid) errors.push('result.warnings must contain only non-empty strings');
  if (result.partial && (!Array.isArray(result.warnings) || result.warnings.length === 0)) {
    errors.push('partial provider result requires at least one warning explaining degradation');
  }
  if (!Array.isArray(result.records)) {
    errors.push('result.records must be an array');
    return errors;
  }

  result.records.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      errors.push(`records[${index}] must be a normalized physical observation`);
      return;
    }
    if (!oneOf(record.kind, OBSERVATION_KINDS)) {
      errors.push(`records[${index}].kind is invalid`);
      return;
    }
    if (record.kind !== expectedKind) {
      errors.push(`records[${index}].kind ${record.kind} does not match expected ${expectedKind}`);
    }
    if (!record.provenance || typeof record.provenance !== 'object') {
      errors.push(`records[${index}].provenance is required`);
      return;
    }
    if (record.provenance.provider !== expectedProviderId) {
      errors.push(`records[${index}].provenance.provider does not match adapter ${expectedProviderId}`);
    }
    validatePhysicalObservation(record).forEach((error) => errors.push(`records[${index}]: ${error}`));
  });

  return errors;
}

export function assertProviderResult<T extends PhysicalObservation>(
  expectedProviderId: string,
  expectedKind: ObservationKind,
  result: ProviderResult<T>,
): ProviderResult<T> {
  const errors = validateProviderResult(expectedProviderId, expectedKind, result);
  if (errors.length) throw new Error(`Invalid physical provider result: ${errors.join('; ')}`);
  return result;
}

export function assessObservationFreshness(
  record: PhysicalObservation,
  now: string,
  staleAfterHours: number,
): FreshnessAssessment {
  if (!validIso(now)) throw new Error('now must be an ISO-compatible timestamp');
  if (!finite(staleAfterHours) || staleAfterHours <= 0) throw new Error('staleAfterHours must be > 0');

  const timestamp = record.provenance.observedAt ?? record.provenance.effectiveAt ?? null;
  if (!validIso(timestamp)) return { status: 'unknown', ageHours: null, timestamp: null };

  const ageHours = (Date.parse(now) - Date.parse(timestamp)) / 3_600_000;
  if (ageHours < 0) return { status: 'future', ageHours, timestamp };
  if (ageHours > staleAfterHours) return { status: 'stale', ageHours, timestamp };
  return { status: 'fresh', ageHours, timestamp };
}
