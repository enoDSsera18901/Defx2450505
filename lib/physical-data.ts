export type EvidenceClass =
  | 'observed'
  | 'derived'
  | 'estimated'
  | 'forecast'
  | 'scenario'
  | 'unavailable';

export type Confidence = number; // 0..1 evidence/identification confidence, not probability of market outcome.

export type Provenance = {
  provider: string;
  providerRecordIds: string[];
  retrievedAt: string;
  observedAt?: string | null;
  effectiveAt?: string | null;
  evidenceClass: EvidenceClass;
  methodId?: string | null;
  confidence?: Confidence | null;
  licenceTag?: string | null;
};

export type EvidenceValue<T> = {
  value: T;
  evidenceClass: Exclude<EvidenceClass, 'unavailable'>;
  sourceRecordIds: string[];
  asOf?: string | null;
  methodId?: string | null;
  confidence?: Confidence | null;
};

export type Position = {
  latitude: number;
  longitude: number;
};

export type VesselObservation = {
  kind: 'vessel';
  vesselId: string;
  providerVesselId: string;
  imo?: string | null;
  mmsi?: string | null;
  name?: string | null;
  vesselClass?: string | null;
  dwt?: EvidenceValue<number> | null;
  position?: EvidenceValue<Position> | null;
  draughtM?: EvidenceValue<number> | null;
  destinationText?: EvidenceValue<string> | null;
  provenance: Provenance;
};

export const CARGO_STATES = [
  'loading',
  'loaded',
  'in_transit',
  'awaiting_discharge',
  'discharging',
  'delivered',
  'unknown',
] as const;
export type CargoState = (typeof CARGO_STATES)[number];

export type CargoQuantity = {
  amount: number;
  unit: 'bbl' | 'mt' | 'm3';
  basis: 'reported' | 'provider_estimated' | 'derived';
};

export type CargoObservation = {
  kind: 'cargo';
  cargoId: string;
  vesselId?: string | null;
  commodity?: EvidenceValue<string> | null;
  grade?: EvidenceValue<string> | null;
  quantity?: EvidenceValue<CargoQuantity> | null;
  loadPort?: EvidenceValue<string> | null;
  loadWindow?: EvidenceValue<{ start: string; end: string }> | null;
  destination?: EvidenceValue<string> | null;
  dischargePort?: EvidenceValue<string> | null;
  state: EvidenceValue<CargoState>;
  provenance: Provenance;
};

export type PortEvent = {
  kind: 'port_event';
  eventId: string;
  vesselId: string;
  cargoId?: string | null;
  eventType: 'arrival' | 'departure' | 'load' | 'discharge' | 'ship_to_ship';
  port: EvidenceValue<string>;
  eventTime: EvidenceValue<string>;
  provenance: Provenance;
};

export type RouteEstimate = {
  kind: 'route';
  routeId: string;
  vesselId: string;
  cargoId?: string | null;
  origin?: EvidenceValue<string> | null;
  destination?: EvidenceValue<string> | null;
  eta?: EvidenceValue<{ timestamp: string; uncertaintyHours?: number | null }> | null;
  routeState?: EvidenceValue<'underway' | 'anchored' | 'waiting' | 'diverted' | 'unknown'> | null;
  provenance: Provenance;
};

export type FreightRate = {
  amount: number;
  currency: string;
  unit: 'usd_per_bbl' | 'usd_per_mt' | 'worldscale' | 'lumpsum';
};

export type FreightObservation = {
  kind: 'freight';
  freightId: string;
  origin?: string | null;
  destination?: string | null;
  vesselClass?: string | null;
  rate: EvidenceValue<FreightRate>;
  provenance: Provenance;
};

export type PhysicalObservation =
  | VesselObservation
  | CargoObservation
  | PortEvent
  | RouteEstimate
  | FreightObservation;

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validIso = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const validConfidence = (value: unknown) => value == null || (finite(value) && value >= 0 && value <= 1);

function validateEvidenceValue<T>(label: string, item: EvidenceValue<T> | null | undefined, errors: string[]) {
  if (item == null) return;
  if (!Array.isArray(item.sourceRecordIds) || item.sourceRecordIds.length === 0 || item.sourceRecordIds.some((id) => !nonEmpty(id))) {
    errors.push(`${label}.sourceRecordIds must contain at least one stable source record ID`);
  }
  if (item.asOf != null && !validIso(item.asOf)) errors.push(`${label}.asOf must be an ISO-compatible timestamp`);
  if (!validConfidence(item.confidence)) errors.push(`${label}.confidence must be between 0 and 1`);
  if (item.evidenceClass !== 'observed' && !nonEmpty(item.methodId)) {
    errors.push(`${label}.methodId is required for ${item.evidenceClass} evidence`);
  }
}

export function validateProvenance(provenance: Provenance): string[] {
  const errors: string[] = [];
  if (!nonEmpty(provenance.provider)) errors.push('provenance.provider is required');
  if (
    !Array.isArray(provenance.providerRecordIds) ||
    provenance.providerRecordIds.length === 0 ||
    provenance.providerRecordIds.some((id) => !nonEmpty(id))
  ) {
    errors.push('provenance.providerRecordIds must contain at least one provider record ID');
  }
  if (!validIso(provenance.retrievedAt)) errors.push('provenance.retrievedAt must be an ISO-compatible timestamp');
  if (provenance.observedAt != null && !validIso(provenance.observedAt)) errors.push('provenance.observedAt must be an ISO-compatible timestamp');
  if (provenance.effectiveAt != null && !validIso(provenance.effectiveAt)) errors.push('provenance.effectiveAt must be an ISO-compatible timestamp');
  if (!validConfidence(provenance.confidence)) errors.push('provenance.confidence must be between 0 and 1');
  if (!['observed', 'derived', 'estimated', 'forecast', 'scenario', 'unavailable'].includes(provenance.evidenceClass)) {
    errors.push('provenance.evidenceClass is invalid');
  }
  if (['derived', 'estimated', 'forecast', 'scenario'].includes(provenance.evidenceClass) && !nonEmpty(provenance.methodId)) {
    errors.push(`provenance.methodId is required for ${provenance.evidenceClass} evidence`);
  }
  return errors;
}

