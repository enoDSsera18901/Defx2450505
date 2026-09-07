import {
  LANDED_COST_COMPONENTS,
  calculateLandedCost,
  type CompleteLandedCostResult,
  type LandedCostComponentKind,
  type LandedCostEvidenceClass,
  type LandedCostInput,
  type NormalizedCostComponent,
} from './landed-cost';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export type LandedCostEvidenceComponent = {
  componentKind: LandedCostComponentKind;
  status: 'available';
  inputAmount: number;
  inputCurrency: string;
  inputAsOf: string;
  inputEvidenceClass: LandedCostEvidenceClass;
  inputSourceRecordIds: string[];
  inputMethodId: string | null;
  normalizedAmount: number;
  targetCurrency: string;
  unit: 'per_bbl';
  fxApplied: boolean;
  fx?: {
    rate: number;
    fromCurrency: string;
    toCurrency: string;
    asOf: string;
    evidenceClass: LandedCostEvidenceClass;
    sourceRecordIds: string[];
    methodId: string | null;
  };
};

export type LandedCostNotApplicableEvidence = {
  componentKind: LandedCostComponentKind;
  status: 'not_applicable';
  rationale: string;
};

export type LandedCostEvidenceEntry = LandedCostEvidenceComponent | LandedCostNotApplicableEvidence;

export type CompleteLandedCostEvidenceChain = {
  status: 'complete';
  calculationId: string;
  calculatedAt: string;
  targetCurrency: string;
  unit: 'per_bbl';
  resultEvidenceClass: 'derived' | 'scenario';
  components: LandedCostEvidenceEntry[];
  aggregation: {
    methodId: 'sum-normalized-per-bbl-components-v1';
    formula: 'sum(normalized component amounts)';
    amount: number;
    currency: string;
    sourceRecordIds: string[];
  };
};

export type IncompleteLandedCostEvidenceChain = {
  status: 'incomplete';
  calculationId: string;
  errors: string[];
  unavailableComponentKinds: LandedCostComponentKind[];
};

export type LandedCostEvidenceChain = CompleteLandedCostEvidenceChain | IncompleteLandedCostEvidenceChain;

function normalizedByKind(result: CompleteLandedCostResult) {
  return new Map(result.components.map((component) => [component.kind, component] as const));
}

export function explainLandedCost(input: LandedCostInput): LandedCostEvidenceChain {
  const result = calculateLandedCost(input);
  if (result.status === 'incomplete') {
    return {
      status: 'incomplete',
      calculationId: result.calculationId,
      errors: result.errors,
      unavailableComponentKinds: result.unavailableComponentKinds,
    };
  }

  const normalized = normalizedByKind(result);
  const components: LandedCostEvidenceEntry[] = [];

  for (const kind of LANDED_COST_COMPONENTS) {
    const slot = input.components[kind];
    if (slot.status === 'not_applicable') {
      components.push({ componentKind: kind, status: 'not_applicable', rationale: slot.rationale });
      continue;
    }
    if (slot.status !== 'available') {
      return {
        status: 'incomplete',
        calculationId: result.calculationId,
        errors: [`${kind} is not available in an otherwise complete landed-cost result`],
        unavailableComponentKinds: [kind],
      };
    }

    const normalizedComponent = normalized.get(kind);
    if (!normalizedComponent) {
      return {
        status: 'incomplete',
        calculationId: result.calculationId,
        errors: [`${kind} is missing from normalized landed-cost components`],
        unavailableComponentKinds: [kind],
      };
    }

    components.push({
      componentKind: kind,
      status: 'available',
      inputAmount: slot.amount,
      inputCurrency: slot.currency.trim().toUpperCase(),
      inputAsOf: slot.asOf,
      inputEvidenceClass: slot.evidenceClass,
      inputSourceRecordIds: [...new Set(slot.sourceRecordIds)],
      inputMethodId: slot.methodId ?? null,
      normalizedAmount: normalizedComponent.amount,
      targetCurrency: normalizedComponent.targetCurrency,
      unit: 'per_bbl',
      fxApplied: normalizedComponent.fxApplied,
      fx: slot.fx
        ? {
            rate: slot.fx.rate,
            fromCurrency: slot.fx.fromCurrency.trim().toUpperCase(),
            toCurrency: slot.fx.toCurrency.trim().toUpperCase(),
            asOf: slot.fx.asOf,
            evidenceClass: slot.fx.evidenceClass,
            sourceRecordIds: [...new Set(slot.fx.sourceRecordIds)],
            methodId: slot.fx.methodId ?? null,
          }
        : undefined,
    });
  }

  return {
    status: 'complete',
    calculationId: result.calculationId,
    calculatedAt: result.calculatedAt,
    targetCurrency: result.currency,
    unit: result.unit,
    resultEvidenceClass: result.evidenceClass,
    components,
    aggregation: {
      methodId: 'sum-normalized-per-bbl-components-v1',
      formula: 'sum(normalized component amounts)',
      amount: result.amount,
      currency: result.currency,
      sourceRecordIds: result.sourceRecordIds,
    },
  };
}

