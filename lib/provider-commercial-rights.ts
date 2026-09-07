import type { PhysicalObservation } from './physical-data';

export const PROVIDER_USE_RIGHTS = [
  'web_display',
  'historical_storage',
  'derived_data',
  'export_derived_briefs',
  'retention_after_subscription',
] as const;
export type ProviderUseRight = (typeof PROVIDER_USE_RIGHTS)[number];

export const RIGHT_STATUSES = ['permitted', 'conditional', 'prohibited', 'unknown'] as const;
export type RightStatus = (typeof RIGHT_STATUSES)[number];
export type ConditionalCompliance = 'confirmed' | 'unconfirmed';

export type ProviderRightTerm = {
  right: ProviderUseRight;
  status: RightStatus;
  sourceDocumentIds: string[];
  effectiveAt?: string | null;
  expiresAt?: string | null;
  conditions?: string[] | null;
  conditionalCompliance?: ConditionalCompliance | null;
};

export type AttributionTerm = {
  status: 'required' | 'not_required' | 'unknown';
  requirement?: string | null;
  sourceDocumentIds: string[];
};

export type SpecifiedCommercialTerm = {
  status: 'specified' | 'unknown';
  description?: string | null;
  sourceDocumentIds: string[];
};

export type ApiDatasetScopeTerm = {
  status: 'specified' | 'unknown';
  datasets?: string[] | null;
  description?: string | null;
  sourceDocumentIds: string[];
};

export type ProviderCommercialRightsPacket = {
  schemaVersion: 1;
  providerId: string;
  licenceTag: string;
  reviewedAt: string;
  agreementEffectiveAt?: string | null;
  agreementExpiresAt?: string | null;
  rights: ProviderRightTerm[];
  attribution: AttributionTerm;
  seatScope: SpecifiedCommercialTerm;
  apiDatasetScope: ApiDatasetScopeTerm;
  rateLimits: SpecifiedCommercialTerm;
  pricing: SpecifiedCommercialTerm;
};

export type ProviderCommercialRightsAssessment = {
  status: 'ready' | 'blocked';
  providerId: string;
  licenceTag: string;
  reviewedAt: string;
  validationErrors: string[];
  blockers: string[];
  conditionalRights: Array<{ right: ProviderUseRight; conditions: string[] }>;
  sourceDocumentIds: string[];
};

export type ObservationCommercialUseAssessment = {
  status: 'ready' | 'blocked';
  providerId: string;
  licenceTag: string;
  recordKind: PhysicalObservation['kind'];
  recordId: string;
  blockers: string[];
};

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validIso = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const oneOf = (value: unknown, allowed: readonly string[]) => typeof value === 'string' && allowed.includes(value);

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function validateSourceDocumentIds(label: string, value: unknown, errors: string[]) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !nonEmpty(item))) {
    errors.push(`${label}.sourceDocumentIds must contain at least one stable source document ID`);
  }
}

function validateOptionalDate(label: string, value: unknown, errors: string[]) {
  if (value != null && !validIso(value)) errors.push(`${label} must be an ISO-compatible timestamp when supplied`);
}

