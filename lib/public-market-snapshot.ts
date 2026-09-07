import type { SteoBalancePoint } from './steo';

export type PublicSeriesObservation = {
  period: string;
  value: number;
  units?: string;
};

export type PublicMarketSnapshot = {
  method: 'eia-public-derived-snapshot-v1';
  brentWtiSpread: {
    period: string;
    brentUsdBbl: number;
    wtiUsdBbl: number;
    spreadUsdBbl: number;
    classification: 'derived-public-price-observation';
  } | null;
  inventoryChange: {
    latestPeriod: string;
    previousPeriod: string;
    latestThousandBarrels: number;
    previousThousandBarrels: number;
    deltaThousandBarrels: number;
    deltaPct: number | null;
    classification: 'derived-public-inventory-observation';
  } | null;
  nearTermBalance: {
    period: string;
    supplyMbpd: number;
    demandMbpd: number;
    balanceMbpd: number;
    classification: 'forecast';
  } | null;
  limitations: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validObservation(value: PublicSeriesObservation): boolean {
  return typeof value?.period === 'string' && value.period.trim().length > 0 && finite(value.value);
}

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals));
}

function deriveSpread(brent: PublicSeriesObservation[], wti: PublicSeriesObservation[]): PublicMarketSnapshot['brentWtiSpread'] {
  const wtiByPeriod = new Map(
    wti
      .filter(validObservation)
      .map((point) => [point.period, point] as const),
  );

  const common = brent
    .filter(validObservation)
    .filter((point) => wtiByPeriod.has(point.period))
    .sort((a, b) => b.period.localeCompare(a.period))[0];

  if (!common) return null;
  const matchingWti = wtiByPeriod.get(common.period);
  if (!matchingWti) return null;

  return {
    period: common.period,
    brentUsdBbl: common.value,
    wtiUsdBbl: matchingWti.value,
    spreadUsdBbl: round(common.value - matchingWti.value),
    classification: 'derived-public-price-observation',
  };
}

function deriveInventoryChange(inventories: PublicSeriesObservation[]): PublicMarketSnapshot['inventoryChange'] {
  const byPeriod = new Map<string, PublicSeriesObservation>();
  for (const point of inventories.filter(validObservation)) {
    if (!byPeriod.has(point.period)) byPeriod.set(point.period, point);
  }

  const ordered = [...byPeriod.values()].sort((a, b) => b.period.localeCompare(a.period));
  const latest = ordered[0];
  const previous = ordered[1];
  if (!latest || !previous) return null;

  const delta = latest.value - previous.value;
  return {
    latestPeriod: latest.period,
    previousPeriod: previous.period,
    latestThousandBarrels: latest.value,
    previousThousandBarrels: previous.value,
    deltaThousandBarrels: round(delta),
    deltaPct: previous.value === 0 ? null : round((delta / previous.value) * 100),
    classification: 'derived-public-inventory-observation',
  };
}

function deriveNearTermBalance(forecast: SteoBalancePoint[] | null | undefined): PublicMarketSnapshot['nearTermBalance'] {
  if (!Array.isArray(forecast)) return null;
  const point = forecast
    .filter((candidate) =>
      candidate?.classification === 'forecast' &&
      typeof candidate.period === 'string' &&
      candidate.period.trim().length > 0 &&
      finite(candidate.supplyMbpd) &&
      finite(candidate.demandMbpd) &&
      finite(candidate.balanceMbpd),
    )
    .sort((a, b) => a.period.localeCompare(b.period))[0];

  if (!point) return null;
  return {
    period: point.period,
    supplyMbpd: point.supplyMbpd,
    demandMbpd: point.demandMbpd,
    balanceMbpd: point.balanceMbpd,
    classification: 'forecast',
  };
}

export function derivePublicMarketSnapshot(input: {
  brent: PublicSeriesObservation[];
  wti: PublicSeriesObservation[];
  inventories: PublicSeriesObservation[];
  steoForecast?: SteoBalancePoint[] | null;
}): PublicMarketSnapshot {
  const brent = Array.isArray(input.brent) ? input.brent : [];
  const wti = Array.isArray(input.wti) ? input.wti : [];
  const inventories = Array.isArray(input.inventories) ? input.inventories : [];

  return {
    method: 'eia-public-derived-snapshot-v1',
    brentWtiSpread: deriveSpread(brent, wti),
    inventoryChange: deriveInventoryChange(inventories),
    nearTermBalance: deriveNearTermBalance(input.steoForecast),
    limitations: [
      'Brent–WTI spread is a same-period arithmetic difference between public EIA monthly spot-price observations.',
      'Inventory change is the arithmetic difference between the two latest distinct public EIA weekly observations supplied to the calculation.',
      'Near-term balance is an EIA STEO forecast, not observed physical availability or a final actual.',
      'These metrics are descriptive and are not combined into a bullish/bearish score or used to infer market causality.',
    ],
  };
}
