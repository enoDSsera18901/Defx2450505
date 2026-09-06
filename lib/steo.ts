import { fingerprintSteoForecast, type ComparableSteoPoint } from './steo-revision';

export type SteoBalancePoint = ComparableSteoPoint & {
  classification: 'forecast';
};

type SteoRow = {
  period?: string;
  seriesId?: string;
  value?: string | number;
};

const API_ROOT = 'https://api.eia.gov/v2/steo/data/';
const SUPPLY_SERIES = 'PAPR_WORLD';
const DEMAND_SERIES = 'PATC_WORLD';

function finiteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Canonical paired values from the exact public EIA API response window.
 *
 * This deliberately has no forecast classification. It is the revision identity
 * basis and therefore must not depend on the machine's current calendar month.
 */
export function parseSteoSourceWindow(rows: SteoRow[]): ComparableSteoPoint[] {
  const byPeriod = new Map<string, { supply?: number; demand?: number }>();

  for (const row of rows) {
    if (!row.period || (row.seriesId !== SUPPLY_SERIES && row.seriesId !== DEMAND_SERIES)) continue;
    const value = finiteNumber(row.value);
    if (value === null) continue;
    const bucket = byPeriod.get(row.period) ?? {};
    if (row.seriesId === SUPPLY_SERIES) bucket.supply = value;
    if (row.seriesId === DEMAND_SERIES) bucket.demand = value;
    byPeriod.set(row.period, bucket);
  }

  return [...byPeriod.entries()]
    .filter(([, values]) => values.supply !== undefined && values.demand !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => ({
      period,
      supplyMbpd: values.supply as number,
      demandMbpd: values.demand as number,
      balanceMbpd: Number(((values.supply as number) - (values.demand as number)).toFixed(2)),
    }));
}

export function parseSteoBalance(rows: SteoRow[], currentPeriod = new Date().toISOString().slice(0, 7)): SteoBalancePoint[] {
  return parseSteoSourceWindow(rows)
    .filter((point) => point.period >= currentPeriod)
    .map((point) => ({ ...point, classification: 'forecast' as const }));
}

export async function getSteoGlobalBalance() {
  const key = process.env.EIA_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({
    api_key: key,
    frequency: 'monthly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '72',
  });
  params.append('facets[seriesId][]', SUPPLY_SERIES);
  params.append('facets[seriesId][]', DEMAND_SERIES);

  const response = await fetch(`${API_ROOT}?${params}`, { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error(`EIA STEO returned ${response.status}`);

  const json = await response.json();
  const rows = Array.isArray(json.response?.data) ? (json.response.data as SteoRow[]) : [];
  const revisionBasis = parseSteoSourceWindow(rows);
  const forecast = parseSteoBalance(rows);
  if (!revisionBasis.length) throw new Error('EIA STEO returned no paired world supply/demand source periods');
  if (!forecast.length) throw new Error('EIA STEO returned no paired world supply/demand forecast periods');

  return {
    source: 'U.S. Energy Information Administration (EIA) Short-Term Energy Outlook',
    sourceUrl: 'https://www.eia.gov/outlooks/steo/',
    retrievedAt: new Date().toISOString(),
    revisionFingerprint: fingerprintSteoForecast(revisionBasis),
    revisionMethod: 'sha256 of sorted paired PAPR_WORLD/PATC_WORLD source response window values',
    revisionBasis,
    seriesIds: { supply: SUPPLY_SERIES, demand: DEMAND_SERIES },
    unit: 'million barrels per day',
    forecast,
  };
}
