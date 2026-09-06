import assert from 'node:assert/strict';
import test from 'node:test';
import type { CargoObservation, VesselObservation } from '../lib/physical-data';
import {
  assessObservationFreshness,
  assertProviderResult,
  type PhysicalOilProvider,
  type ProviderResult,
  validateProviderDefinition,
  validateProviderQuery,
  validateProviderResult,
  validateVesselQuery,
} from '../lib/physical-provider';

const vessel: VesselObservation = {
  kind: 'vessel',
  vesselId: 'vessel-1',
  providerVesselId: 'provider-vessel-1',
  imo: '9876543',
  position: {
    value: { latitude: 1.25, longitude: 103.8 },
    evidenceClass: 'observed',
    sourceRecordIds: ['ais-position-1'],
    asOf: '2026-09-06T14:00:00Z',
  },
  provenance: {
    provider: 'trial-provider',
    providerRecordIds: ['provider-record-1'],
    retrievedAt: '2026-09-06T14:05:00Z',
    observedAt: '2026-09-06T14:00:00Z',
    evidenceClass: 'observed',
    licenceTag: 'trial-only',
  },
};

const vesselResult: ProviderResult<VesselObservation> = {
  providerId: 'trial-provider',
  retrievedAt: '2026-09-06T14:05:00Z',
  requestId: 'request-1',
  partial: false,
  warnings: [],
  records: [vessel],
};

test('accepts a provider definition whose declared capability has an implementation', () => {
  const provider: PhysicalOilProvider = {
    id: 'trial-provider',
    capabilities: ['vessel_observations'],
    async getVesselObservations() {
      return vesselResult;
    },
  };

  assert.deepEqual(validateProviderDefinition(provider), []);
});

test('rejects a declared provider capability without its adapter method', () => {
  const provider = {
    id: 'trial-provider',
    capabilities: ['cargo_observations'],
  } as PhysicalOilProvider;

  assert.ok(validateProviderDefinition(provider).some((error) => error.includes('getCargoObservations')));
});

test('rejects reversed query windows and unreasonable limits before a provider call', () => {
  const errors = validateProviderQuery({
    from: '2026-09-07T00:00:00Z',
    to: '2026-09-06T00:00:00Z',
    limit: 5000,
  });

  assert.ok(errors.some((error) => error.includes('must not precede')));
  assert.ok(errors.some((error) => error.includes('between 1 and 1000')));
});

test('rejects malformed provider-specific vessel filters', () => {
  const errors = validateVesselQuery({
    imo: '   ',
    providerVesselIds: ['provider-vessel-1', ''],
  });

  assert.ok(errors.some((error) => error.includes('query.imo')));
  assert.ok(errors.some((error) => error.includes('providerVesselIds')));
});

test('accepts a valid normalized result for the adapter and expected record kind', () => {
  assert.deepEqual(validateProviderResult('trial-provider', 'vessel', vesselResult), []);
  assert.equal(assertProviderResult('trial-provider', 'vessel', vesselResult), vesselResult);
});

test('rejects provider identity drift and wrong normalized record kind', () => {
  const cargo: CargoObservation = {
    kind: 'cargo',
    cargoId: 'cargo-1',
    state: {
      value: 'loaded',
      evidenceClass: 'observed',
      sourceRecordIds: ['cargo-record-1'],
    },
    provenance: {
      provider: 'other-provider',
      providerRecordIds: ['cargo-record-1'],
      retrievedAt: '2026-09-06T14:05:00Z',
      evidenceClass: 'observed',
    },
  };

  const result = {
    providerId: 'other-provider',
    retrievedAt: '2026-09-06T14:05:00Z',
    partial: false,
    warnings: [],
    records: [cargo],
  } as unknown as ProviderResult<VesselObservation>;

  const errors = validateProviderResult('trial-provider', 'vessel', result);
  assert.ok(errors.some((error) => error.includes('result.providerId')));
  assert.ok(errors.some((error) => error.includes('does not match expected vessel')));
  assert.ok(errors.some((error) => error.includes('provenance.provider')));
});

test('requires an explanation whenever a provider response is partial', () => {
  const result: ProviderResult<VesselObservation> = {
    ...vesselResult,
    partial: true,
    warnings: [],
  };

  assert.ok(validateProviderResult('trial-provider', 'vessel', result).some((error) => error.includes('requires at least one warning')));
});

test('fails closed rather than crashing on an unnormalized record missing provenance', () => {
  const result = {
    providerId: 'trial-provider',
    retrievedAt: '2026-09-06T14:05:00Z',
    partial: false,
    warnings: [],
    records: [{ kind: 'vessel', vesselId: 'bad' }],
  } as unknown as ProviderResult<VesselObservation>;

  assert.ok(validateProviderResult('trial-provider', 'vessel', result).some((error) => error.includes('provenance is required')));
});

test('classifies observation freshness without pretending unknown or future timestamps are current', () => {
  assert.equal(assessObservationFreshness(vessel, '2026-09-06T15:00:00Z', 2).status, 'fresh');
  assert.equal(assessObservationFreshness(vessel, '2026-09-06T20:00:00Z', 2).status, 'stale');
  assert.equal(assessObservationFreshness(vessel, '2026-09-06T13:00:00Z', 2).status, 'future');

  const withoutObservationTime: VesselObservation = {
    ...vessel,
    provenance: {
      ...vessel.provenance,
      observedAt: null,
      effectiveAt: null,
    },
  };
  assert.equal(assessObservationFreshness(withoutObservationTime, '2026-09-06T15:00:00Z', 2).status, 'unknown');
});
