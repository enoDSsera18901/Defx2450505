import type { EvidenceClass } from './physical-data';

export const LANDED_COST_COMPONENTS = [
  'crude_basis',
  'freight',
  'insurance',
  'port_terminal',
  'canal_toll',
  'quality_location_differential',
  'financing_time_cost',
] as const;

export type LandedCostComponentKind = (typeof LANDED_COST_COMPONENTS)[number];
export type LandedCostEvidenceClass = Exclude<EvidenceClass, 'unavailable'>;

export const REQUIRED_LANDED_COST_COMPONENTS = [
  'crude_basis',
  'freight',
  'insurance',
  'port_terminal',
  'quality_location_differential',
] as const satisfies readonly LandedCostComponentKind[];

export const OPTIONAL_LANDED_COST_COMPONENTS = [
  'canal_toll',
  'financing_time_cost',
] as const satisfies readonly LandedCostComponentKind[];

export type FxConversion = {
  rate: number;
  fromCurrency: string;
  toCurrency: string;
  asOf: string;
  evidenceClass: LandedCostEvidenceClass;
  sourceRecordIds: string[];
  methodId?: string | null;
};

export type AvailableCostComponent = {
  status: 'available';
  amount: number;
  currency: string;
  unit: 'per_bbl';
  evidenceClass: LandedCostEvidenceClass;
  sourceRecordIds: string[];
  asOf: string;
  methodId?: string | null;
  fx?: FxConversion | null;
  note?: string | null;
};

export type UnavailableCostComponent = {
  status: 'unavailable';
  reason: string;
};

export type NotApplicableCostComponent = {
  status: 'not_applicable';
  rationale: string;
};

export type LandedCostSlot =
  | AvailableCostComponent
  | UnavailableCostComponent
  | NotApplicableCostComponent;

export type LandedCostInput = {
  calculationId: string;
  calculatedAt: string;
  targetCurrency: string;
  components: Record<LandedCostComponentKind, LandedCostSlot>;
};

export type NormalizedCostComponent = {
  kind: LandedCostComponentKind;
  amount: number;
  originalAmount: number;
  originalCurrency: string;
  targetCurrency: string;
  unit: 'per_bbl';
  evidenceClass: LandedCostEvidenceClass;
  sourceRecordIds: string[];
  methodId?: string | null;
  fxApplied: boolean;
  fxSourceRecordIds: string[];
};

export type CompleteLandedCostResult = {
  status: 'complete';
  calculationId: string;
  calculatedAt: string;
  amount: number;
  currency: string;
  unit: 'per_bbl';
  evidenceClass: 'derived' | 'scenario';
  components: NormalizedCostComponent[];
  sourceRecordIds: string[];
  scenarioComponentKinds: LandedCostComponentKind[];
};

export type IncompleteLandedCostResult = {
  status: 'incomplete';
  calculationId: string;
  calculatedAt: string;
  currency: string;
  unit: 'per_bbl';
  errors: string[];
  unavailableComponentKinds: LandedCostComponentKind[];
};

export type LandedCostResult = CompleteLandedCostResult | IncompleteLandedCostResult;

const EVIDENCE_CLASSES = ['observed', 'derived', 'estimated', 'forecast', 'scenario'] as const;
const REQUIRED_SET = new Set<LandedCostComponentKind>(REQUIRED_LANDED_COST_COMPONENTS);
const OPTIONAL_SET = new Set<LandedCostComponentKind>(OPTIONAL_LANDED_COST_COMPONENTS);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validIso = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));
const evidenceAllowed = (value: unknown): value is LandedCostEvidenceClass =>
  typeof value === 'string' && (EVIDENCE_CLASSES as readonly string[]).includes(value);
const normalizeCurrency = (value: string) => value.trim().toUpperCase();
const validCurrency = (value: unknown): value is string => nonEmpty(value) && /^[A-Za-z]{3}$/.test(value.trim());

function validateSourceIds(label: string, ids: string[], errors: string[]) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !nonEmpty(id))) {
    errors.push(`${label}.sourceRecordIds must contain at least one stable source record ID`);
  }
}

