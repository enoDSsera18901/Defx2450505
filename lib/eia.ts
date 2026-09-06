export type EiaObservation = {
  period: string;
  value: number;
  units: string;
};

export type SteoWorldBalance = {
  status: 'available' | 'unavailable';
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  evidence: 'forecast';
  production: EiaObservation[];
  consumption: EiaObservation[];
  reason?: string;
};

const API_ROOT = 'https://api.eia.gov/v2';
const EIA_SOURCE_URL = 'https://www.eia.gov/opendata/';
const STEO_SOURCE_URL = 'https://www.eia.gov/outlooks/steo/';

function apiKey() {
  return process.env.EIA_API_KEY || 'DEMO_KEY';
}

async function readSeries(path: string, series: string, frequency: 'monthly' | 'weekly', length = 13) {
  const params = new URLSearchParams({
    api_key: apiKey(),
    frequency,
    'data[0]': 'value',
    'facets[series][]': series,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: String(length),
  });
  const response = await fetch(`${API_ROOT}/${path}/data/?${params}`, { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error(`EIA ${series} returned ${response.status}`);
  const json = await response.json();
  return (json.response?.data || []).map((row: { period: string; value: string; units?: string; unit?: string }) => ({
    period: row.period,
    value: Number(row.value),
    units: row.units || row.unit || '',
  })) as EiaObservation[];
}

async function readSteoSeries(seriesId: string, frequency: 'annual' | 'monthly' = 'annual', length = 4) {
  const params = new URLSearchParams({
    api_key: apiKey(),
    frequency,
    'data[0]': 'value',
    'facets[seriesId][]': seriesId,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: String(length),
  });
  const response = await fetch(`${API_ROOT}/steo/data/?${params}`, { next: { revalidate: 21600 } });
  if (!response.ok) throw new Error(`EIA STEO ${seriesId} returned ${response.status}`);
  const json = await response.json();
  const rows = (json.response?.data || []).map((row: { period: string; value: string | number; units?: string; unit?: string }) => ({
    period: row.period,
    value: Number(row.value),
    units: row.units || row.unit || 'million barrels per day',
  })) as EiaObservation[];
  if (!rows.length) throw new Error(`EIA STEO ${seriesId} returned no data`);
  return rows;
}

async function getSteoWorldBalance(): Promise<SteoWorldBalance> {
  const retrievedAt = new Date().toISOString();
  try {
    const [production, consumption] = await Promise.all([
      readSteoSeries('PAPR_WORLD'),
      readSteoSeries('PATC_WORLD'),
    ]);
    return {
      status: 'available',
      source: 'U.S. Energy Information Administration Short-Term Energy Outlook (STEO)',
      sourceUrl: STEO_SOURCE_URL,
      retrievedAt,
      evidence: 'forecast',
      production,
      consumption,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      source: 'U.S. Energy Information Administration Short-Term Energy Outlook (STEO)',
      sourceUrl: STEO_SOURCE_URL,
      retrievedAt,
      evidence: 'forecast',
      production: [],
      consumption: [],
      reason: error instanceof Error ? error.message : 'STEO world balance unavailable',
    };
  }
}

export async function getEiaMarketData() {
  // Keep the proven price/inventory path independent from the optional STEO layer.
  const steoPromise = getSteoWorldBalance();
  const [brent, wti, inventories] = await Promise.all([
    readSeries('petroleum/pri/spt', 'RBRTE', 'monthly'),
    readSeries('petroleum/pri/spt', 'RWTC', 'monthly'),
    readSeries('petroleum/stoc/wstk', 'WCESTUS1', 'weekly'),
  ]);
  const steo = await steoPromise;
  const observedAt = new Date().toISOString();
  const latestPeriod = inventories[0]?.period;
  const freshnessHours = latestPeriod ? Math.max(0, (Date.now() - new Date(`${latestPeriod}T00:00:00Z`).getTime()) / 36e5) : 1000;
  const freshness = Math.round(Math.max(0, Math.min(100, 100 - freshnessHours * 0.7)));
  return {
    source: 'U.S. Energy Information Administration (EIA) API',
    sourceUrl: EIA_SOURCE_URL,
    observedAt,
    freshness,
    freshnessLabel: `${Math.round(freshnessHours)}h since latest inventory observation`,
    prices: { brent, wti },
    inventories,
    steo,
  };
}
