import assert from 'node:assert/strict';
import test from 'node:test';
import type { CargoObservation, FreightObservation, PortEvent, RouteEstimate } from '../lib/physical-data';
import {
  assertPhysicalReferenceCatalog,
  resolveCargoObservationReferences,
  resolveFreightObservationReferences,
  resolvePhysicalReference,
  resolvePortEventReference,
  resolveRouteEstimateReferences,
  validatePhysicalReferenceCatalog,
  type PhysicalReferenceCatalog,
} from '../lib/physical-reference';

const catalog = (): PhysicalReferenceCatalog => ({
  schemaVersion: 1,
  references: [
    { kind: 'commodity', id: 'commodity:crude-oil', name: 'Crude oil', aliases: ['crude'], family: 'crude_oil' },
    { kind: 'grade', id: 'grade:north-sea-a', name: 'North Sea A', aliases: ['NSA'], commodityId: 'commodity:crude-oil', countryCode: 'GB' },
    { kind: 'grade', id: 'grade:north-sea-b', name: 'North Sea B', aliases: ['NSB', 'shared grade'], commodityId: 'commodity:crude-oil', countryCode: 'GB' },
    { kind: 'grade', id: 'grade:north-sea-c', name: 'North Sea C', aliases: ['NSC', 'shared grade'], commodityId: 'commodity:crude-oil', countryCode: 'GB' },
    { kind: 'location', id: 'location:alpha-port', name: 'Alpha Port', aliases: ['Alpha'], locationType: 'port', unlocode: 'GBALP', countryCode: 'GB' },
    { kind: 'location', id: 'location:beta-terminal', name: 'Beta Terminal', aliases: ['Beta'], locationType: 'terminal', unlocode: 'AUBET', countryCode: 'AU' },
    { kind: 'location', id: 'location:gamma-port', name: 'Gamma Port', aliases: ['Shared Port'], locationType: 'port', countryCode: 'AU' },
    { kind: 'location', id: 'location:delta-port', name: 'Delta Port', aliases: ['Shared Port'], locationType: 'port', countryCode: 'AU' },
  ],
});

const provenance = {
  provider: 'trial-provider',
  providerRecordIds: ['provider-record-1'],
  retrievedAt: '2026-09-07T01:00:00Z',
  observedAt: '2026-09-07T00:30:00Z',
  evidenceClass: 'observed' as const,
};

const evidence = (value: string, id: string) => ({
  value,
  evidenceClass: 'observed' as const,
  sourceRecordIds: [id],
  asOf: '2026-09-07T00:30:00Z',
});

test('validates canonical IDs and cross-reference integrity without requiring aliases to be unique globally', () => {
  assert.deepEqual(validatePhysicalReferenceCatalog(catalog()), []);
  assert.doesNotThrow(() => assertPhysicalReferenceCatalog(catalog()));

  const bad = catalog();
  const grade = bad.references.find((reference) => reference.id === 'grade:north-sea-a');
  if (grade?.kind !== 'grade') throw new Error('fixture grade missing');
  grade.commodityId = 'commodity:missing';
  assert.ok(validatePhysicalReferenceCatalog(bad).some((error) => error.includes('commodityId must reference')));
});

test('uses deterministic precedence: canonical ID, UN/LOCODE, canonical name, then alias', () => {
  const value = catalog();
  const byId = resolvePhysicalReference(value, 'location', 'location:alpha-port', ['raw-1']);
  const byLocode = resolvePhysicalReference(value, 'location', 'gbalp', ['raw-1']);
  const byName = resolvePhysicalReference(value, 'location', 'Alpha Port', ['raw-1']);
  const byAlias = resolvePhysicalReference(value, 'location', 'alpha', ['raw-1']);

  for (const result of [byId, byLocode, byName, byAlias]) {
    assert.equal(result.status, 'resolved');
    if (result.status !== 'resolved') continue;
    assert.equal(result.canonicalId, 'location:alpha-port');
    assert.equal(result.evidenceClass, 'derived');
  }
  assert.equal(byId.status === 'resolved' ? byId.matchBasis : null, 'canonical_id');
  assert.equal(byLocode.status === 'resolved' ? byLocode.matchBasis : null, 'unlocode');
  assert.equal(byName.status === 'resolved' ? byName.matchBasis : null, 'canonical_name');
  assert.equal(byAlias.status === 'resolved' ? byAlias.matchBasis : null, 'alias');
});

