import assert from 'node:assert/strict';
import test from 'node:test';
import type { CargoObservation, FreightObservation, PhysicalObservation, VesselObservation } from '../lib/physical-data';
import type { PhysicalReferenceCatalog } from '../lib/physical-reference';
import { evaluateProviderTrial, type ProviderTrialDataset } from '../lib/provider-trial';

const provider = 'trial-provider';
const capturedAt = '2026-09-07T00:00:00Z';
const thresholds = {
  vessel: 2,
  cargo: 24,
  port_event: 24,
  route: 6,
  freight: 168,
} as const;

function referenceCatalog(): PhysicalReferenceCatalog {
  return {
    schemaVersion: 1,
    references: [
      {
        kind: 'commodity',
        id: 'commodity:crude-oil',
        name: 'Crude Oil',
        aliases: ['crude oil'],
        family: 'crude_oil',
      },
      {
        kind: 'grade',
        id: 'grade:arab-light',
        name: 'Arab Light',
        aliases: ['AL'],
        commodityId: 'commodity:crude-oil',
      },
      {
        kind: 'grade',
        id: 'grade:murban',
        name: 'Murban',
        aliases: ['Provider Murban'],
        commodityId: 'commodity:crude-oil',
      },
      { kind: 'location', id: 'location:ras-tanura', name: 'Ras Tanura', locationType: 'terminal' },
      { kind: 'location', id: 'location:fujairah', name: 'Fujairah', locationType: 'port' },
      { kind: 'location', id: 'location:singapore', name: 'Singapore', locationType: 'port' },
      { kind: 'location', id: 'location:yeosu', name: 'Yeosu', locationType: 'port' },
      { kind: 'location', id: 'location:arabian-gulf', name: 'Arabian Gulf', locationType: 'region' },
    ],
  };
}

function provenance(id: string, observedAt = '2026-09-06T23:30:00Z') {
  return {
    provider,
    providerRecordIds: [id],
    retrievedAt: capturedAt,
    observedAt,
    evidenceClass: 'observed' as const,
    licenceTag: 'trial-only',
  };
}

function makeVessel(index: number): VesselObservation {
  return {
    kind: 'vessel',
    vesselId: `vessel-${index}`,
    providerVesselId: `provider-vessel-${index}`,
    imo: `90000${String(index).padStart(2, '0')}`,
    position: {
      value: { latitude: 1 + index / 100, longitude: 103 + index / 100 },
      evidenceClass: 'observed',
      sourceRecordIds: [`ais-${index}`],
      asOf: '2026-09-06T23:30:00Z',
    },
    provenance: provenance(`vessel-record-${index}`),
  };
}

function makeCargo(index: number): CargoObservation {
  const routeA = index % 2 === 0;
  const delivered = index === 0;
  const ambiguous = index === 1;
  return {
    kind: 'cargo',
    cargoId: `cargo-${index}`,
    vesselId: `vessel-${index % 10}`,
    commodity: {
      value: 'crude oil',
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-record-${index}`],
    },
    grade: {
      value: routeA ? 'Arab Light' : 'Murban',
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-record-${index}`],
    },
    quantity: {
      value: { amount: 700_000 + index * 10_000, unit: 'bbl', basis: 'reported' },
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-record-${index}`],
    },
    loadPort: {
      value: routeA ? 'Ras Tanura' : 'Fujairah',
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-record-${index}`],
    },
    destination: ambiguous
      ? null
      : {
          value: routeA ? 'Singapore' : 'Yeosu',
          evidenceClass: 'observed',
          sourceRecordIds: [`cargo-record-${index}`],
        },
    state: {
      value: delivered ? 'delivered' : 'in_transit',
      evidenceClass: 'observed',
      sourceRecordIds: [`cargo-record-${index}`],
    },
    provenance: provenance(`cargo-record-${index}`, delivered ? '2026-08-20T00:00:00Z' : '2026-09-06T23:00:00Z'),
  };
}

function makeFreight(): FreightObservation {
  return {
    kind: 'freight',
    freightId: 'freight-1',
    origin: 'Arabian Gulf',
    destination: 'Singapore',
    rate: {
      value: { amount: 82.5, unit: 'worldscale' },
      evidenceClass: 'observed',
      sourceRecordIds: ['freight-record-1'],
    },
    provenance: provenance('freight-record-1', '2026-09-05T00:00:00Z'),
  };
}

function completeDataset(): ProviderTrialDataset {
  const records: PhysicalObservation[] = [
    ...Array.from({ length: 10 }, (_, index) => makeVessel(index)),
    ...Array.from({ length: 12 }, (_, index) => makeCargo(index)),
    makeFreight(),
  ];
  return {
    providerId: provider,
    capturedAt,
    freshnessThresholdHours: { ...thresholds },
    referenceCatalog: referenceCatalog(),
    records,
  };
}

test('reports a structurally complete bounded trial sample using canonical reference identity', () => {
  const report = evaluateProviderTrial(completeDataset());

  assert.deepEqual(report.errors, []);
  assert.equal(report.recordCounts.vesselAndCargo, 22);
  assert.equal(report.cargoCoverage.delivered, 1);
  assert.equal(report.cargoCoverage.missingOrAmbiguousDestination, 1);
  assert.equal(report.cargoCoverage.distinctRawGradeLabels, 2);
  assert.equal(report.cargoCoverage.distinctCanonicalGrades, 2);
  assert.equal(report.cargoCoverage.distinctRawRoutes, 2);
  assert.equal(report.cargoCoverage.distinctCanonicalRoutes, 2);
  assert.equal(report.referenceResolution.fieldsPresent, 49);
  assert.equal(report.referenceResolution.resolved, 49);
  assert.equal(report.referenceResolution.ambiguous, 0);
  assert.equal(report.referenceResolution.unresolved, 0);
  assert.equal(report.recordCounts.freight, 1);
  assert.equal(report.evidenceComplete, true);
});

