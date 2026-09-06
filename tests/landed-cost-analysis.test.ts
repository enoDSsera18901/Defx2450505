import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeLandedCostSensitivity,
  compareLandedCostInputs,
  explainLandedCost,
} from '../lib/landed-cost-analysis';
import type { AvailableCostComponent, LandedCostInput, LandedCostSlot } from '../lib/landed-cost';

const observed = (amount: number, source: string, currency = 'USD'): AvailableCostComponent => ({
  status: 'available',
  amount,
  currency,
  unit: 'per_bbl',
  evidenceClass: 'observed',
  sourceRecordIds: [source],
  asOf: '2026-09-07T00:00:00Z',
});

const scenario = (amount: number, source: string): AvailableCostComponent => ({
  status: 'available',
  amount,
  currency: 'USD',
  unit: 'per_bbl',
  evidenceClass: 'scenario',
  sourceRecordIds: [source],
  asOf: '2026-09-07T00:00:00Z',
  methodId: 'analyst-scenario-input-v1',
});

function baseInput(id = 'lc-analysis-base'): LandedCostInput {
  return {
    calculationId: id,
    calculatedAt: '2026-09-07T00:30:00Z',
    targetCurrency: 'USD',
    components: {
      crude_basis: observed(70, 'price-brent-1'),
      freight: observed(2.25, 'freight-1'),
      insurance: observed(0.35, 'insurance-1'),
      port_terminal: observed(0.8, 'port-1'),
      canal_toll: { status: 'not_applicable', rationale: 'Route does not use a canal.' },
      quality_location_differential: observed(-1.1, 'diff-1'),
      financing_time_cost: { status: 'not_applicable', rationale: 'Excluded from comparison.' },
    },
  };
}

function replace(
  input: LandedCostInput,
  kind: keyof LandedCostInput['components'],
  slot: LandedCostSlot,
): LandedCostInput {
  return { ...input, components: { ...input.components, [kind]: slot } };
}

test('builds an auditable evidence chain from source component through FX and aggregation', () => {
  const input = replace(baseInput(), 'port_terminal', {
    ...observed(1.2, 'port-aud-1', 'AUD'),
    fx: {
      rate: 0.67,
      fromCurrency: 'AUD',
      toCurrency: 'USD',
      asOf: '2026-09-07T00:00:00Z',
      evidenceClass: 'observed',
      sourceRecordIds: ['fx-aud-usd-1'],
    },
  });

  const chain = explainLandedCost(input);
  assert.equal(chain.status, 'complete');
  if (chain.status !== 'complete') return;

  const port = chain.components.find((entry) => entry.componentKind === 'port_terminal');
  assert.equal(port?.status, 'available');
  if (!port || port.status !== 'available') return;
  assert.equal(port.inputAmount, 1.2);
  assert.equal(port.inputCurrency, 'AUD');
  assert.equal(port.normalizedAmount, 0.804);
  assert.equal(port.fxApplied, true);
  assert.equal(port.fx?.rate, 0.67);
  assert.deepEqual(port.fx?.sourceRecordIds, ['fx-aud-usd-1']);
  assert.equal(chain.aggregation.methodId, 'sum-normalized-per-bbl-components-v1');
  assert.ok(chain.aggregation.sourceRecordIds.includes('price-brent-1'));
  assert.ok(chain.aggregation.sourceRecordIds.includes('fx-aud-usd-1'));
});

test('runs one-at-a-time normalized component stresses and always labels the analysis scenario', () => {
  const result = analyzeLandedCostSensitivity('sens-1', baseInput(), [
    { shockId: 'freight-plus-1', componentKind: 'freight', mode: 'absolute_per_bbl', deltaPerBbl: 1 },
    { shockId: 'crude-plus-10pct', componentKind: 'crude_basis', mode: 'percent_of_normalized_component', percent: 10 },
  ]);

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.baseLandedCost, 72.3);
  assert.equal(result.evidenceClass, 'scenario');
  assert.equal(result.baseEvidenceClass, 'derived');
  assert.match(result.stressBasis, /base source observations remain unchanged/);

  const freight = result.points.find((point) => point.shockId === 'freight-plus-1');
  assert.equal(freight?.stressedComponentAmount, 3.25);
  assert.equal(freight?.stressedLandedCost, 73.3);
  assert.equal(freight?.landedCostDelta, 1);

  const crude = result.points.find((point) => point.shockId === 'crude-plus-10pct');
  assert.equal(crude?.stressedComponentAmount, 77);
  assert.equal(crude?.stressedLandedCost, 79.3);
  assert.equal(crude?.landedCostDelta, 7);
});

test('sensitivity fails closed when the base landed cost is incomplete', () => {
  const input = replace(baseInput(), 'freight', {
    status: 'unavailable',
    reason: 'No licensed freight observation.',
  });
  const result = analyzeLandedCostSensitivity('sens-incomplete', input, [
    { shockId: 'freight-plus-1', componentKind: 'freight', mode: 'absolute_per_bbl', deltaPerBbl: 1 },
  ]);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('base calculation: freight')));
});

test('sensitivity rejects a stress that would make a non-differential cost negative', () => {
  const result = analyzeLandedCostSensitivity('sens-negative', baseInput(), [
    { shockId: 'bad-freight', componentKind: 'freight', mode: 'absolute_per_bbl', deltaPerBbl: -3 },
  ]);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('freight stressed amount must be >= 0')));
});

test('sensitivity cannot inject a cost into a component explicitly marked not applicable', () => {
  const result = analyzeLandedCostSensitivity('sens-canal', baseInput(), [
    { shockId: 'canal-plus', componentKind: 'canal_toll', mode: 'absolute_per_bbl', deltaPerBbl: 0.5 },
  ]);

  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.errors.some((error) => error.includes('canal_toll is not an available component')));
});

test('compares two complete landed costs and reconciles component attribution to the total delta', () => {
  const left = baseInput('left');
  let right = baseInput('right');
  right = replace(right, 'freight', observed(3.25, 'freight-2'));
  right = replace(right, 'canal_toll', scenario(0.4, 'scenario:right:canal_toll'));

  const comparison = compareLandedCostInputs('compare-1', left, right);
  assert.equal(comparison.status, 'complete');
  if (comparison.status !== 'complete') return;
  assert.equal(comparison.leftLandedCost, 72.3);
  assert.equal(comparison.rightLandedCost, 73.7);
  assert.ok(Math.abs(comparison.totalDeltaRightMinusLeft - 1.4) < 1e-12);
  assert.ok(Math.abs(comparison.attributedDelta - comparison.totalDeltaRightMinusLeft) < 1e-12);
  assert.equal(comparison.evidenceClass, 'scenario');

  const freight = comparison.components.find((component) => component.componentKind === 'freight');
  assert.equal(freight?.deltaRightMinusLeft, 1);
  const canal = comparison.components.find((component) => component.componentKind === 'canal_toll');
  assert.equal(canal?.left.included, false);
  assert.equal(canal?.right.included, true);
  assert.equal(canal?.deltaRightMinusLeft, 0.4);
});

test('comparison fails closed rather than attributing an incomplete calculation', () => {
  const left = baseInput('left-incomplete');
  const right = replace(baseInput('right-incomplete'), 'insurance', {
    status: 'unavailable',
    reason: 'Insurance basis unavailable.',
  });

  const comparison = compareLandedCostInputs('compare-incomplete', left, right);
  assert.equal(comparison.status, 'incomplete');
  if (comparison.status !== 'incomplete') return;
  assert.ok(comparison.errors.some((error) => error.includes('right calculation: insurance')));
});
