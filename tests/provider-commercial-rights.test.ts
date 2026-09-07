import assert from 'node:assert/strict';
import test from 'node:test';
import type { FreightObservation } from '../lib/physical-data';
import {
  assessObservationCommercialUse,
  assessProviderCommercialRights,
  type ProviderCommercialRightsPacket,
} from '../lib/provider-commercial-rights';

function readyPacket(): ProviderCommercialRightsPacket {
  const sourceDocumentIds = ['agreement-2026-v1'];
  return {
    schemaVersion: 1,
    providerId: 'trial-provider',
    licenceTag: 'commercial-2026-v1',
    reviewedAt: '2026-09-07T00:00:00Z',
    agreementEffectiveAt: '2026-09-01T00:00:00Z',
    agreementExpiresAt: '2027-08-31T23:59:59Z',
    rights: [
      { right: 'web_display', status: 'permitted', sourceDocumentIds },
      { right: 'historical_storage', status: 'permitted', sourceDocumentIds },
      { right: 'derived_data', status: 'permitted', sourceDocumentIds },
      { right: 'export_derived_briefs', status: 'permitted', sourceDocumentIds },
      {
        right: 'retention_after_subscription',
        status: 'conditional',
        sourceDocumentIds,
        conditions: ['Retain only contractually permitted derived records after subscription termination.'],
        conditionalCompliance: 'confirmed',
      },
    ],
    attribution: {
      status: 'required',
      requirement: 'Display provider attribution on externally visible derived outputs.',
      sourceDocumentIds,
    },
    seatScope: {
      status: 'specified',
      description: 'Named-user scope recorded in the commercial agreement.',
      sourceDocumentIds,
    },
    apiDatasetScope: {
      status: 'specified',
      datasets: ['cargo', 'maritime', 'freight'],
      description: 'Only the listed API datasets are included.',
      sourceDocumentIds,
    },
    rateLimits: {
      status: 'specified',
      description: 'API rate-limit schedule recorded in the agreement evidence.',
      sourceDocumentIds,
    },
    pricing: {
      status: 'specified',
      description: 'Commercial pricing schedule recorded separately from product analytics.',
      sourceDocumentIds,
    },
  };
}

function freight(licenceTag: string | null = 'commercial-2026-v1'): FreightObservation {
  return {
    kind: 'freight',
    freightId: 'freight-1',
    origin: 'Arabian Gulf',
    destination: 'Singapore',
    rate: {
      value: { amount: 82.5, unit: 'worldscale' },
      evidenceClass: 'observed',
      sourceRecordIds: ['provider-rate-1'],
    },
    provenance: {
      provider: 'trial-provider',
      providerRecordIds: ['provider-rate-1'],
      retrievedAt: '2026-09-07T00:00:00Z',
      observedAt: '2026-09-06T00:00:00Z',
      evidenceClass: 'observed',
      licenceTag,
    },
  };
}

test('marks a fully evidenced rights packet release-ready without calling it legal approval', () => {
  const assessment = assessProviderCommercialRights(readyPacket());

  assert.equal(assessment.status, 'ready');
  assert.deepEqual(assessment.validationErrors, []);
  assert.deepEqual(assessment.blockers, []);
  assert.equal(assessment.conditionalRights.length, 1);
  assert.deepEqual(assessment.sourceDocumentIds, ['agreement-2026-v1']);
});

test('blocks a conditional right until operational compliance is confirmed', () => {
  const packet = readyPacket();
  const retention = packet.rights.find((term) => term.right === 'retention_after_subscription');
  assert.ok(retention);
  retention.conditionalCompliance = 'unconfirmed';

  const assessment = assessProviderCommercialRights(packet);
  assert.equal(assessment.status, 'blocked');
  assert.ok(assessment.blockers.some((blocker) => blocker.includes('retention_after_subscription conditions')));
});