test('keeps stale historical evidence visible instead of treating it as current', () => {
  const report = evaluateProviderTrial(completeDataset());

  assert.ok(report.freshness.stale >= 1);
  assert.ok(report.freshness.fresh >= 1);
});

test('canonical grade diversity is not inflated by provider aliases', () => {
  const dataset = completeDataset();
  const cargo = dataset.records.find((record): record is CargoObservation => record.kind === 'cargo' && record.cargoId === 'cargo-2');
  assert.ok(cargo?.grade);
  cargo.grade.value = 'AL';

  const report = evaluateProviderTrial(dataset);
  assert.equal(report.cargoCoverage.distinctRawGradeLabels, 3);
  assert.equal(report.cargoCoverage.distinctCanonicalGrades, 2);
  assert.equal(report.checks.find((check) => check.id === 'multiple_grades')?.pass, true);
  assert.equal(report.evidenceComplete, true);
});

test('ambiguous provider aliases are surfaced and block trial completeness', () => {
  const dataset = completeDataset();
  const arabLight = dataset.referenceCatalog.references.find((reference) => reference.id === 'grade:arab-light');
  assert.ok(arabLight && arabLight.kind === 'grade');
  arabLight.aliases = [...(arabLight.aliases ?? []), 'Provider Murban'];

  const cargo = dataset.records.find((record): record is CargoObservation => record.kind === 'cargo' && record.cargoId === 'cargo-3');
  assert.ok(cargo?.grade);
  cargo.grade.value = 'Provider Murban';

  const report = evaluateProviderTrial(dataset);
  assert.equal(report.referenceResolution.ambiguous, 1);
  assert.equal(report.referenceResolution.issues[0]?.status, 'ambiguous');
  assert.deepEqual(report.referenceResolution.issues[0]?.candidateIds, ['grade:arab-light', 'grade:murban']);
  assert.equal(report.checks.find((check) => check.id === 'reference_resolution_complete')?.pass, false);
  assert.equal(report.evidenceComplete, false);
});

test('unresolved supplied references remain explicit and block trial completeness', () => {
  const dataset = completeDataset();
  const cargo = dataset.records.find((record): record is CargoObservation => record.kind === 'cargo' && record.cargoId === 'cargo-3');
  assert.ok(cargo?.grade);
  cargo.grade.value = 'Mystery Provider Grade';

  const report = evaluateProviderTrial(dataset);
  assert.equal(report.referenceResolution.unresolved, 1);
  assert.equal(report.referenceResolution.issues[0]?.rawValue, 'Mystery Provider Grade');
  assert.deepEqual(report.referenceResolution.issues[0]?.sourceRecordIds, ['cargo-record-3']);
  assert.equal(report.checks.find((check) => check.id === 'reference_resolution_complete')?.pass, false);
  assert.equal(report.evidenceComplete, false);
});

test('missing or invalid reference catalog blocks canonical diversity claims', () => {
  const dataset = { ...completeDataset(), referenceCatalog: undefined };

  const report = evaluateProviderTrial(dataset);
  assert.equal(report.referenceResolution.catalogAvailable, false);
  assert.equal(report.cargoCoverage.distinctCanonicalGrades, 0);
  assert.equal(report.cargoCoverage.distinctCanonicalRoutes, 0);
  assert.equal(report.checks.find((check) => check.id === 'reference_catalog')?.pass, false);
  assert.equal(report.checks.find((check) => check.id === 'multiple_grades')?.pass, false);
  assert.equal(report.evidenceComplete, false);
});

test('fails the bounded sample-size evidence check when too few vessel/cargo records are captured', () => {
  const dataset = completeDataset();
  dataset.records = dataset.records.slice(0, 5);
  const report = evaluateProviderTrial(dataset);

  assert.equal(report.checks.find((check) => check.id === 'sample_size')?.pass, false);
  assert.equal(report.evidenceComplete, false);
});

test('records provenance mismatch as a validation error and blocks evidence completeness', () => {
  const dataset = completeDataset();
  const first = dataset.records[0] as VesselObservation;
  dataset.records[0] = {
    ...first,
    provenance: { ...first.provenance, provider: 'wrong-provider' },
  };

  const report = evaluateProviderTrial(dataset);
  assert.ok(report.errors.some((error) => error.includes('provider provenance')));
  assert.equal(report.checks.find((check) => check.id === 'valid_canonical_records')?.pass, false);
  assert.equal(report.evidenceComplete, false);
});

test('does not confuse missing cargo destinations with destination coverage', () => {
  const report = evaluateProviderTrial(completeDataset());

  assert.equal(report.cargoCoverage.withDestination, 11);
  assert.equal(report.cargoCoverage.destinationCoveragePct, (11 / 12) * 100);
  assert.equal(report.cargoCoverage.missingOrAmbiguousDestination, 1);
});

test('fails closed on malformed top-level JSON rather than throwing', () => {
  const report = evaluateProviderTrial(null);

  assert.ok(report.errors.some((error) => error.includes('providerId')));
  assert.ok(report.errors.some((error) => error.includes('capturedAt')));
  assert.ok(report.errors.some((error) => error.includes('freshnessThresholdHours')));
  assert.ok(report.errors.some((error) => error.includes('records')));
  assert.ok(report.errors.some((error) => error.includes('referenceCatalog')));
  assert.equal(report.recordCounts.total, 0);
  assert.equal(report.evidenceComplete, false);
});
