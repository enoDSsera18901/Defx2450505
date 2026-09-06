import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type CargoObservation,
  type FreightObservation,
  type RouteEstimate,
  type VesselObservation,
  validatePhysicalObservation,
} from '../lib/physical-data';

const observedProvenance = {
  provider: 'trial-provider',
  providerRecordIds: ['provider-record-1'],
  retrievedAt: '2026-09-07T00:00:00+09:30',
  observedAt: '2026-09-06T14:29:00Z',
  evidenceClass: 'observed' as const,
  confidence: 0.95,
  licenceTag: 'trial-only',
};

test('accepts a source-identified observed vessel position', () => {
  const vessel: VesselObservation = {
    kind: 'vessel',
    vesselId: 'vessel-1',
    providerVesselId: 'provider-vessel-1',
    imo: '9876543',
    position: {
      value: { latitude: 1.25, longitude: 103.8 },
      evidenceClass: 'observed',
      sourceRecordIds: ['ais-position-1'],
      asOf: '2026-09-06T14:29:00Z',
      confidence: 0.99,
    },
    provenance: observedProvenance,
  };

  assert.deepEqual(validatePhysicalObservation(vessel), []);
});

test('rejects an out-of-range AIS position', () => {
  const vessel: VesselObservation = {
    kind: 'vessel',
    vesselId: 'vessel-1',
    providerVesselId: 'provider-vessel-1',
    mmsi: '123456789',
    position: {
      value: { latitude: 95, longitude: 181 },
      evidenceClass: 'observed',
      sourceRecordIds: ['ais-position-1'],
    },
    provenance: observedProvenance,
  };

  const errors = validatePhysicalObservation(vessel);
  assert.ok(errors.some((error) => error.includes('latitude')));
  assert.ok(errors.some((error) => error.includes('longitude')));
});

test('requires a method for provider-estimated cargo quantity', () => {
  const cargo: CargoObservation = {
    kind: 'cargo',
    cargoId: 'cargo-1',
    vesselId: 'vessel-1',
    quantity: {
      value: { amount: 900_000, unit: 'bbl', basis: 'provider_estimated' },
      evidenceClass: 'estimated',
      sourceRecordIds: ['cargo-provider-1'],
    },
    state: {
      value: 'in_transit',
      evidenceClass: 'observed',
      sourceRecordIds: ['cargo-provider-1'],
    },
    provenance: observedProvenance,
  };

  assert.ok(validatePhysicalObservation(cargo).some((error) => error.includes('quantity.methodId')));
});

test('does not allow reported quantity to masquerade as estimated evidence', () => {
  const cargo: CargoObservation = {
    kind: 'cargo',
    cargoId: 'cargo-1',
    quantity: {
      value: { amount: 1_000_000, unit: 'bbl', basis: 'reported' },
      evidenceClass: 'estimated',
      sourceRecordIds: ['cargo-provider-1'],
      methodId: 'provider-estimate-v1',
    },
    state: {
      value: 'loaded',
      evidenceClass: 'observed',
      sourceRecordIds: ['cargo-provider-1'],
    },
    provenance: observedProvenance,
  };

  assert.ok(validatePhysicalObservation(cargo).some((error) => error.includes('reported cargo quantity')));
});

test('requires explicit method metadata for an estimated ETA', () => {
  const route: RouteEstimate = {
    kind: 'route',
    routeId: 'route-1',
    vesselId: 'vessel-1',
    eta: {
      value: { timestamp: '2026-09-12T08:00:00Z', uncertaintyHours: 8 },
      evidenceClass: 'estimated',
      sourceRecordIds: ['ais-position-1'],
      confidence: 0.7,
    },
    provenance: {
      ...observedProvenance,
      evidenceClass: 'estimated',
      methodId: 'route-model-v1',
    },
  };

  assert.ok(validatePhysicalObservation(route).some((error) => error.includes('eta.methodId')));
});

test('rejects zero-valued freight rather than treating a missing component as free', () => {
  const freight: FreightObservation = {
    kind: 'freight',
    freightId: 'freight-1',
    origin: 'Ras Tanura',
    destination: 'Singapore',
    rate: {
      value: { amount: 0, currency: 'USD', unit: 'usd_per_bbl' },
      evidenceClass: 'observed',
      sourceRecordIds: ['freight-provider-1'],
    },
    provenance: observedProvenance,
  };

  assert.ok(validatePhysicalObservation(freight).some((error) => error.includes('rate.amount')));
});
