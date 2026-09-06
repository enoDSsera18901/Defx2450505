import { getSteoGlobalBalance } from './steo';

export type EiaObservation = {
  period: string;
  value: number;
  units: string;
};

const API_ROOT = 'https://api.eia.gov/v2';

async function readSeries(path: string, series: string, frequency: 'monthly' | 'weekly', length = 13) {
  const key = process.env.EIA_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({ api_key: key, frequency, 'data[0]': 'value', 'facets[series][]': series, 'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: String(length) });
  const response = await fetch(`${API_ROOT}/${path}/data/?${params}`, { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error(`EIA ${series} returned ${response.status}`);
  const json = await response.json();
  return (json.response?.data || []).map((row: { period: string; value: string; units: string }) => ({ period: row.period, value: Number(row.value), units: row.units })) as EiaObservation[];
}

export async function getEiaMarketData() {
  const [brent, wti, inventories, steoResult] = await Promise.all([
    readSeries('petroleum/pri/spt', 'RBRTE', 'monthly'),
    readSeries('petroleum/pri/spt', 'RWTC', 'monthly'),
    readSeries('petroleum/stoc/wstk', 'WCESTUS1', 'weekly'),
    getSteoGlobalBalance()
      .then((data) => ({ data, error: null as string | null }))
      .catch((error) => ({ data: null, error: error instanceof Error ? error.message : 'STEO unavailable' })),
  ]);

  const observedAt = new Date().toISOString();
  const latestPeriod = inventories[0]?.period;
  const freshnessHours = latestPeriod ? Math.max(0, (Date.now() - new Date(`${latestPeriod}T00:00:00Z`).getTime()) / 36e5) : 1000;
  const freshness = Math.round(Math.max(0, Math.min(100, 100 - freshnessHours * 0.7)));

  return {
    source: 'U.S. Energy Information Administration (EIA) API',
    sourceUrl: 'https://www.eia.gov/opendata/',
    observedAt,
    freshness,
    freshnessLabel: `${Math.round(freshnessHours)}h since latest inventory observation`,
    prices: { brent, wti },
    inventories,
    globalBalance: steoResult.data,
    globalBalanceError: steoResult.error,
  };
}
