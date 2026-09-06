import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSteoForecasts, fingerprintSteoForecast } from '../lib/steo-revision';
import { parseSteoBalance, parseSteoSourceWindow } from '../lib/steo';

const previous = [
  { period: '2026-10', supplyMbpd: 105.2, demandMbpd: 104.9, balanceMbpd: 0.3 },
  { period: '2026-11', supplyMbpd: 105.4, demandMbpd: 105.1, balanceMbpd: 0.3 },
];

test('fingerprint is deterministic across input ordering', () => {
  assert.equal(fingerprintSteoForecast(previous), fingerprintSteoForecast([...previous].reverse()));
  assert.match(fingerprintSteoForecast(previous), /^[a-f0-9]{64}$/);
});

test('paired source-window identity stays stable when only the local forecast cutoff month changes', () => {
  const rows = [
    { period: '2026-09', seriesId: 'PAPR_WORLD', value: 105.0 },
    { period: '2026-09', seriesId: 'PATC_WORLD', value: 104.8 },
    { period: '2026-10', seriesId: 'PAPR_WORLD', value: 105.2 },
    { period: '2026-10', seriesId: 'PATC_WORLD', value: 104.9 },
    { period: '2026-11', seriesId: 'PAPR_WORLD', value: 105.4 },
    { period: '2026-11', seriesId: 'PATC_WORLD', value: 105.1 },
  ];

  const sourceWindow = parseSteoSourceWindow(rows);
  const septemberForward = parseSteoBalance(rows, '2026-09');
  const octoberForward = parseSteoBalance(rows, '2026-10');

  assert.deepEqual(sourceWindow.map((point) => point.period), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(septemberForward.map((point) => point.period), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(octoberForward.map((point) => point.period), ['2026-10', '2026-11']);
  assert.equal(
    fingerprintSteoForecast(sourceWindow),
    fingerprintSteoForecast(parseSteoSourceWindow([...rows].reverse())),
  );
});

test('identical forecasts do not create a false revision', () => {
  const result = compareSteoForecasts(previous, [...previous]);
  assert.equal(result.changed, false);
  assert.equal(result.revisedPeriods.length, 0);
  assert.equal(result.addedPeriods.length, 0);
  assert.equal(result.removedPeriods.length, 0);
  assert.equal(result.unchangedPeriods, 2);
});

test('reports supply demand and balance deltas for a revised period', () => {
  const current = [
    { period: '2026-10', supplyMbpd: 105.4, demandMbpd: 105.0, balanceMbpd: 0.4 },
    previous[1],
  ];
  const result = compareSteoForecasts(previous, current);

  assert.equal(result.changed, true);
  assert.equal(result.revisedPeriods.length, 1);
  assert.deepEqual(result.revisedPeriods[0], {
    period: '2026-10',
    previous: previous[0],
    current: current[0],
    deltaSupplyMbpd: 0.2,
    deltaDemandMbpd: 0.1,
    deltaBalanceMbpd: 0.1,
  });
});

test('distinguishes added and removed forecast periods from revisions', () => {
  const current = [
    previous[1],
    { period: '2026-12', supplyMbpd: 105.6, demandMbpd: 105.3, balanceMbpd: 0.3 },
  ];
  const result = compareSteoForecasts(previous, current);

  assert.deepEqual(result.removedPeriods.map((point) => point.period), ['2026-10']);
  assert.deepEqual(result.addedPeriods.map((point) => point.period), ['2026-12']);
  assert.equal(result.revisedPeriods.length, 0);
  assert.equal(result.unchangedPeriods, 1);
});

test('rejects duplicate periods so a malformed release cannot hash ambiguously', () => {
  assert.throws(
    () => fingerprintSteoForecast([previous[0], previous[0]]),
    /Duplicate STEO period/,
  );
});

test('rejects invalid and empty forecasts', () => {
  assert.throws(() => fingerprintSteoForecast([]), /empty STEO forecast/);
  assert.throws(
    () => fingerprintSteoForecast([{ period: 'Oct-26', supplyMbpd: 1, demandMbpd: 1, balanceMbpd: 0 }]),
    /Invalid STEO period/,
  );
});