test('blocks unknown or prohibited release rights rather than assuming access implies permission', () => {
  const unknown = readyPacket();
  const web = unknown.rights.find((term) => term.right === 'web_display');
  assert.ok(web);
  web.status = 'unknown';
  const unknownAssessment = assessProviderCommercialRights(unknown);
  assert.equal(unknownAssessment.status, 'blocked');
  assert.ok(unknownAssessment.blockers.includes('web_display permission is unknown'));

  const prohibited = readyPacket();
  const exportRight = prohibited.rights.find((term) => term.right === 'export_derived_briefs');
  assert.ok(exportRight);
  exportRight.status = 'prohibited';
  const prohibitedAssessment = assessProviderCommercialRights(prohibited);
  assert.equal(prohibitedAssessment.status, 'blocked');
  assert.ok(prohibitedAssessment.blockers.includes('export_derived_briefs is prohibited'));
});

test('blocks expired agreements and future-dated permissions', () => {
  const expired = readyPacket();
  expired.agreementExpiresAt = '2026-09-06T23:59:59Z';
  const expiredAssessment = assessProviderCommercialRights(expired);
  assert.equal(expiredAssessment.status, 'blocked');
  assert.ok(expiredAssessment.blockers.some((blocker) => blocker.includes('agreement expired')));

  const future = readyPacket();
  const storage = future.rights.find((term) => term.right === 'historical_storage');
  assert.ok(storage);
  storage.effectiveAt = '2026-09-08T00:00:00Z';
  const futureAssessment = assessProviderCommercialRights(future);
  assert.equal(futureAssessment.status, 'blocked');
  assert.ok(futureAssessment.blockers.some((blocker) => blocker.includes('historical_storage is not effective')));
});

test('requires all mandatory rights and sourced commercial terms', () => {
  const packet = readyPacket();
  packet.rights = packet.rights.filter((term) => term.right !== 'derived_data');
  packet.rateLimits = { status: 'unknown', sourceDocumentIds: ['agreement-2026-v1'] };

  const assessment = assessProviderCommercialRights(packet);
  assert.equal(assessment.status, 'blocked');
  assert.ok(assessment.validationErrors.some((error) => error.includes('rights must include derived_data')));
});

test('rejects conditional terms without conditions and source-less commercial assertions', () => {
  const packet = readyPacket();
  const retention = packet.rights.find((term) => term.right === 'retention_after_subscription');
  assert.ok(retention);
  retention.conditions = [];
  packet.pricing.sourceDocumentIds = [];

  const assessment = assessProviderCommercialRights(packet);
  assert.equal(assessment.status, 'blocked');
  assert.ok(assessment.validationErrors.some((error) => error.includes('conditions are required')));
  assert.ok(assessment.validationErrors.some((error) => error.includes('pricing.sourceDocumentIds')));
});

test('allows commercial use only when observation provider and licenceTag match the ready packet', () => {
  const assessment = assessObservationCommercialUse(freight(), readyPacket());

  assert.equal(assessment.status, 'ready');
  assert.deepEqual(assessment.blockers, []);
});

test('blocks trial-only, missing or provider-mismatched observation provenance', () => {
  const trialOnly = assessObservationCommercialUse(freight('trial-only'), readyPacket());
  assert.equal(trialOnly.status, 'blocked');
  assert.ok(trialOnly.blockers.some((blocker) => blocker.includes('does not match rights packet')));

  const missing = assessObservationCommercialUse(freight(null), readyPacket());
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.blockers.includes('observation provenance.licenceTag is required for commercial use'));

  const otherProvider = freight();
  otherProvider.provenance.provider = 'other-provider';
  const mismatched = assessObservationCommercialUse(otherProvider, readyPacket());
  assert.equal(mismatched.status, 'blocked');
  assert.ok(mismatched.blockers.some((blocker) => blocker.includes('does not match rights packet provider')));
});

test('fails closed on malformed commercial-rights input rather than throwing', () => {
  const assessment = assessProviderCommercialRights(null);

  assert.equal(assessment.status, 'blocked');
  assert.ok(assessment.validationErrors.length >= 1);
  assert.ok(assessment.blockers.includes('commercial rights packet is structurally invalid or incomplete'));
});
