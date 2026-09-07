import type { PublicMarketSnapshot, PublicSeriesObservation } from './public-market-snapshot';
import type { SteoBalancePoint } from './steo';

export type PublicEvidenceObservation = {
  evidenceId: string;
  metric: string;
  classification: 'observed-public' | 'forecast-public' | 'unavailable';
  provider: 'EIA' | null;
  seriesId: string | null;
  period: string | null;
  value: number | null;
  unit: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  note: string | null;
};

export type PublicEvidenceDerivation = {
  evidenceId: string;
  metric: string;
  classification: 'derived-public' | 'forecast';
  method: string;
  inputEvidenceIds: string[];
  period: string;
  value: number;
  unit: string;
  note: string | null;
};

export type PublicEvidenceManifest = {
  method: 'lastbarrel-public-evidence-manifest-v1';
  generatedAt: string;
  observations: PublicEvidenceObservation[];
  derivations: PublicEvidenceDerivation[];
  integrity: {
    steoRevisionFingerprint: string | null;
    limitations: string[];
  };
};

type SteoEvidenceInput = {
  sourceUrl: string;
  revisionFingerprint: string;
  seriesIds: { supply: string; demand: string };
  forecast: SteoBalancePoint[];
};

const PRICE_URL = 'https://www.eia.gov/opendata/';
const STEO_URL = 'https://www.eia.gov/outlooks/steo/';
const EPSILON = 1e-6;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function close(a: number, b: number) {
  return Math.abs(a - b) <= EPSILON;
}

function canonicalBalance(supply: number, demand: number) {
  return Number((supply - demand).toFixed(2));
}