export function validatePhysicalObservation(record: PhysicalObservation): string[] {
  const errors = validateProvenance(record.provenance);

  if (record.kind === 'vessel') {
    if (!nonEmpty(record.vesselId)) errors.push('vesselId is required');
    if (!nonEmpty(record.providerVesselId)) errors.push('providerVesselId is required');
    if (!nonEmpty(record.imo) && !nonEmpty(record.mmsi) && !nonEmpty(record.name)) {
      errors.push('vessel requires at least one IMO, MMSI or name identity');
    }
    validateEvidenceValue('dwt', record.dwt, errors);
    validateEvidenceValue('position', record.position, errors);
    validateEvidenceValue('draughtM', record.draughtM, errors);
    validateEvidenceValue('destinationText', record.destinationText, errors);
    if (record.dwt && (!finite(record.dwt.value) || record.dwt.value <= 0)) errors.push('dwt.value must be > 0');
    if (record.draughtM && (!finite(record.draughtM.value) || record.draughtM.value < 0)) errors.push('draughtM.value must be >= 0');
    if (record.position) {
      const { latitude, longitude } = record.position.value;
      if (!finite(latitude) || latitude < -90 || latitude > 90) errors.push('position.latitude must be between -90 and 90');
      if (!finite(longitude) || longitude < -180 || longitude > 180) errors.push('position.longitude must be between -180 and 180');
    }
  }

  if (record.kind === 'cargo') {
    if (!nonEmpty(record.cargoId)) errors.push('cargoId is required');
    validateEvidenceValue('commodity', record.commodity, errors);
    validateEvidenceValue('grade', record.grade, errors);
    validateEvidenceValue('quantity', record.quantity, errors);
    validateEvidenceValue('loadPort', record.loadPort, errors);
    validateEvidenceValue('loadWindow', record.loadWindow, errors);
    validateEvidenceValue('destination', record.destination, errors);
    validateEvidenceValue('dischargePort', record.dischargePort, errors);
    validateEvidenceValue('state', record.state, errors);
    if (!CARGO_STATES.includes(record.state.value)) errors.push('state.value is not an allowed cargo state');
    if (record.quantity) {
      const { amount, basis } = record.quantity.value;
      if (!finite(amount) || amount <= 0) errors.push('quantity.amount must be > 0');
      if (basis === 'reported' && record.quantity.evidenceClass !== 'observed') {
        errors.push('reported cargo quantity must use observed evidence class');
      }
      if (basis === 'derived' && record.quantity.evidenceClass !== 'derived') {
        errors.push('derived cargo quantity must use derived evidence class');
      }
      if (basis === 'provider_estimated' && record.quantity.evidenceClass !== 'estimated') {
        errors.push('provider_estimated cargo quantity must use estimated evidence class');
      }
    }
    if (record.loadWindow) {
      const { start, end } = record.loadWindow.value;
      if (!validIso(start) || !validIso(end)) errors.push('loadWindow start/end must be ISO-compatible timestamps');
      else if (Date.parse(end) < Date.parse(start)) errors.push('loadWindow end must not precede start');
    }
  }

  if (record.kind === 'port_event') {
    if (!nonEmpty(record.eventId)) errors.push('eventId is required');
    if (!nonEmpty(record.vesselId)) errors.push('vesselId is required');
    validateEvidenceValue('port', record.port, errors);
    validateEvidenceValue('eventTime', record.eventTime, errors);
    if (!validIso(record.eventTime.value)) errors.push('eventTime.value must be an ISO-compatible timestamp');
  }

  if (record.kind === 'route') {
    if (!nonEmpty(record.routeId)) errors.push('routeId is required');
    if (!nonEmpty(record.vesselId)) errors.push('vesselId is required');
    validateEvidenceValue('origin', record.origin, errors);
    validateEvidenceValue('destination', record.destination, errors);
    validateEvidenceValue('eta', record.eta, errors);
    validateEvidenceValue('routeState', record.routeState, errors);
    if (record.eta) {
      if (!validIso(record.eta.value.timestamp)) errors.push('eta.timestamp must be an ISO-compatible timestamp');
      const uncertainty = record.eta.value.uncertaintyHours;
      if (uncertainty != null && (!finite(uncertainty) || uncertainty < 0)) errors.push('eta.uncertaintyHours must be >= 0');
    }
  }

  if (record.kind === 'freight') {
    if (!nonEmpty(record.freightId)) errors.push('freightId is required');
    validateEvidenceValue('rate', record.rate, errors);
    if (!finite(record.rate.value.amount) || record.rate.value.amount <= 0) errors.push('rate.amount must be > 0');
    if (!nonEmpty(record.rate.value.currency)) errors.push('rate.currency is required');
  }

  return errors;
}

export function assertPhysicalObservation(record: PhysicalObservation): PhysicalObservation {
  const errors = validatePhysicalObservation(record);
  if (errors.length) throw new Error(`Invalid physical-oil observation: ${errors.join('; ')}`);
  return record;
}
