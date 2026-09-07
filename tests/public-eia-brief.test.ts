import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicEiaBrief, type PublicEiaBriefMarket } from '../lib/public-eia-brief';
import type { SteoRevisionIntelligence } from '../lib/steo-revision-intelligence';

const market: PublicEiaBriefMarket = {
  source: 'U.S. Energy Information Administration (EIA) API',
  sourceUrl: 'https://www.eia.gov/opendata/',
  observedAt: '2026-09-07T03:00:00.000Z',
  freshnessLabel: '48h since latest inventory observation',
  prices: {
    brent: [{ period: '2026-08', value: 72.5 }],
    wti: [{ period: '2026-08', value: 69.25 }],
  },
  publicSnapshot: {
    method: 'eia-public-derived-snapshot-v1',
    brentWtiSpread: {
      period: '2026-08',
      brentUsdBbl: 72.5,
      wtiUsdBbl: 69.25,
      spreadUsdBbl: 3.25,
      classification: 'derived-public-price-observation',
    },
    inventoryChange: {
      latestPeriod: '2026-09-04',
      previousPeriod: '2026-08-28',
      latestThousandBarrels: 420000,
      previousThousandBarrels: 417500,
      deltaThousandBarrels: 2500,
      deltaPct: 0.5988,
      classification: 'derived-public-inventory-observation',
    },
    nearTermBalance: {
      period: '2026-09',
      supplyMbpd: 105.9,
      demandMbpd: 105.7,
      balanceMbpd: 0.2,
      classification: 'forecast',
    },
    limitations: ['These metrics are descriptive and are not combined into a bullish/bearish score or used to infer market causality.'],
  },
};

const revisions: SteoRevisionIntelligence = {
  source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook official archive',
  method: 'official-vintage-right-minus-left-descriptive-revision-v1',
  unit: 'million barrels per day',
  archive: {
    vintageCount: 8,
    firstIssue: '2026-01',
    latestIssue: '2026-08',
    firstReleaseDate: '2026-01-13',
    latestReleaseDate: '2026-08-11',
  },
  latestRevision: {
    baselineIssue: '2026-07',
    referenceIssue: '2026-08',
    baselineReleaseDate: '2026-07-07',
    referenceReleaseDate: '2026-08-11',
    continuingForecastPeriods: 12,
    maturedPeriods: 1,
    missingReferencePeriods: [],
    metrics: null,
    largestForecastBalanceRevisions: [
      {
        period: '2026-12',
        classification: 'forecast-revision',
        deltaSupplyMbpd: 0.2,
        deltaDemandMbpd: -0.1,
        deltaBalanceMbpd: 0.3,
        absoluteBalanceDeltaMbpd: 0.3,
      },
    ],
    largestLaterEstimateBalanceDifferences: [],
  },
  archiveSpan: {
    baselineIssue: '2026-01',
    referenceIssue: '2026-08',
    baselineReleaseDate: '2026-01-13',
    referenceReleaseDate: '2026-08-11',
    continuingForecastPeriods: 6,
    maturedPeriods: 7,
    missingReferencePeriods: [],
    metrics: null,
    largestForecastBalanceRevisions: [],
    largestLaterEstimateBalanceDifferences: [],
  },
  limitations: ['descriptive'],
};

test('builds a portable public-only evidence brief with explicit classifications and gaps', () => {
  const brief = buildPublicEiaBrief({
    generatedAt: '2026-09-07T03:15:00.000Z',
    market,
    revisions,
  });

  assert.match(brief, /LastBarrel Public EIA Evidence Brief/);
  assert.match(brief, /Brent–WTI spread: \+3\.25 USD\/bbl \(2026-08, derived from same-period public observations\)/);
  assert.match(brief, /U\.S\. crude inventory change: \+2\.50 million bbl/);
  assert.match(brief, /Near-term implied world balance: \+0\.20 m b\/d \(2026-09, EIA STEO forecast\)/);
  assert.match(brief, /8 official vintages, 2026-01 → 2026-08/);
  assert.match(brief, /2026-12: balance \+0\.30 m b\/d; supply \+0\.20; demand -0\.10/);
  assert.match(brief, /Live cargo identity, volumes, destination\/ETA, commitments and freight remain unavailable/);
  assert.match(brief, /No bullish\/bearish score, trade recommendation, or physical-availability claim/);
  assert.doesNotMatch(brief, /commercial physical-provider observations\.[\s\S]*Cargo ID:/i);
});

test('keeps unavailable public components explicit rather than inserting substitute values', () => {
  const brief = buildPublicEiaBrief({
    generatedAt: '2026-09-07T03:15:00.000Z',
    market: {
      ...market,
      prices: { brent: [], wti: [] },
      publicSnapshot: {
        ...market.publicSnapshot,
        brentWtiSpread: null,
        inventoryChange: null,
        nearTermBalance: null,
      },
    },
    revisions: null,
  });

  assert.match(brief, /Brent: unavailable/);
  assert.match(brief, /WTI: unavailable/);
  assert.match(brief, /Brent–WTI spread: unavailable/);
  assert.match(brief, /U\.S\. crude inventory change: unavailable/);
  assert.match(brief, /Near-term implied world balance: unavailable/);
  assert.match(brief, /Official STEO revision archive: unavailable/);
});

test('rejects malformed provenance timestamps instead of producing a misleading brief', () => {
  assert.throws(
    () => buildPublicEiaBrief({ generatedAt: 'not-a-date', market, revisions }),
    /generatedAt/,
  );

  assert.throws(
    () => buildPublicEiaBrief({ generatedAt: '2026-09-07T03:15:00.000Z', market: { ...market, observedAt: 'bad-date' }, revisions }),
    /observedAt/,
  );
});
