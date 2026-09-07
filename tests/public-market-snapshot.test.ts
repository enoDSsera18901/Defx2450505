import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePublicMarketSnapshot } from '../lib/public-market-snapshot';
import type { SteoBalancePoint } from '../lib/steo';

const steoForecast: SteoBalancePoint[] = [
  { period: '2026-10', supplyMbpd: 106.2, demandMbpd: 105.8, balanceMbpd: 0.4, classification: 'forecast' },
  { period: '2026-09', supplyMbpd: 105.9, demandMbpd: 105.7, balanceMbpd: 0.2, classification: 'forecast' },
];

test('derives a same-period Brent-WTI spread, weekly inventory change and earliest STEO forecast', () => {
  const report = derivePublicMarketSnapshot({
    brent: [
      { period: '2026-08', value: 72.5 },
      { period: '2026-07', value: 71.25 },
    ],
    wti: [
      { period: '2026-07', value: 68.75 },
      { period: '2026-06', value: 67.5 },
    ],
    inventories: [
      { period: '2026-09-04', value: 420000 },
      { period: '2026-08-28', value: 417500 },
    ],
    steoForecast,
  });

  assert.deepEqual(report.brentWtiSpread, {
    period: '2026-07',
    brentUsdBbl: 71.25,
    wtiUsdBbl: 68.75,
    spreadUsdBbl: 2.5,
    classification: 'derived-public-price-observation',
  });
  assert.equal(report.inventoryChange?.deltaThousandBarrels, 2500);
  assert.equal(report.inventoryChange?.deltaPct, 0.5988);
  assert.equal(report.nearTermBalance?.period, '2026-09');
  assert.equal(report.nearTermBalance?.classification, 'forecast');
});

test('does not compare mismatched price periods by array position', () => {
  const report = derivePublicMarketSnapshot({
    brent: [{ period: '2026-08', value: 72.5 }],
    wti: [{ period: '2026-07', value: 68.75 }],
    inventories: [],
  });

  assert.equal(report.brentWtiSpread, null);
});

test('deduplicates inventory periods and fails closed without two distinct observations', () => {
  const report = derivePublicMarketSnapshot({
    brent: [],
    wti: [],
    inventories: [
      { period: '2026-09-04', value: 420000 },
      { period: '2026-09-04', value: 419000 },
    ],
  });

  assert.equal(report.inventoryChange, null);
});

test('keeps inventory percentage change unavailable when the previous observation is zero', () => {
  const report = derivePublicMarketSnapshot({
    brent: [],
    wti: [],
    inventories: [
      { period: '2026-09-04', value: 100 },
      { period: '2026-08-28', value: 0 },
    ],
  });

  assert.equal(report.inventoryChange?.deltaThousandBarrels, 100);
  assert.equal(report.inventoryChange?.deltaPct, null);
});

test('ignores malformed numeric observations rather than manufacturing a metric', () => {
  const report = derivePublicMarketSnapshot({
    brent: [{ period: '2026-08', value: Number.NaN }],
    wti: [{ period: '2026-08', value: 70 }],
    inventories: [{ period: '2026-09-04', value: Number.POSITIVE_INFINITY }],
    steoForecast: [{ period: '2026-09', supplyMbpd: Number.NaN, demandMbpd: 105, balanceMbpd: 0, classification: 'forecast' }],
  });

  assert.equal(report.brentWtiSpread, null);
  assert.equal(report.inventoryChange, null);
  assert.equal(report.nearTermBalance, null);
});

test('states the descriptive evidence boundary instead of emitting a directional market score', () => {
  const report = derivePublicMarketSnapshot({ brent: [], wti: [], inventories: [] });
  assert.equal(report.method, 'eia-public-derived-snapshot-v1');
  assert.ok(report.limitations.some((item) => item.includes('not combined into a bullish/bearish score')));
  assert.equal('score' in report, false);
});