test('returns explicit ambiguity when an alias maps to multiple canonical references', () => {
  const result = resolvePhysicalReference(catalog(), 'grade', 'shared grade', ['provider-grade-raw']);
  assert.equal(result.status, 'ambiguous');
  if (result.status !== 'ambiguous') return;
  assert.equal(result.matchedBasis, 'alias');
  assert.deepEqual(result.candidateIds, ['grade:north-sea-b', 'grade:north-sea-c']);
  assert.match(result.reason, /no reference was selected/i);
});

test('returns unresolved rather than guessing an unknown provider value', () => {
  const result = resolvePhysicalReference(catalog(), 'location', 'Somewhere Offshore', ['provider-location-raw']);
  assert.equal(result.status, 'unresolved');
  if (result.status !== 'unresolved') return;
  assert.equal(result.rawValue, 'Somewhere Offshore');
  assert.match(result.reason, /No deterministic canonical reference match/);
});

test('resolves cargo text fields without mutating or replacing the raw provider evidence', () => {
  const cargo: CargoObservation = {
    kind: 'cargo',
    cargoId: 'cargo-1',
    commodity: evidence('crude', 'commodity-raw-1'),
    grade: evidence('NSA', 'grade-raw-1'),
    loadPort: evidence('GBALP', 'load-raw-1'),
    destination: evidence('Shared Port', 'destination-raw-1'),
    dischargePort: evidence('Beta', 'discharge-raw-1'),
    state: {
      value: 'in_transit',
      evidenceClass: 'observed',
      sourceRecordIds: ['state-raw-1'],
      asOf: '2026-09-07T00:30:00Z',
    },
    provenance,
  };

  const before = JSON.stringify(cargo);
  const resolved = resolveCargoObservationReferences(cargo, catalog());

  assert.equal(resolved.commodity?.status, 'resolved');
  assert.equal(resolved.grade?.status, 'resolved');
  assert.equal(resolved.loadLocation?.status, 'resolved');
  assert.equal(resolved.destinationLocation?.status, 'ambiguous');
  assert.equal(resolved.dischargeLocation?.status, 'resolved');
  assert.deepEqual(resolved.grade?.sourceRecordIds, ['grade-raw-1']);
  assert.equal(JSON.stringify(cargo), before);
  assert.equal(cargo.grade?.value, 'NSA');
});

test('uses field evidence IDs for routes and port events and provider provenance IDs for freight free text', () => {
  const route: RouteEstimate = {
    kind: 'route',
    routeId: 'route-1',
    vesselId: 'vessel-1',
    origin: evidence('Alpha', 'route-origin-raw'),
    destination: evidence('Beta Terminal', 'route-destination-raw'),
    provenance,
  };
  const event: PortEvent = {
    kind: 'port_event',
    eventId: 'event-1',
    vesselId: 'vessel-1',
    eventType: 'arrival',
    port: evidence('GBALP', 'event-port-raw'),
    eventTime: evidence('2026-09-07T00:00:00Z', 'event-time-raw'),
    provenance,
  };
  const freight: FreightObservation = {
    kind: 'freight',
    freightId: 'freight-1',
    origin: 'Alpha Port',
    destination: 'Beta',
    rate: {
      value: { amount: 2.5, currency: 'USD', unit: 'usd_per_bbl' },
      evidenceClass: 'observed',
      sourceRecordIds: ['freight-rate-raw'],
      asOf: '2026-09-07T00:30:00Z',
    },
    provenance,
  };

  const routeResolution = resolveRouteEstimateReferences(route, catalog());
  const eventResolution = resolvePortEventReference(event, catalog());
  const freightResolution = resolveFreightObservationReferences(freight, catalog());

  assert.deepEqual(routeResolution.originLocation?.sourceRecordIds, ['route-origin-raw']);
  assert.deepEqual(eventResolution.portLocation.sourceRecordIds, ['event-port-raw']);
  assert.deepEqual(freightResolution.originLocation?.sourceRecordIds, ['provider-record-1']);
  assert.equal(freightResolution.destinationLocation?.status, 'resolved');
});

test('rejects malformed UN/LOCODE metadata rather than accepting a weak location identity', () => {
  const bad = catalog();
  const location = bad.references.find((reference) => reference.id === 'location:alpha-port');
  if (location?.kind !== 'location') throw new Error('fixture location missing');
  location.unlocode = 'gb-alp';
  const errors = validatePhysicalReferenceCatalog(bad);
  assert.ok(errors.some((error) => error.includes('five-character uppercase UN/LOCODE')));
});
