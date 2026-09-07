import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicEvidenceManifest } from '../lib/public-evidence-manifest';
import { derivePublicMarketSnapshot } from '../lib/public-market-snapshot';
import type { SteoBalancePoint } from '../lib/steo';

const retrievedAt = '2026-09-07T03:30:00.000Z';
const fingerprint = 'a'.repeat(64);
const brent = [
  { period: '2026-08', value: 80, units: 'USD/bbl' },
  { period: '2026-07', value: 79, units: 'USD/bbl' },
];
const wti = [
  { period: '2026-08', value: 75, units: 'USD/bbl' },
  { period: '2026-07', value: 74, units: 'USD/bbl' },
];
const inventories = [
  { period: '2026-09-04', value: 410000, units: 'thousand barrels' },
  { period: '2026-08-28', value: 408000, units: 'thousand barrels' },
];
const steoForecast: SteoBalancePoint[] = [
  {
    period: '2026-09',
    supplyMbpd: 105.123,
    demandMbpd: 104.111,
    balanceMbpd: 1.01,
    classification: 'forecast',
  },
];

function validInput() {
  const snapshot = derivePublicMarketSnapshot({ brent, wti, inventories, steoForecast });
  return {
    generatedAt: retrievedAt,
    retrievedAt,
    brent,
    wti,
    inventories,
    snapshot,
    steo: {
      sourceUrl: 'https://www.eia.gov/outlooks/steo/',
      revisionFingerprint: fingerprint,
      seriesIds: { supply: 'PAPR_WORLD', demand: 'PATC_WORLD' },
      forecast: steoForecast,
    },
  };
}

test('builds stable source -> transform -> output lineage and explicit no-data records', () => {
  const manifest = buildPublicEvidenceManifest(validInput());

  assert.equal(manifest.method, 'lastbarrel-public-evidence-manifest-v1');
  assert.equal(manifest.integrity.steoRevisionFingerprint, fingerprint);

  const spread = manifest.derivations.find((item) => item.metric === 'Brent-WTI spread');
  assert.deepEqual(spread?.inputEvidenceIds, ['eia:RBRTE:2026-08', 'eia:RWTC:2026-08']);
  assert.equal(spread?.value, 5);
  assert.equal(spread?.classification, 'derived-public');

  const inventory = manifest.derivations.find((item) => item.metric === 'U.S. crude inventory change');
  assert.deepEqual(inventory?.inputEvidenceIds, ['eia:WCESTUS1:2026-09-04', 'eia:WCESTUS1:2026-08-28']);
  assert.equal(inventory?.value, 2000);

  const balance = manifest.derivations.find((item) => item.metric === 'Near-term implied world balance');
  assert.deepEqual(balance?.inputEvidenceIds, ['eia:PAPR_WORLD:2026-09', 'eia:PATC_WORLD:2026-09']);
  assert.equal(balance?.value, 1.01);
  assert.equal(balance?.classification, 'forecast');
  assert.match(balance?.method ?? '', /rounded to 2 decimals/);

  const unavailable = manifest.observations.filter((item) => item.classification === 'unavailable');
  assert.deepEqual(
    unavailable.map((item) => item.evidenceId).sort(),
    [
      'unavailable:commercial-physical-flow',
      'unavailable:dubai-price',
      'unavailable:live-landed-cost',
      'unavailable:murban-price',
    ],
  );

  const ids = [...manifest.observations, ...manifest.derivations].map((item) => item.evidenceId);
  assert.equal(new Set(ids).size, ids.length);
});

test('accepts canonical two-decimal STEO balance rounding rather than raw floating subtraction', () => {
  const manifest = buildPublicEvidenceManifest(validInput());
  const balance = manifest.derivations.find((item) => item.metric === 'Near-term implied world balance');
  assert.equal(balance?.value, 1.01);
});

test('fails closed when derived Brent-WTI spread no longer matches its source observations', () => {
  const input = validInput();
  assert.ok(input.snapshot.brentWtiSpread);
  input.snapshot.brentWtiSpread = { ...input.snapshot.brentWtiSpread!, spreadUsdBbl: 6 };
  assert.throws(() => buildPublicEvidenceManifest(input), /cannot reproduce Brent-WTI spread arithmetic/);
});

test('fails closed when inventory source values no longer match the snapshot derivation', () => {
  const input = validInput();
  input.inventories = [
    { period: '2026-09-04', value: 411000, units: 'thousand barrels' },
    ...inventories.slice(1),
  ];
  assert.throws(() => buildPublicEvidenceManifest(input), /snapshot source values differ/);
});

test('fails closed when a forecast-derived balance has no matching STEO evidence', () => {
  const input = validInput();
  input.steo = null as never;
  assert.throws(() => buildPublicEvidenceManifest(input), /STEO evidence is unavailable/);
});

test('fails closed on malformed STEO revision identity', () => {
  const input = validInput();
  input.steo.revisionFingerprint = 'not-a-sha';
  assert.throws(() => buildPublicEvidenceManifest(input), /valid STEO revision fingerprint/);
});

test('preserves explicit unsupported gaps when public derived components are unavailable', () => {
  const snapshot = derivePublicMarketSnapshot({ brent: [], wti: [], inventories: [], steoForecast: null });
  const manifest = buildPublicEvidenceManifest({
    generatedAt: retrievedAt,
    retrievedAt,
    brent: [],
    wti: [],
    inventories: [],
    snapshot,
    steo: null,
  });
  assert.equal(manifest.derivations.length, 0);
  assert.equal(manifest.observations.length, 4);
  assert.ok(manifest.observations.every((item) => item.classification === 'unavailable'));
});
