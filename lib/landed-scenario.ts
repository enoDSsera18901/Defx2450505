import {
  calculateLandedCost,
  type AvailableCostComponent,
  type LandedCostComponentKind,
  type LandedCostInput,
  type LandedCostResult,
  type LandedCostSlot,
} from './landed-cost';

export type ObservedCrudeBasis = {
  benchmark: 'Brent' | 'WTI';
  amount: number;
  currency: 'USD';
  asOf: string;
  sourceRecordId: string;
};

export type LandedCostScenarioAssumptions = {
  crudeBasisPerBbl?: number | null;
  freightPerBbl?: number | null;
  insurancePerBbl?: number | null;
  portTerminalPerBbl?: number | null;
  qualityLocationDifferentialPerBbl?: number | null;
  canalTollApplies: boolean;
  canalTollPerBbl?: number | null;
  financingTimeCostApplies: boolean;
  financingTimeCostPerBbl?: number | null;
};

export type LandedCostScenarioRequest = {
  calculationId: string;
  calculatedAt: string;
  observedCrudeBasis?: ObservedCrudeBasis | null;
  assumptions: LandedCostScenarioAssumptions;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function scenarioComponent(
  calculationId: string,
  kind: LandedCostComponentKind,
  amount: number | null | undefined,
  calculatedAt: string,
): LandedCostSlot {
  if (!finite(amount)) {
    return {
      status: 'unavailable',
      reason: `Scenario assumption for ${kind} has not been provided.`,
    };
  }

  return {
    status: 'available',
    amount,
    currency: 'USD',
    unit: 'per_bbl',
    evidenceClass: 'scenario',
    sourceRecordIds: [`scenario:${calculationId}:${kind}`],
    asOf: calculatedAt,
    methodId: 'user-scenario-input-v1',
  } satisfies AvailableCostComponent;
}

function crudeBasisSlot(request: LandedCostScenarioRequest): LandedCostSlot {
  const observed = request.observedCrudeBasis;
  if (observed) {
    return {
      status: 'available',
      amount: observed.amount,
      currency: observed.currency,
      unit: 'per_bbl',
      evidenceClass: 'observed',
      sourceRecordIds: [observed.sourceRecordId],
      asOf: observed.asOf,
      note: `${observed.benchmark} observed price basis`,
    };
  }

  return scenarioComponent(
    request.calculationId,
    'crude_basis',
    request.assumptions.crudeBasisPerBbl,
    request.calculatedAt,
  );
}

export function buildScenarioLandedCostInput(request: LandedCostScenarioRequest): LandedCostInput {
  const { calculationId, calculatedAt, assumptions } = request;

  return {
    calculationId,
    calculatedAt,
    targetCurrency: 'USD',
    components: {
      crude_basis: crudeBasisSlot(request),
      freight: scenarioComponent(calculationId, 'freight', assumptions.freightPerBbl, calculatedAt),
      insurance: scenarioComponent(calculationId, 'insurance', assumptions.insurancePerBbl, calculatedAt),
      port_terminal: scenarioComponent(calculationId, 'port_terminal', assumptions.portTerminalPerBbl, calculatedAt),
      quality_location_differential: scenarioComponent(
        calculationId,
        'quality_location_differential',
        assumptions.qualityLocationDifferentialPerBbl,
        calculatedAt,
      ),
      canal_toll: assumptions.canalTollApplies
        ? scenarioComponent(calculationId, 'canal_toll', assumptions.canalTollPerBbl, calculatedAt)
        : { status: 'not_applicable', rationale: 'Scenario route is defined as not using a canal/toll.' },
      financing_time_cost: assumptions.financingTimeCostApplies
        ? scenarioComponent(calculationId, 'financing_time_cost', assumptions.financingTimeCostPerBbl, calculatedAt)
        : { status: 'not_applicable', rationale: 'Scenario excludes financing/time cost.' },
    },
  };
}

export function calculateScenarioLandedCost(request: LandedCostScenarioRequest): LandedCostResult {
  return calculateLandedCost(buildScenarioLandedCostInput(request));
}