function validateEvidence(
  label: string,
  evidenceClass: LandedCostEvidenceClass,
  methodId: string | null | undefined,
  errors: string[],
) {
  if (!evidenceAllowed(evidenceClass)) {
    errors.push(`${label}.evidenceClass is invalid`);
    return;
  }
  if (evidenceClass !== 'observed' && !nonEmpty(methodId)) {
    errors.push(`${label}.methodId is required for ${evidenceClass} evidence`);
  }
}

function validateFx(
  kind: LandedCostComponentKind,
  component: AvailableCostComponent,
  targetCurrency: string,
  errors: string[],
) {
  const componentCurrency = normalizeCurrency(component.currency);
  const normalizedTarget = normalizeCurrency(targetCurrency);
  const fx = component.fx;

  if (componentCurrency === normalizedTarget) {
    if (fx != null) errors.push(`${kind}.fx must be omitted when the component already uses target currency`);
    return;
  }

  if (!fx) {
    errors.push(`${kind}.fx is required to convert ${componentCurrency} to ${normalizedTarget}`);
    return;
  }

  if (!finite(fx.rate) || fx.rate <= 0) errors.push(`${kind}.fx.rate must be > 0`);
  if (!validCurrency(fx.fromCurrency)) errors.push(`${kind}.fx.fromCurrency must be a three-letter currency code`);
  if (!validCurrency(fx.toCurrency)) errors.push(`${kind}.fx.toCurrency must be a three-letter currency code`);
  if (validCurrency(fx.fromCurrency) && normalizeCurrency(fx.fromCurrency) !== componentCurrency) {
    errors.push(`${kind}.fx.fromCurrency must match component currency ${componentCurrency}`);
  }
  if (validCurrency(fx.toCurrency) && normalizeCurrency(fx.toCurrency) !== normalizedTarget) {
    errors.push(`${kind}.fx.toCurrency must match target currency ${normalizedTarget}`);
  }
  if (!validIso(fx.asOf)) errors.push(`${kind}.fx.asOf must be an ISO-compatible timestamp`);
  validateSourceIds(`${kind}.fx`, fx.sourceRecordIds, errors);
  validateEvidence(`${kind}.fx`, fx.evidenceClass, fx.methodId, errors);
}

export function validateLandedCostInput(input: LandedCostInput): string[] {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') return ['landed cost input must be an object'];
  if (!nonEmpty(input.calculationId)) errors.push('calculationId is required');
  if (!validIso(input.calculatedAt)) errors.push('calculatedAt must be an ISO-compatible timestamp');
  if (!validCurrency(input.targetCurrency)) errors.push('targetCurrency must be a three-letter currency code');
  if (!input.components || typeof input.components !== 'object') {
    errors.push('components must contain every landed-cost component slot');
    return errors;
  }

  const targetCurrency = validCurrency(input.targetCurrency) ? normalizeCurrency(input.targetCurrency) : input.targetCurrency;

  for (const kind of LANDED_COST_COMPONENTS) {
    const slot = input.components[kind];
    if (!slot || typeof slot !== 'object') {
      errors.push(`${kind} slot is required`);
      continue;
    }

    if (slot.status === 'unavailable') {
      if (!nonEmpty(slot.reason)) errors.push(`${kind}.reason is required when unavailable`);
      continue;
    }

    if (slot.status === 'not_applicable') {
      if (!OPTIONAL_SET.has(kind)) errors.push(`${kind} is required and cannot be marked not_applicable`);
      if (!nonEmpty(slot.rationale)) errors.push(`${kind}.rationale is required when not_applicable`);
      continue;
    }

    if (slot.status !== 'available') {
      errors.push(`${kind}.status is invalid`);
      continue;
    }

    if (!finite(slot.amount)) errors.push(`${kind}.amount must be a finite number`);
    if (kind === 'quality_location_differential') {
      // A discount may be negative; zero is valid only when it is explicitly evidenced.
    } else if (finite(slot.amount) && slot.amount < 0) {
      errors.push(`${kind}.amount must be >= 0`);
    }
    if (kind === 'crude_basis' && finite(slot.amount) && slot.amount <= 0) errors.push('crude_basis.amount must be > 0');

    if (slot.unit !== 'per_bbl') errors.push(`${kind}.unit must be per_bbl`);
    if (!validCurrency(slot.currency)) errors.push(`${kind}.currency must be a three-letter currency code`);
    if (!validIso(slot.asOf)) errors.push(`${kind}.asOf must be an ISO-compatible timestamp`);
    validateSourceIds(kind, slot.sourceRecordIds, errors);
    validateEvidence(kind, slot.evidenceClass, slot.methodId, errors);

    if (validCurrency(slot.currency) && validCurrency(targetCurrency)) {
      validateFx(kind, slot, targetCurrency, errors);
    }
  }

  return errors;
}