export type AbsoluteLandedCostShock = {
  shockId: string;
  componentKind: LandedCostComponentKind;
  mode: 'absolute_per_bbl';
  deltaPerBbl: number;
  note?: string;
};

export type PercentLandedCostShock = {
  shockId: string;
  componentKind: LandedCostComponentKind;
  mode: 'percent_of_normalized_component';
  percent: number;
  note?: string;
};

export type LandedCostSensitivityShock = AbsoluteLandedCostShock | PercentLandedCostShock;

export type LandedCostSensitivityPoint = {
  shockId: string;
  componentKind: LandedCostComponentKind;
  mode: LandedCostSensitivityShock['mode'];
  requestedChange: number;
  baseComponentAmount: number;
  stressedComponentAmount: number;
  componentDelta: number;
  baseLandedCost: number;
  stressedLandedCost: number;
  landedCostDelta: number;
  landedCostDeltaPercent: number;
  currency: string;
  unit: 'per_bbl';
  note?: string;
};

export type CompleteLandedCostSensitivity = {
  status: 'complete';
  analysisId: string;
  baseCalculationId: string;
  baseCalculatedAt: string;
  baseEvidenceClass: 'derived' | 'scenario';
  evidenceClass: 'scenario';
  methodId: 'one-at-a-time-post-normalization-component-stress-v1';
  stressBasis: 'post-normalization target-currency component contribution; base source observations remain unchanged';
  baseLandedCost: number;
  currency: string;
  unit: 'per_bbl';
  baseSourceRecordIds: string[];
  points: LandedCostSensitivityPoint[];
};

export type IncompleteLandedCostSensitivity = {
  status: 'incomplete';
  analysisId: string;
  baseCalculationId: string;
  errors: string[];
};

export type LandedCostSensitivityResult = CompleteLandedCostSensitivity | IncompleteLandedCostSensitivity;

function validateStressedAmount(kind: LandedCostComponentKind, amount: number): string | null {
  if (!finite(amount)) return `${kind} stressed amount must be finite`;
  if (kind === 'crude_basis' && amount <= 0) return 'crude_basis stressed amount must be > 0';
  if (kind !== 'quality_location_differential' && amount < 0) return `${kind} stressed amount must be >= 0`;
  return null;
}

