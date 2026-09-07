import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { buildSteoRevisionIntelligence } from '../lib/steo-revision-intelligence';
import { listOfficialSteoVintages } from '../lib/steo-official-vintage';

const archiveDirectory = path.join(process.cwd(), 'data', 'steo-official-vintages');

function archive() {
  return listOfficialSteoVintages(archiveDirectory);
}

test('builds revision intelligence from the committed Jan-Aug 2026 official archive', () => {
  const result = buildSteoRevisionIntelligence(archive());

  assert.equal(result.archive.vintageCount, 8);
  assert.equal(result.archive.firstIssue, '2026-01');
  assert.equal(result.archive.latestIssue, '2026-08');
  assert.equal(result.latestRevision.baselineIssue, '2026-07');
  assert.equal(result.latestRevision.referenceIssue, '2026-08');
  assert.equal(result.archiveSpan.baselineIssue, '2026-01');
  assert.equal(result.archiveSpan.referenceIssue, '2026-08');
  assert.ok(result.latestRevision.continuingForecastPeriods > 0);
  assert.ok(result.archiveSpan.maturedPeriods > 0);
  assert.equal(result.method, 'official-vintage-right-minus-left-descriptive-revision-v1');
});

test('ranks forecast and later-estimate changes by absolute balance delta without changing signed deltas', () => {
  const result = buildSteoRevisionIntelligence(archive());

  for (const window of [result.latestRevision, result.archiveSpan]) {
    for (const ranked of [window.largestForecastBalanceRevisions, window.largestLaterEstimateBalanceDifferences]) {
      for (let index = 1; index < ranked.length; index += 1) {
        assert.ok(ranked[index - 1].absoluteBalanceDeltaMbpd >= ranked[index].absoluteBalanceDeltaMbpd);
      }
      for (const point of ranked) {
        assert.equal(point.absoluteBalanceDeltaMbpd, Number(Math.abs(point.deltaBalanceMbpd).toFixed(4)));
      }
    }
  }
});

test('preserves the public-estimate and non-causal evidence boundary', () => {
  const result = buildSteoRevisionIntelligence(archive());

  assert.ok(result.limitations.some((limitation) => limitation.includes('do not establish causal')));
  assert.ok(result.limitations.some((limitation) => limitation.includes('public estimates')));
  assert.ok(result.archiveSpan.largestLaterEstimateBalanceDifferences.every(
    (point) => point.classification === 'later-vintage-public-estimate-difference',
  ));
});

test('fails closed when fewer than two official vintages are supplied', () => {
  const vintages = archive();
  assert.throws(() => buildSteoRevisionIntelligence(vintages.slice(0, 1)), /at least two official vintages/);
});

test('fails closed on duplicate official issue identities', () => {
  const vintages = archive();
  assert.throws(() => buildSteoRevisionIntelligence([vintages[0], vintages[0]]), /unique official issue identities/);
});