function normalizeComponent(
  kind: LandedCostComponentKind,
  component: AvailableCostComponent,
  targetCurrency: string,
): NormalizedCostComponent {
  const componentCurrency = normalizeCurrency(component.currency);
  const normalizedTarget = normalizeCurrency(targetCurrency);
  const fxApplied = componentCurrency !== normalizedTarget;
  const amount = fxApplied ? component.amount * (component.fx as FxConversion).rate : component.amount;
  const sourceRecordIds = [...new Set(component.sourceRecordIds)];
  const fxSourceRecordIds = fxApplied ? [...new Set((component.fx as FxConversion).sourceRecordIds)] : [];

  return {
    kind,
    amount,
    originalAmount: component.amount,
    originalCurrency: componentCurrency,
    targetCurrency: normalizedTarget,
    unit: 'per_bbl',
    evidenceClass: component.evidenceClass,
    sourceRecordIds,
    methodId: component.methodId ?? null,
    fxApplied,
    fxSourceRecordIds,
  };
}

export function calculateLandedCost(input: LandedCostInput): LandedCostResult {
  const errors = validateLandedCostInput(input);
  const unavailableComponentKinds: LandedCostComponentKind[] = [];

  if (input?.components && typeof input.components === 'object') {
    for (const kind of LANDED_COST_COMPONENTS) {
      const slot = input.components[kind];
      if (slot?.status === 'unavailable') unavailableComponentKinds.push(kind);
    }
  }

  for (const kind of REQUIRED_LANDED_COST_COMPONENTS) {
    const slot = input?.components?.[kind];
    if (!slot || slot.status !== 'available') {
      if (!unavailableComponentKinds.includes(kind)) unavailableComponentKinds.push(kind);
      errors.push(`${kind} must be available before landed cost can be calculated`);
    }
  }

  if (errors.length > 0) {
    return {
      status: 'incomplete',
      calculationId: nonEmpty(input?.calculationId) ? input.calculationId : '',
      calculatedAt: nonEmpty(input?.calculatedAt) ? input.calculatedAt : '',
      currency: validCurrency(input?.targetCurrency) ? normalizeCurrency(input.targetCurrency) : '',
      unit: 'per_bbl',
      errors: [...new Set(errors)],
      unavailableComponentKinds: [...new Set(unavailableComponentKinds)],
    };
  }

  const normalized: NormalizedCostComponent[] = [];
  const scenarioComponentKinds: LandedCostComponentKind[] = [];

  for (const kind of LANDED_COST_COMPONENTS) {
    const slot = input.components[kind];
    if (slot.status !== 'available') continue;
    const component = normalizeComponent(kind, slot, input.targetCurrency);
    normalized.push(component);
    if (slot.evidenceClass === 'scenario' || slot.fx?.evidenceClass === 'scenario') {
      scenarioComponentKinds.push(kind);
    }
  }

  const amount = normalized.reduce((sum, component) => sum + component.amount, 0);
  if (!finite(amount) || amount <= 0) {
    return {
      status: 'incomplete',
      calculationId: input.calculationId,
      calculatedAt: input.calculatedAt,
      currency: normalizeCurrency(input.targetCurrency),
      unit: 'per_bbl',
      errors: ['normalized landed cost must be > 0'],
      unavailableComponentKinds: [],
    };
  }

  const sourceRecordIds = [
    ...new Set(normalized.flatMap((component) => [...component.sourceRecordIds, ...component.fxSourceRecordIds])),
  ];

  return {
    status: 'complete',
    calculationId: input.calculationId,
    calculatedAt: input.calculatedAt,
    amount,
    currency: normalizeCurrency(input.targetCurrency),
    unit: 'per_bbl',
    evidenceClass: scenarioComponentKinds.length > 0 ? 'scenario' : 'derived',
    components: normalized,
    sourceRecordIds,
    scenarioComponentKinds: [...new Set(scenarioComponentKinds)],
  };
}