export function analyzeLandedCostSensitivity(
  analysisId: string,
  input: LandedCostInput,
  shocks: readonly LandedCostSensitivityShock[],
): LandedCostSensitivityResult {
  const errors: string[] = [];
  if (!nonEmpty(analysisId)) errors.push('analysisId is required');
  if (!Array.isArray(shocks) || shocks.length === 0) errors.push('at least one sensitivity shock is required');

  const result = calculateLandedCost(input);
  if (result.status === 'incomplete') {
    errors.push(...result.errors.map((error) => `base calculation: ${error}`));
    return {
      status: 'incomplete',
      analysisId: nonEmpty(analysisId) ? analysisId : '',
      baseCalculationId: result.calculationId,
      errors: [...new Set(errors)],
    };
  }

  const seenShockIds = new Set<string>();
  const components = normalizedByKind(result);
  const points: LandedCostSensitivityPoint[] = [];

  for (const shock of shocks) {
    if (!nonEmpty(shock?.shockId)) {
      errors.push('every sensitivity shock requires a shockId');
      continue;
    }
    const shockId = shock.shockId;
    if (seenShockIds.has(shockId)) {
      errors.push(`duplicate sensitivity shockId: ${shockId}`);
      continue;
    }
    seenShockIds.add(shockId);

    if (!LANDED_COST_COMPONENTS.includes(shock.componentKind)) {
      errors.push(`${shockId}.componentKind is invalid`);
      continue;
    }
    const component = components.get(shock.componentKind);
    if (!component) {
      errors.push(`${shockId}: ${shock.componentKind} is not an available component in the base calculation`);
      continue;
    }

    let stressedComponentAmount: number;
    let requestedChange: number;
    if (shock.mode === 'absolute_per_bbl') {
      if (!finite(shock.deltaPerBbl)) {
        errors.push(`${shockId}.deltaPerBbl must be finite`);
        continue;
      }
      requestedChange = shock.deltaPerBbl;
      stressedComponentAmount = component.amount + shock.deltaPerBbl;
    } else if (shock.mode === 'percent_of_normalized_component') {
      if (!finite(shock.percent)) {
        errors.push(`${shockId}.percent must be finite`);
        continue;
      }
      requestedChange = shock.percent;
      stressedComponentAmount = component.amount * (1 + shock.percent / 100);
    } else {
      errors.push(`${shockId}.mode is invalid`);
      continue;
    }

    const stressedError = validateStressedAmount(shock.componentKind, stressedComponentAmount);
    if (stressedError) {
      errors.push(`${shockId}: ${stressedError}`);
      continue;
    }

    const componentDelta = stressedComponentAmount - component.amount;
    const stressedLandedCost = result.amount + componentDelta;
    if (!finite(stressedLandedCost) || stressedLandedCost <= 0) {
      errors.push(`${shockId}: stressed landed cost must be > 0`);
      continue;
    }

    points.push({
      shockId,
      componentKind: shock.componentKind,
      mode: shock.mode,
      requestedChange,
      baseComponentAmount: component.amount,
      stressedComponentAmount,
      componentDelta,
      baseLandedCost: result.amount,
      stressedLandedCost,
      landedCostDelta: stressedLandedCost - result.amount,
      landedCostDeltaPercent: ((stressedLandedCost - result.amount) / result.amount) * 100,
      currency: result.currency,
      unit: result.unit,
      note: shock.note,
    });
  }

  if (errors.length > 0) {
    return {
      status: 'incomplete',
      analysisId: nonEmpty(analysisId) ? analysisId : '',
      baseCalculationId: result.calculationId,
      errors: [...new Set(errors)],
    };
  }

  return {
    status: 'complete',
    analysisId,
    baseCalculationId: result.calculationId,
    baseCalculatedAt: result.calculatedAt,
    baseEvidenceClass: result.evidenceClass,
    evidenceClass: 'scenario',
    methodId: 'one-at-a-time-post-normalization-component-stress-v1',
    stressBasis: 'post-normalization target-currency component contribution; base source observations remain unchanged',
    baseLandedCost: result.amount,
    currency: result.currency,
    unit: result.unit,
    baseSourceRecordIds: result.sourceRecordIds,
    points,
  };
}

export type LandedCostComparisonSide = {
  included: boolean;
  amount: number;
  evidenceClass: LandedCostEvidenceClass | null;
  sourceRecordIds: string[];
};

export type LandedCostComparisonComponent = {
  componentKind: LandedCostComponentKind;
  left: LandedCostComparisonSide;
  right: LandedCostComparisonSide;
  deltaRightMinusLeft: number;
};

