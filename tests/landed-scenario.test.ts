import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateScenarioLandedCost, type LandedCostScenarioRequest } from '../lib/landed-scenario';

function baseRequest(): LandedCostScenarioRequest {
  return {
    calculationId: 'scenario-1',
    calculatedAt: '2026-09-07T01:30:00+09:30',
    observedCrudeBasis: {
      benchmark: 'Brent',
      amount: 72,
      currency: 'USD',
      asOf: '2026-08-01T00:00:00Z',
      sourceRecordId: 'EIA:RBRTE:2026-08',
    },
    assumptions: {
      freightPerBbl: 2.2,
      insurancePerBbl: 0.3,
      portTerminalPerBbl: 0.7,
      qualityLocationDifferentialPerBbl: -0.8,
      canalTollApplies: false,
      financingTimeCostApplies: false,
    },
  };
}

test('combines an observed public crude basis with explicit scenario costs', () => {
  const result = calculateScenarioLandedCost(baseRequest());

  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.amount, 74.4);
  assert.equal(result.evidenceClass, 'scenario');
  assert.ok(result.sourceRecordIds.includes('EIA:RBRTE:2026-08'));
  assert.ok(result.scenarioComponentKinds.includes('freight'));
  assert.ok(!result.scenarioComponentKinds.includes('crude_basis'));
});

test('supports a fully explicit scenario crude basis when the public feed is unavailable', () => {
  const request = baseRequest();
  request.observedCrudeBasis = null;
  request.assumptions.crudeBasisPerBbl = 71.5;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.evidenceClass, 'scenario');
  assert.ok(result.scenarioComponentKinds.includes('crude_basis'));
  assert.ok(result.sourceRecordIds.includes('scenario:scenario-1:crude_basis'));
});

test('fails closed when neither observed nor scenario crude basis exists', () => {
  const request = baseRequest();
  request.observedCrudeBasis = null;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.unavailableComponentKinds.includes('crude_basis'));
});

test('fails closed when required scenario freight is omitted', () => {
  const request = baseRequest();
  request.assumptions.freightPerBbl = null;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.unavailableComponentKinds.includes('freight'));
});

test('requires a canal cost when the scenario says a canal applies', () => {
  const request = baseRequest();
  request.assumptions.canalTollApplies = true;
  request.assumptions.canalTollPerBbl = null;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'incomplete');
  if (result.status !== 'incomplete') return;
  assert.ok(result.unavailableComponentKinds.includes('canal_toll'));
});

test('allows an explicit canal scenario cost and preserves scenario provenance', () => {
  const request = baseRequest();
  request.assumptions.canalTollApplies = true;
  request.assumptions.canalTollPerBbl = 0.45;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  assert.equal(result.amount, 74.85);
  assert.ok(result.scenarioComponentKinds.includes('canal_toll'));
  assert.ok(result.sourceRecordIds.includes('scenario:scenario-1:canal_toll'));
});

test('keeps a negative quality/location differential as an explicit scenario input', () => {
  const request = baseRequest();
  request.assumptions.qualityLocationDifferentialPerBbl = -2.5;

  const result = calculateScenarioLandedCost(request);
  assert.equal(result.status, 'complete');
  if (result.status !== 'complete') return;
  const differential = result.components.find((component) => component.kind === 'quality_location_differential');
  assert.equal(differential?.amount, -2.5);
});
