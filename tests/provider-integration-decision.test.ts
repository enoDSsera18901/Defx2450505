import assert from 'node:assert/strict';
import test from 'node:test';
import type { CargoObservation, FreightObservation, PhysicalObservation, VesselObservation } from '../lib/physical-data';
import type { ProviderCommercialRightsPacket } from '../lib/provider-commercial-rights';
import type { PhysicalReferenceCatalog } from '../lib/physical-reference';
import { assessProviderIntegrationDecision } from '../lib/provider-integration-decision';
import type { ProviderTrialDataset } from '../lib/provider-trial';

const providerId = 'candidate-provider';
const capturedAt = '2026-09-07T00:00:00Z';

function catalog(): PhysicalReferenceCatalog {
  return {
    schemaVersion: 1,
    references: [
      { kind: 'commodity', id: 'commodity:crude', name: 'Crude Oil', aliases: ['crude'], family: 'crude_oil' },
      { kind: 'grade', id: 'grade:a', name: 'Grade A', commodityId: 'commodity:crude' },
      { kind: 'grade', id: 'grade:b', name: 'Grade B', commodityId: 'commodity:crude' },
      { kind: 'location', id: 'location:load-a', name: 'Load A', locationType: 'terminal' },
      { kind: 'location', id: 'location:load-b', name: 'Load B', locationType: 'terminal' },
      { kind: 'location', id: 'location:dest-a', name: 'Dest A', locationType: 'port' },
      { kind: 'location', id: 'location:dest-b', name: 'Dest B', locationType: 'port' },
    ],
  };
}

function provenance(id: string, observedAt = '2026-09-06T23:00:00Z') {
  return {
    provider: providerId,
    providerRecordIds: [id],
    retrievedAt: capturedAt,
    observedAt,
    evidenceClass: 'observed' as const,
    licenceTag: 'trial-only',
  };
}

function vessel(index: number): VesselObservation {
  return {
    kind: 'vessel',
    vesselId: `v-${index}`,
    providerVesselId: `pv-${index}`,
    imo: `9000${String(index).padStart(3, '0')}`,
    provenance: provenance(`vessel-${index}`),
  };
}

function cargo(index: number): CargoObservation {
  const routeA = index % 2 === 0;
  return {
    kind: 'cargo',
    cargoId: `c-${index}`,
    vesselId: `v-${index % 8}`,
    commodity: { value: 'Crude Oil', evidenceClass: 'observed', sourceRecordIds: [`cargo-${index}`] },
    grade: { value: routeA ? 'Grade A' : 'Grade B', evidenceClass: 'observed', sourceRecordIds: [`cargo-${index}`] },
    quantity: {
      value: { amount: 700_000 + index, unit: 'bbl', basis: 'reported' },
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-${index}`],
    },
    loadPort: { value: routeA ? 'Load A' : 'Load B', evidenceClass: 'observed', sourceRecordIds: [`cargo-${index}`] },
    destination:
      index === 1
        ? null
        : { value: routeA ? 'Dest A' : 'Dest B', evidenceClass: 'observed', sourceRecordIds: [`cargo-${index}`] },
    state: {
      value: index === 0 ? 'delivered' : 'in_transit',
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-${index}`],
    },
    provenance: provenance(`cargo-${index}`, index === 0 ? '2026-08-20T00:00:00Z' : '2026-09-06T23:00:00Z'),
  };
}

function freight(): FreightObservation {
  return {
    kind: 'freight',
    freightId: 'freight-1',
    origin: 'Load A',
    destination: 'Dest A',
    rate: {
      value: { amount: 80, unit: 'worldscale' },
      evidenceClass: 'observed',
      sourceRecordIds: ['freight-1'],
    },
    provenance: provenance('freight-1'),
  };
}

function trial(): ProviderTrialDataset {
  const records: PhysicalObservation[] = [
    ...Array.from({ length: 8 }, (_, index) => vessel(index)),
    ...Array.from({ length: 12 }, (_, index) => cargo(index)),
    freight(),
  ];
  return {
    providerId,
    capturedAt,
    freshnessThresholdHours: { vessel: 2, cargo: 24, port_event: 24, route: 6, freight: 168 },
    referenceCatalog: catalog(),
    records,
  };
}

function rights(): ProviderCommercialRightsPacket {
  const sourceDocumentIds = ['agreement-1'];
  return {
    schemaVersion: 1,
    providerId,
    licenceTag: 'commercial-v1',
    reviewedAt: capturedAt,
    rights: [
      { right: 'web_display', status: 'permitted', sourceDocumentIds },
      { right: 'historical_storage', status: 'permitted', sourceDocumentIds },
      { right: 'derived_data', status: 'permitted', sourceDocumentIds },
      { right: 'export_derived_briefs', status: 'permitted', sourceDocumentIds },
      { right: 'retention_after_subscription', status: 'permitted', sourceDocumentIds },
    ],
    attribution: { status: 'not_required', sourceDocumentIds },
    seatScope: { status: 'specified', description: 'Named-user scope is recorded.', sourceDocumentIds },
    apiDatasetScope: {
      status: 'specified',
      datasets: ['cargo', 'maritime', 'freight'],
      description: 'Included data families are recorded.',
      sourceDocumentIds,
    },
    rateLimits: { status: 'specified', description: 'Rate limits are recorded.', sourceDocumentIds },
    pricing: { status: 'specified', description: 'Pricing is recorded.', sourceDocumentIds },
  };
}

test('requires both provider-trial evidence and commercial rights before controlled integration', () => {
  const decision = assessProviderIntegrationDecision(trial(), rights());

  assert.equal(decision.status, 'ready_for_controlled_integration');
  assert.equal(decision.providerId, providerId);
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.trial.evidenceComplete, true);
  assert.equal(decision.commercialRights.status, 'ready');
  assert.equal(decision.recordReleaseRequiresPerObservationCommercialUseCheck, true);
  assert.ok(decision.boundary.includes('no observation for product exposure'));
});

test('blocks integration when the data trial is incomplete even if rights are ready', () => {
  const dataset = trial();
  dataset.records = dataset.records.slice(0, 5);

  const decision = assessProviderIntegrationDecision(dataset, rights());
  assert.equal(decision.status, 'blocked');
  assert.ok(decision.blockers.some((blocker) => blocker.includes('provider trial evidence incomplete')));
});

test('blocks integration when commercial rights are unresolved even if the trial is complete', () => {
  const packet = rights();
  const display = packet.rights.find((term) => term.right === 'web_display');
  assert.ok(display);
  display.status = 'unknown';

  const decision = assessProviderIntegrationDecision(trial(), packet);
  assert.equal(decision.status, 'blocked');
  assert.ok(decision.blockers.includes('commercial rights: web_display permission is unknown'));
});

test('blocks provider identity mismatch across evidence packets', () => {
  const packet = rights();
  packet.providerId = 'different-provider';

  const decision = assessProviderIntegrationDecision(trial(), packet);
  assert.equal(decision.status, 'blocked');
  assert.equal(decision.providerId, '');
  assert.ok(decision.blockers.some((blocker) => blocker.includes('provider identity mismatch')));
});

test('fails closed when both evidence packets are malformed', () => {
  const decision = assessProviderIntegrationDecision(null, null);

  assert.equal(decision.status, 'blocked');
  assert.ok(decision.blockers.length >= 2);
  assert.equal(decision.recordReleaseRequiresPerObservationCommercialUseCheck, true);
});