export type CompleteLandedCostComparison = {
  status: 'complete';
  comparisonId: string;
  leftCalculationId: string;
  rightCalculationId: string;
  evidenceClass: 'derived' | 'scenario';
  methodId: 'right-minus-left-normalized-component-attribution-v1';
  currency: string;
  unit: 'per_bbl';
  leftLandedCost: number;
  rightLandedCost: number;
  totalDeltaRightMinusLeft: number;
  attributedDelta: number;
  components: LandedCostComparisonComponent[];
  sourceRecordIds: string[];
};

export type IncompleteLandedCostComparison = {
  status: 'incomplete';
  comparisonId: string;
  errors: string[];
};

export type LandedCostComparisonResult = CompleteLandedCostComparison | IncompleteLandedCostComparison;

function comparisonSide(component: NormalizedCostComponent | undefined): LandedCostComparisonSide {
  if (!component) return { included: false, amount: 0, evidenceClass: null, sourceRecordIds: [] };
  return {
    included: true,
    amount: component.amount,
    evidenceClass: component.evidenceClass,
    sourceRecordIds: [...new Set([...component.sourceRecordIds, ...component.fxSourceRecordIds])],
  };
}

export function compareLandedCostInputs(
  comparisonId: string,
  leftInput: LandedCostInput,
  rightInput: LandedCostInput,
): LandedCostComparisonResult {
  const errors: string[] = [];
  if (!nonEmpty(comparisonId)) errors.push('comparisonId is required');

  const left = calculateLandedCost(leftInput);
  const right = calculateLandedCost(rightInput);
  if (left.status === 'incomplete') errors.push(...left.errors.map((error) => `left calculation: ${error}`));
  if (right.status === 'incomplete') errors.push(...right.errors.map((error) => `right calculation: ${error}`));
  if (left.status === 'incomplete' || right.status === 'incomplete') {
    return { status: 'incomplete', comparisonId: nonEmpty(comparisonId) ? comparisonId : '', errors: [...new Set(errors)] };
  }

  if (left.currency !== right.currency) errors.push(`comparison currencies must match: ${left.currency} vs ${right.currency}`);
  if (left.unit !== right.unit) errors.push(`comparison units must match: ${left.unit} vs ${right.unit}`);
  if (errors.length > 0) {
    return { status: 'incomplete', comparisonId: nonEmpty(comparisonId) ? comparisonId : '', errors: [...new Set(errors)] };
  }

  const leftComponents = normalizedByKind(left);
  const rightComponents = normalizedByKind(right);
  const components: LandedCostComparisonComponent[] = LANDED_COST_COMPONENTS.map((componentKind) => {
    const leftSide = comparisonSide(leftComponents.get(componentKind));
    const rightSide = comparisonSide(rightComponents.get(componentKind));
    return {
      componentKind,
      left: leftSide,
      right: rightSide,
      deltaRightMinusLeft: rightSide.amount - leftSide.amount,
    };
  });

  const totalDeltaRightMinusLeft = right.amount - left.amount;
  const attributedDelta = components.reduce((sum, component) => sum + component.deltaRightMinusLeft, 0);
  if (Math.abs(totalDeltaRightMinusLeft - attributedDelta) > 1e-9) {
    return {
      status: 'incomplete',
      comparisonId,
      errors: [`component attribution ${attributedDelta} does not reconcile to landed-cost delta ${totalDeltaRightMinusLeft}`],
    };
  }

  return {
    status: 'complete',
    comparisonId,
    leftCalculationId: left.calculationId,
    rightCalculationId: right.calculationId,
    evidenceClass: left.evidenceClass === 'scenario' || right.evidenceClass === 'scenario' ? 'scenario' : 'derived',
    methodId: 'right-minus-left-normalized-component-attribution-v1',
    currency: left.currency,
    unit: left.unit,
    leftLandedCost: left.amount,
    rightLandedCost: right.amount,
    totalDeltaRightMinusLeft,
    attributedDelta,
    components,
    sourceRecordIds: [...new Set([...left.sourceRecordIds, ...right.sourceRecordIds])],
  };
}
