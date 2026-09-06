import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLandedCost,
  type AvailableCostComponent,
  type LandedCostInput,
  type LandedCostSlot,
} from '../lib/landed-cost';

const observed = (amount: number, source: string, currency = 'USD'): AvailableCostComponent => ({
  status: 'available',
  amount,
  currency,
  unit: 'per_bbl',
  evidenceClass: 'observed',
  sourceRecordIds: [source],
  asOf: '2026-09-06T15:00:00Z',
});

function baseInput(): LandedCostInput {
  return {
    calculationId: 'lc-1',
    calculatedAt: '2026-09-06T15:30:00Z',
    targetCurrency: 'USD',
    components: {
      crude_basis: observed(70, 'price-brent-1'),
      freight: observed(2.25, 'freight-1'),
      insurance: observed(0.35, 'insurance-1'),
      port_terminal: observed(0.8, 'port-fee-1'),
      canal_toll: { status: 'not_applicable', rationale: 'Route does not transit a canal.' },
      quality_location_differential: observed(-1.1, 'diff-1'),
      financing_time_cost: { status: 'not_applicable', rationale: 'Excluded from this cash-on-delivery comparison.' },
    },
  };
}

function replace(input: LandedCostInput, kind: keyof LandedCostInput['components'], slot: LandedCostSlot): LandedCostInput {
  return {
    ...input,
    components: {
      ...input.components,
      [kind]: slot,
    },
  };
}

test('calculates a derived USD/bbl landed cost only when all required slots are explicit', () => {
  const result = calculateLandedCost(baseInput());

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.amount, 72.3);
  assert.equal(result.currency, 'USD');
  assert.equal(result.unit, 'per_bbl');
  assert.equal(result.evidenceClass, 'derived');
  assert.deepEqual(result.scenarioComponentKinds, []);
  assert.ok(result.sourceRecordIds.includes('freight-1'));
  assert.ok(result.sourceRecordIds.includes('price-brent-1'));
});

test('fails closed when a required freight component is unavailable', () => {
  const input = replace(baseInput(), 'freight', {
    status: 'unavailable',
    reason: 'No licensed route freight observation is available.',
  });
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.unavailableComponentKinds.includes('freight'));
  assert.ok(result.errors.some((error) => error.includes('freight must be available')));
});

test('does not allow a required component to hide behind not_applicable', () => {
  const input = replace(baseInput(), 'insurance', {
    status: 'not_applicable',
    rationale: 'Pretend insurance is free.',
  });
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('insurance is required')));
});

test('requires explicit FX evidence for mixed-currency inputs', () => {
  const input = replace(baseInput(), 'port_terminal', observed(1.2, 'port-fee-aud', 'AUD'));
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('port_terminal.fx is required')));
});

test('converts a mixed-currency component only with matching sourced FX metadata', () => {
  const audPort: AvailableCostComponent = {
    ...observed(1.2, 'port-fee-aud', 'AUD'),
    fx: {
      rate: 0.67,
      fromCurrency: 'AUD',
      toCurrency: 'USD',
      asOf: '2026-09-06T15:00:00Z',
      evidenceClass: 'observed',
      sourceRecordIds: ['fx-aud-usd-1'],
    },
  };
  const input = replace(baseInput(), 'port_terminal', audPort);
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.amount, 72.304);
  const port = result.components.find((component) => component.kind === 'port_terminal');
  assert.equal(port?.fxApplied, true);
  assert.deepEqual(port?.fxSourceRecordIds, ['fx-aud-usd-1']);
  assert.ok(result.sourceRecordIds.includes('fx-aud-usd-1'));
});

test('promotes the landed-cost total to scenario when any component or FX input is scenario-labelled', () => {
  const input = replace(baseInput(), 'insurance', {
    status: 'available',
    amount: 0.4,
    currency: 'USD',
    unit: 'per_bbl',
    evidenceClass: 'scenario',
    sourceRecordIds: ['analyst-assumption-1'],
    asOf: '2026-09-06T15:00:00Z',
    methodId: 'analyst-insurance-assumption-v1',
  });
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.evidenceClass, 'scenario');
  assert.deepEqual(result.scenarioComponentKinds, ['insurance']);
});

test('allows an explicitly sourced zero differential but rejects negative freight', () => {
  const zeroDiff = replace(baseInput(), 'quality_location_differential', observed(0, 'diff-zero-1'));
  const zeroResult = calculateLandedCost(zeroDiff);
  assert.equal(zeroResult.status, 'complete');

  const negativeFreight = replace(baseInput(), 'freight', observed(-0.5, 'bad-freight-1'));
  const negativeResult = calculateLandedCost(negativeFreight);
  assert.equal(negativeResult.status, 'incomplete');
  if (negativeResult.status !== 'incomplete') return;
  assert.ok(negativeResult.errors.some((error) => error.includes('freight.amount must be >= 0')));
});

test('requires method metadata for non-observed components', () => {
  const input = replace(baseInput(), 'port_terminal', {
    status: 'available',
    amount: 0.75,
    currency: 'USD',
    unit: 'per_bbl',
    evidenceClass: 'estimated',
    sourceRecordIds: ['port-estimate-1'],
    asOf: '2026-09-06T15:00:00Z',
  });
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('port_terminal.methodId is required')));
});

test('rejects redundant FX conversion when a component is already in target currency', () => {
  const input = replace(baseInput(), 'insurance', {
    ...observed(0.35, 'insurance-1'),
    fx: {
      rate: 1,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      asOf: '2026-09-06T15:00:00Z',
      evidenceClass: 'observed',
      sourceRecordIds: ['fx-usd-usd-1'],
    },
  });
  const result = calculateLandedCost(input);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('insurance.fx must be omitted')));
});