function validateSpecifiedTerm(label: string, value: unknown, errors: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} is required`);
    return;
  }
  const term = value as Partial<SpecifiedCommercialTerm>;
  if (!oneOf(term.status, ['specified', 'unknown'])) errors.push(`${label}.status must be specified or unknown`);
  validateSourceDocumentIds(label, term.sourceDocumentIds, errors);
  if (term.status === 'specified' && !nonEmpty(term.description)) {
    errors.push(`${label}.description is required when the term is specified`);
  }
}

export function validateProviderCommercialRightsPacket(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['commercial rights packet must be an object'];
  const packet = input as Partial<ProviderCommercialRightsPacket> & Record<string, unknown>;

  if (packet.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!nonEmpty(packet.providerId)) errors.push('providerId is required');
  if (!nonEmpty(packet.licenceTag)) errors.push('licenceTag is required');
  if (!validIso(packet.reviewedAt)) errors.push('reviewedAt must be an ISO-compatible timestamp');
  validateOptionalDate('agreementEffectiveAt', packet.agreementEffectiveAt, errors);
  validateOptionalDate('agreementExpiresAt', packet.agreementExpiresAt, errors);
  if (
    validIso(packet.agreementEffectiveAt) &&
    validIso(packet.agreementExpiresAt) &&
    Date.parse(packet.agreementExpiresAt) < Date.parse(packet.agreementEffectiveAt)
  ) {
    errors.push('agreementExpiresAt must not precede agreementEffectiveAt');
  }

  if (!Array.isArray(packet.rights)) {
    errors.push('rights must be an array');
  } else {
    const counts = new Map<ProviderUseRight, number>();
    packet.rights.forEach((rawTerm, index) => {
      const label = `rights[${index}]`;
      if (!rawTerm || typeof rawTerm !== 'object' || Array.isArray(rawTerm)) {
        errors.push(`${label} must be a right term`);
        return;
      }
      const term = rawTerm as Partial<ProviderRightTerm>;
      if (!oneOf(term.right, PROVIDER_USE_RIGHTS)) {
        errors.push(`${label}.right is invalid`);
      } else {
        const right = term.right as ProviderUseRight;
        counts.set(right, (counts.get(right) ?? 0) + 1);
      }
      if (!oneOf(term.status, RIGHT_STATUSES)) errors.push(`${label}.status is invalid`);
      validateSourceDocumentIds(label, term.sourceDocumentIds, errors);
      validateOptionalDate(`${label}.effectiveAt`, term.effectiveAt, errors);
      validateOptionalDate(`${label}.expiresAt`, term.expiresAt, errors);
      if (validIso(term.effectiveAt) && validIso(term.expiresAt) && Date.parse(term.expiresAt) < Date.parse(term.effectiveAt)) {
        errors.push(`${label}.expiresAt must not precede effectiveAt`);
      }
      if (term.conditions != null && (!Array.isArray(term.conditions) || term.conditions.some((condition) => !nonEmpty(condition)))) {
        errors.push(`${label}.conditions must contain only non-empty strings when supplied`);
      }
      if (term.status === 'conditional') {
        if (!Array.isArray(term.conditions) || term.conditions.length === 0 || term.conditions.some((condition) => !nonEmpty(condition))) {
          errors.push(`${label}.conditions are required for a conditional right`);
        }
        if (!oneOf(term.conditionalCompliance, ['confirmed', 'unconfirmed'])) {
          errors.push(`${label}.conditionalCompliance must be confirmed or unconfirmed for a conditional right`);
        }
      } else if (term.conditionalCompliance != null) {
        errors.push(`${label}.conditionalCompliance is only valid for a conditional right`);
      }
    });

    for (const right of PROVIDER_USE_RIGHTS) {
      const count = counts.get(right) ?? 0;
      if (count === 0) errors.push(`rights must include ${right}`);
      if (count > 1) errors.push(`rights must include ${right} exactly once`);
    }
  }

  if (!packet.attribution || typeof packet.attribution !== 'object' || Array.isArray(packet.attribution)) {
    errors.push('attribution is required');
  } else {
    const attribution = packet.attribution as Partial<AttributionTerm>;
    if (!oneOf(attribution.status, ['required', 'not_required', 'unknown'])) {
      errors.push('attribution.status is invalid');
    }
    validateSourceDocumentIds('attribution', attribution.sourceDocumentIds, errors);
    if (attribution.status === 'required' && !nonEmpty(attribution.requirement)) {
      errors.push('attribution.requirement is required when attribution is required');
    }
  }

  validateSpecifiedTerm('seatScope', packet.seatScope, errors);
  validateSpecifiedTerm('rateLimits', packet.rateLimits, errors);
  validateSpecifiedTerm('pricing', packet.pricing, errors);

  if (!packet.apiDatasetScope || typeof packet.apiDatasetScope !== 'object' || Array.isArray(packet.apiDatasetScope)) {
    errors.push('apiDatasetScope is required');
  } else {
    const datasetScope = packet.apiDatasetScope as Partial<ApiDatasetScopeTerm>;
    if (!oneOf(datasetScope.status, ['specified', 'unknown'])) errors.push('apiDatasetScope.status must be specified or unknown');
    validateSourceDocumentIds('apiDatasetScope', datasetScope.sourceDocumentIds, errors);
    if (datasetScope.status === 'specified') {
      if (!Array.isArray(datasetScope.datasets) || datasetScope.datasets.length === 0 || datasetScope.datasets.some((item) => !nonEmpty(item))) {
        errors.push('apiDatasetScope.datasets must contain at least one dataset when specified');
      }
      if (!nonEmpty(datasetScope.description)) errors.push('apiDatasetScope.description is required when specified');
    }
  }

  return errors;
}

function allSourceDocumentIds(packet: ProviderCommercialRightsPacket) {
  return unique([
    ...packet.rights.flatMap((right) => right.sourceDocumentIds),
    ...packet.attribution.sourceDocumentIds,
    ...packet.seatScope.sourceDocumentIds,
    ...packet.apiDatasetScope.sourceDocumentIds,
    ...packet.rateLimits.sourceDocumentIds,
    ...packet.pricing.sourceDocumentIds,
  ]);
}

export function assessProviderCommercialRights(input: unknown): ProviderCommercialRightsAssessment {
  const validationErrors = validateProviderCommercialRightsPacket(input);
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Partial<ProviderCommercialRightsPacket>) : {};
  const providerId = nonEmpty(raw.providerId) ? raw.providerId : '';
  const licenceTag = nonEmpty(raw.licenceTag) ? raw.licenceTag : '';
  const reviewedAt = validIso(raw.reviewedAt) ? raw.reviewedAt : '';

  if (validationErrors.length > 0) {
    return {
      status: 'blocked',
      providerId,
      licenceTag,
      reviewedAt,
      validationErrors,
      blockers: ['commercial rights packet is structurally invalid or incomplete'],
      conditionalRights: [],
      sourceDocumentIds: [],
    };
  }

  const packet = input as ProviderCommercialRightsPacket;
  const blockers: string[] = [];
  const conditionalRights: Array<{ right: ProviderUseRight; conditions: string[] }> = [];
  const reviewTime = Date.parse(packet.reviewedAt);

  if (packet.agreementEffectiveAt && Date.parse(packet.agreementEffectiveAt) > reviewTime) {
    blockers.push(`agreement is not effective until ${packet.agreementEffectiveAt}`);
  }
  if (packet.agreementExpiresAt && Date.parse(packet.agreementExpiresAt) < reviewTime) {
    blockers.push(`agreement expired at ${packet.agreementExpiresAt}`);
  }

  for (const term of packet.rights) {
    if (term.effectiveAt && Date.parse(term.effectiveAt) > reviewTime) blockers.push(`${term.right} is not effective until ${term.effectiveAt}`);
    if (term.expiresAt && Date.parse(term.expiresAt) < reviewTime) blockers.push(`${term.right} expired at ${term.expiresAt}`);
    if (term.status === 'prohibited') blockers.push(`${term.right} is prohibited`);
    if (term.status === 'unknown') blockers.push(`${term.right} permission is unknown`);
    if (term.status === 'conditional') {
      conditionalRights.push({ right: term.right, conditions: term.conditions ?? [] });
      if (term.conditionalCompliance !== 'confirmed') blockers.push(`${term.right} conditions are not confirmed as operationally satisfied`);
    }
  }

  if (packet.attribution.status === 'unknown') blockers.push('attribution requirement is unknown');
  if (packet.seatScope.status === 'unknown') blockers.push('seat/user scope is unknown');
  if (packet.apiDatasetScope.status === 'unknown') blockers.push('included API dataset scope is unknown');
  if (packet.rateLimits.status === 'unknown') blockers.push('API rate limits are unknown');
  if (packet.pricing.status === 'unknown') blockers.push('pricing/commercial terms are unknown');

  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    providerId: packet.providerId,
    licenceTag: packet.licenceTag,
    reviewedAt: packet.reviewedAt,
    validationErrors: [],
    blockers: unique(blockers),
    conditionalRights,
    sourceDocumentIds: allSourceDocumentIds(packet),
  };
}

function observationRecordId(record: PhysicalObservation) {
  if (record.kind === 'vessel') return record.vesselId;
  if (record.kind === 'cargo') return record.cargoId;
  if (record.kind === 'port_event') return record.eventId;
  if (record.kind === 'route') return record.routeId;
  return record.freightId;
}

export function assessObservationCommercialUse(
  record: PhysicalObservation,
  rightsPacket: unknown,
): ObservationCommercialUseAssessment {
  const rights = assessProviderCommercialRights(rightsPacket);
  const blockers = [...rights.blockers, ...rights.validationErrors];

  if (rights.status !== 'ready' && blockers.length === 0) blockers.push('provider commercial rights are not release-ready');
  if (record.provenance.provider !== rights.providerId) {
    blockers.push(`observation provider ${record.provenance.provider} does not match rights packet provider ${rights.providerId || '(missing)'}`);
  }
  if (!nonEmpty(record.provenance.licenceTag)) {
    blockers.push('observation provenance.licenceTag is required for commercial use');
  } else if (record.provenance.licenceTag !== rights.licenceTag) {
    blockers.push(`observation licenceTag ${record.provenance.licenceTag} does not match rights packet ${rights.licenceTag || '(missing)'}`);
  }

  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    providerId: rights.providerId,
    licenceTag: rights.licenceTag,
    recordKind: record.kind,
    recordId: observationRecordId(record),
    blockers: unique(blockers),
  };
}