function requireDate(value: string, name: string) {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${name} must be date-compatible`);
}

function obsId(seriesId: string, period: string) {
  return `eia:${seriesId}:${period}`;
}

function findObservation(series: PublicSeriesObservation[], period: string, label: string) {
  const point = series.find((candidate) => candidate?.period === period && finite(candidate.value));
  if (!point) throw new Error(`Evidence manifest cannot reproduce ${label}: source observation ${period} is missing`);
  return point;
}

function observed(
  seriesId: string,
  metric: string,
  point: PublicSeriesObservation,
  unit: string,
  retrievedAt: string,
): PublicEvidenceObservation {
  return {
    evidenceId: obsId(seriesId, point.period),
    metric,
    classification: 'observed-public',
    provider: 'EIA',
    seriesId,
    period: point.period,
    value: point.value,
    unit,
    sourceUrl: PRICE_URL,
    retrievedAt,
    note: null,
  };
}

function unavailable(evidenceId: string, metric: string, note: string): PublicEvidenceObservation {
  return {
    evidenceId,
    metric,
    classification: 'unavailable',
    provider: null,
    seriesId: null,
    period: null,
    value: null,
    unit: null,
    sourceUrl: null,
    retrievedAt: null,
    note,
  };
}

export function buildPublicEvidenceManifest(input: {
  generatedAt: string;
  retrievedAt: string;
  brent: PublicSeriesObservation[];
  wti: PublicSeriesObservation[];
  inventories: PublicSeriesObservation[];
  snapshot: PublicMarketSnapshot;
  steo: SteoEvidenceInput | null;
}): PublicEvidenceManifest {
  requireDate(input.generatedAt, 'Evidence manifest generatedAt');
  requireDate(input.retrievedAt, 'Evidence manifest retrievedAt');

  const brent = Array.isArray(input.brent) ? input.brent : [];
  const wti = Array.isArray(input.wti) ? input.wti : [];
  const inventories = Array.isArray(input.inventories) ? input.inventories : [];
  const observations: PublicEvidenceObservation[] = [];
  const derivations: PublicEvidenceDerivation[] = [];

  const spread = input.snapshot?.brentWtiSpread ?? null;
  if (spread) {
    const brentPoint = findObservation(brent, spread.period, 'Brent-WTI spread');
    const wtiPoint = findObservation(wti, spread.period, 'Brent-WTI spread');
    if (!close(spread.brentUsdBbl, brentPoint.value) || !close(spread.wtiUsdBbl, wtiPoint.value)) {
      throw new Error('Evidence manifest cannot reproduce Brent-WTI spread: snapshot source values differ from EIA observations');
    }
    if (!close(spread.spreadUsdBbl, brentPoint.value - wtiPoint.value)) {
      throw new Error('Evidence manifest cannot reproduce Brent-WTI spread arithmetic');
    }
    observations.push(
      observed('RBRTE', 'Brent spot price', brentPoint, 'USD/bbl', input.retrievedAt),
      observed('RWTC', 'WTI spot price', wtiPoint, 'USD/bbl', input.retrievedAt),
    );
    derivations.push({
      evidenceId: `derived:brent-wti-spread:${spread.period}`,
      metric: 'Brent-WTI spread',
      classification: 'derived-public',
      method: 'RBRTE minus RWTC for the same monthly period',
      inputEvidenceIds: [obsId('RBRTE', spread.period), obsId('RWTC', spread.period)],
      period: spread.period,
      value: spread.spreadUsdBbl,
      unit: 'USD/bbl',
      note: 'Arithmetic spread only; not a directional market signal.',
    });
  }

  const inventory = input.snapshot?.inventoryChange ?? null;
  if (inventory) {
    const latest = findObservation(inventories, inventory.latestPeriod, 'inventory change');
    const previous = findObservation(inventories, inventory.previousPeriod, 'inventory change');
    if (!close(inventory.latestThousandBarrels, latest.value) || !close(inventory.previousThousandBarrels, previous.value)) {
      throw new Error('Evidence manifest cannot reproduce inventory change: snapshot source values differ from EIA observations');
    }
    if (!close(inventory.deltaThousandBarrels, latest.value - previous.value)) {
      throw new Error('Evidence manifest cannot reproduce inventory change arithmetic');
    }
    observations.push(
      observed('WCESTUS1', 'U.S. crude inventories excluding SPR', latest, 'thousand barrels', input.retrievedAt),
      observed('WCESTUS1', 'U.S. crude inventories excluding SPR', previous, 'thousand barrels', input.retrievedAt),
    );
    derivations.push({
      evidenceId: `derived:inventory-change:${inventory.previousPeriod}:${inventory.latestPeriod}`,
      metric: 'U.S. crude inventory change',
      classification: 'derived-public',
      method: 'latest distinct WCESTUS1 observation minus previous distinct observation',
      inputEvidenceIds: [obsId('WCESTUS1', inventory.latestPeriod), obsId('WCESTUS1', inventory.previousPeriod)],
      period: inventory.latestPeriod,
      value: inventory.deltaThousandBarrels,
      unit: 'thousand barrels',
      note: 'Arithmetic change only; not a causal explanation for oil-price movement.',
    });
  }

  const balance = input.snapshot?.nearTermBalance ?? null;
  if (balance) {
    if (!input.steo) throw new Error('Evidence manifest cannot reproduce near-term balance: STEO evidence is unavailable');
    if (!/^[a-f0-9]{64}$/.test(input.steo.revisionFingerprint)) throw new Error('Evidence manifest requires a valid STEO revision fingerprint');
    const point = input.steo.forecast.find((candidate) => candidate.period === balance.period);
    if (!point) throw new Error(`Evidence manifest cannot reproduce near-term balance: STEO period ${balance.period} is missing`);
    if (!close(balance.supplyMbpd, point.supplyMbpd) || !close(balance.demandMbpd, point.demandMbpd) || !close(balance.balanceMbpd, point.balanceMbpd)) {
      throw new Error('Evidence manifest cannot reproduce near-term STEO balance values');
    }
    if (!close(balance.balanceMbpd, canonicalBalance(balance.supplyMbpd, balance.demandMbpd))) {
      throw new Error('Evidence manifest cannot reproduce canonical near-term STEO balance arithmetic');
    }

    const supplyId = obsId(input.steo.seriesIds.supply, balance.period);
    const demandId = obsId(input.steo.seriesIds.demand, balance.period);
    observations.push(
      {
        evidenceId: supplyId,
        metric: 'World liquid fuels supply',
        classification: 'forecast-public',
        provider: 'EIA',
        seriesId: input.steo.seriesIds.supply,
        period: balance.period,
        value: balance.supplyMbpd,
        unit: 'million barrels per day',
        sourceUrl: input.steo.sourceUrl || STEO_URL,
        retrievedAt: input.retrievedAt,
        note: 'EIA STEO forecast; not observed physical availability.',
      },
      {
        evidenceId: demandId,
        metric: 'World liquid fuels consumption',
        classification: 'forecast-public',
        provider: 'EIA',
        seriesId: input.steo.seriesIds.demand,
        period: balance.period,
        value: balance.demandMbpd,
        unit: 'million barrels per day',
        sourceUrl: input.steo.sourceUrl || STEO_URL,
        retrievedAt: input.retrievedAt,
        note: 'EIA STEO forecast; not observed physical availability.',
      },
    );
    derivations.push({
      evidenceId: `forecast-derived:world-balance:${balance.period}`,
      metric: 'Near-term implied world balance',
      classification: 'forecast',
      method: `${input.steo.seriesIds.supply} minus ${input.steo.seriesIds.demand}, rounded to 2 decimals`,
      inputEvidenceIds: [supplyId, demandId],
      period: balance.period,
      value: balance.balanceMbpd,
      unit: 'million barrels per day',
      note: `Revision fingerprint ${input.steo.revisionFingerprint}. Forecast, not observed physical flow.`,
    });
  }

  observations.push(
    unavailable('unavailable:dubai-price', 'Dubai live price', 'No current supported public/licensed source connected.'),
    unavailable('unavailable:murban-price', 'Murban live price', 'No current supported public/licensed source connected.'),
    unavailable('unavailable:commercial-physical-flow', 'Cargo / vessel / freight intelligence', 'Commercial provider has not cleared evidence and rights gates.'),
    unavailable('unavailable:live-landed-cost', 'Live landed cost', 'Current freight, insurance, port-fee and route evidence are not connected.'),
  );

  const ids = [...observations.map((item) => item.evidenceId), ...derivations.map((item) => item.evidenceId)];
  if (new Set(ids).size !== ids.length) throw new Error('Evidence manifest contains duplicate evidence IDs');

  return {
    method: 'lastbarrel-public-evidence-manifest-v1',
    generatedAt: input.generatedAt,
    observations,
    derivations,
    integrity: {
      steoRevisionFingerprint: input.steo?.revisionFingerprint ?? null,
      limitations: [
        'Observed-public records are public EIA observations; derived-public records are reproducible arithmetic transforms of those records.',
        'Forecast-public and forecast derivations remain EIA STEO forecasts, not observed cargo flows or final actuals.',
        'Unavailable records are explicit product evidence gaps and are never replaced with zero or demonstration values.',
        'The manifest proves arithmetic/source lineage, not market causality or trading direction.',
      ],
    },
  };
}
