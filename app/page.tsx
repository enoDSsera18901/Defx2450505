'use client';

import { useEffect, useMemo, useState } from 'react';

type Observation = {
  period: string;
  value: number;
  units: string;
};

type SteoWorldBalance = {
  status: 'available' | 'unavailable';
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  evidence: 'forecast';
  production: Observation[];
  consumption: Observation[];
  reason?: string;
};

type MarketData = {
  source: string;
  sourceUrl: string;
  freshness: number;
  freshnessLabel: string;
  prices: {
    brent: Observation[];
    wti: Observation[];
  };
  inventories: Observation[];
  steo: SteoWorldBalance;
};

type FeedStatus = 'loading' | 'live' | 'fallback';

const benchmarks = [
  { name: 'Brent', key: 'brent' as const, note: 'North Sea benchmark' },
  { name: 'WTI', key: 'wti' as const, note: 'US benchmark' },
  { name: 'Dubai', key: null, note: 'Middle East sour' },
  { name: 'Murban', key: null, note: 'UAE light sour' },
];

export default function Home() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>('loading');

  useEffect(() => {
    fetch('/api/market')
      .then((response) => response.json())
      .then((payload: { status: FeedStatus; data: MarketData | null }) => {
        setFeedStatus(payload.status);
        setMarket(payload.data);
      })
      .catch(() => setFeedStatus('fallback'));
  }, []);

  const displayGrades = useMemo(
    () =>
      benchmarks.map((benchmark) => {
        if (!benchmark.key || feedStatus !== 'live') {
          return {
            ...benchmark,
            price: '—',
            move: '—',
            tone: '',
            badge: benchmark.key ? 'UNAVAILABLE' : 'NO SOURCE',
            sourceNote: benchmark.key ? 'EIA feed unavailable' : 'No source adapter configured',
          };
        }

        const series = market?.prices?.[benchmark.key];
        const latest = series?.[0];
        const previous = series?.[1];

        if (!latest) {
          return {
            ...benchmark,
            price: '—',
            move: '—',
            tone: '',
            badge: 'UNAVAILABLE',
            sourceNote: 'No observation returned',
          };
        }

        const change = previous ? (latest.value / previous.value - 1) * 100 : null;
        return {
          ...benchmark,
          price: `$${latest.value.toFixed(2)}`,
          move: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
          tone: change === null ? '' : change >= 0 ? 'up' : 'down',
          badge: 'EIA',
          sourceNote: `${latest.period} · ${latest.units}`,
        };
      }),
    [feedStatus, market],
  );

  const steoPoints = useMemo(() => {
    if (market?.steo?.status !== 'available') return [];
    return market.steo.production
      .map((production) => {
        const consumption = market.steo.consumption.find((row) => row.period === production.period);
        if (!consumption) return null;
        return {
          period: production.period,
          supply: production.value,
          demand: consumption.value,
          balance: production.value - consumption.value,
          units: production.units || consumption.units || 'million barrels per day',
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [market]);

  const currentYear = String(new Date().getUTCFullYear());
  const currentSteo = steoPoints.find((point) => point.period === currentYear) ?? steoPoints.at(-1);
  const chartValues = steoPoints.flatMap((point) => [point.supply, point.demand]);
  const chartMin = chartValues.length ? Math.floor(Math.min(...chartValues) - 1) : 0;
  const chartMax = chartValues.length ? Math.ceil(Math.max(...chartValues) + 1) : 1;
  const chartRange = Math.max(1, chartMax - chartMin);
  const feedLabel = feedStatus === 'live' ? 'EIA FEED CONNECTED' : feedStatus === 'loading' ? 'CONNECTING TO EIA' : 'EIA FEED UNAVAILABLE';
  const steoAvailable = market?.steo?.status === 'available' && steoPoints.length > 0;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand"><span className="brandMark">LB</span><span>LASTBARREL</span></div>
          <p className="eyebrow navLabel">INTELLIGENCE</p>
          <nav>
            {['Overview', 'Prices', 'Supply', 'Cargoes', 'Landed Cost', 'Forecasts', 'Alerts'].map((item, index) => (
              <a className={index === 0 ? 'navItem active' : 'navItem'} href={`#${item.toLowerCase().replace(' ', '-')}`} key={item}>
                <span className="navDot" />{item}
              </a>
            ))}
          </nav>
        </div>
        <div className="sideFooter">
          <div className="live"><span className="pulse" /> {feedLabel}</div>
          <p>Evidence-labelled intelligence layer</p>
          <p>Cargo / freight providers: not configured</p>
        </div>
      </aside>

      <section className="content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">GLOBAL CRUDE INTELLIGENCE</p>
            <h1>Oil market overview</h1>
            <p className="subtle">Observed public data and source-labelled forecasts where available; unsupported physical values remain unavailable.</p>
          </div>
          <div className="topActions">
            <button className="ghost">Export brief</button>
            <button className="primary">+ Create alert</button>
          </div>
        </header>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="sectionHead">
            <div>
              <p className="eyebrow">DATA PROVENANCE</p>
              <h2>{feedStatus === 'live' ? 'EIA public feed connected' : feedStatus === 'loading' ? 'Connecting to EIA…' : 'EIA public feed unavailable'}</h2>
            </div>
            <span className={`status ${feedStatus === 'live' ? 'good' : ''}`}>{feedStatus.toUpperCase()}</span>
          </div>
          <p className="subtle">
            {market ? `${market.source} · ${market.freshnessLabel}` : 'No live EIA values are being displayed until the feed responds.'}{' '}
            <a href="https://www.eia.gov/opendata/" target="_blank" rel="noreferrer">View source ↗</a>
          </p>
          <div className="availability">
            <span>Physical-market coverage</span>
            <strong>{steoAvailable ? 'Partial' : 'Unavailable'}</strong>
            <small>{steoAvailable ? 'Global annual supply/demand outlook is sourced from EIA STEO. Cargo, route, freight and grade-price providers remain unavailable.' : 'No cargo, route, freight, grade-price or global-balance provider is currently responding. Demonstration values are not substituted.'}</small>
          </div>
        </section>

        <section className="metricGrid" id="prices">
          {displayGrades.map((grade) => (
            <article className="card metric" key={grade.name}>
              <div className="metricHead"><span>{grade.name}</span><span className="badge">{grade.badge}</span></div>
              <div className="priceRow"><strong>{grade.price}</strong><span className={grade.tone}>{grade.move}</span></div>
              <p>{grade.note} · {grade.sourceNote}</p>
              <div className="spark">{grade.badge === 'EIA' ? '▁▂▂▃▄▃▅▆▅▇' : '──────────'}</div>
            </article>
          ))}
        </section>

        <section className="twoCol">
          <article className="card confidenceCard">
            <div className="sectionHead">
              <div><p className="eyebrow">DECISION SIGNAL</p><h2>Physical supply assessment</h2></div>
              <span className="status">UNAVAILABLE</span>
            </div>
            <div className="confidenceHero">
              <div className="scoreRing"><span>—</span><small>/100</small></div>
              <div>
                <h3>No defensible physical-market confidence score yet</h3>
                <p>STEO improves the macro balance view, but a physical confidence call still requires real loading-program, cargo, route and disruption evidence. LastBarrel does not convert a forecast into a fake physical-coverage score.</p>
              </div>
            </div>
            <div className="drivers">
              {[
                ['Public market data', feedStatus === 'live' ? 'EIA prices and inventories connected' : 'EIA public feed unavailable'],
                ['Macro outlook', steoAvailable ? 'EIA STEO world balance connected' : 'STEO world balance unavailable'],
                ['Physical coverage', 'Cargo and loading-program providers absent'],
                ['Route economics', 'Freight and landed-cost evidence absent'],
              ].map(([label, detail]) => (
                <div className="driver" key={label}>
                  <div className="driverTop"><span>{label}</span><strong>{label === 'Public market data' && feedStatus === 'live' || label === 'Macro outlook' && steoAvailable ? '✓' : '—'}</strong></div>
                  <div className="track"><span style={{ width: '0%' }} /></div>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="card" id="supply">
            <div className="sectionHead">
              <div><p className="eyebrow">MACRO BALANCE</p><h2>EIA STEO global liquids outlook</h2></div>
              <span className={`status ${steoAvailable ? 'good' : ''}`}>{steoAvailable ? 'FORECAST' : 'UNAVAILABLE'}</span>
            </div>
            {currentSteo ? (
              <>
                <div className="bigNumber">{currentSteo.supply.toFixed(2)} <span>m b/d</span></div>
                <p className="subtle">{currentSteo.period} world petroleum and other liquid fuels production; STEO consumption {currentSteo.demand.toFixed(2)}m b/d.</p>
                <div className="availability">
                  <span>Implied annual balance</span>
                  <strong>{currentSteo.balance >= 0 ? '+' : ''}{currentSteo.balance.toFixed(2)}m b/d</strong>
                  <small>Forecast/model balance, not observed prompt availability. Series: PAPR_WORLD vs PATC_WORLD.</small>
                </div>
              </>
            ) : (
              <>
                <div className="bigNumber">— <span>m b/d</span></div>
                <p className="subtle">The optional EIA STEO adapter is unavailable. The core Brent/WTI and U.S. inventory path remains independent.</p>
              </>
            )}
          </article>
        </section>

        <section className="card chartCard" id="forecasts">
          <div className="sectionHead">
            <div><p className="eyebrow">SOURCE-BACKED OUTLOOK</p><h2>STEO world liquids production vs consumption</h2></div>
            <div className="legend"><span><i className="supplyKey" />Production</span><span><i className="demandKey" />Consumption</span></div>
          </div>
          {steoPoints.length ? (
            <div className="forecastChart">
              {steoPoints.map((point) => {
                const supplyHeight = ((point.supply - chartMin) / chartRange) * 100;
                const demandHeight = ((point.demand - chartMin) / chartRange) * 100;
                return (
                  <div className="month" key={point.period}>
                    <div className="bars">
                      <span className="bar supplyBar" style={{ height: `${Math.max(8, supplyHeight)}%` }} title={`STEO production ${point.supply}`} />
                      <span className="bar demandBar" style={{ height: `${Math.max(8, demandHeight)}%` }} title={`STEO consumption ${point.demand}`} />
                    </div>
                    <strong>{point.period}</strong>
                    <small>{point.balance >= 0 ? '+' : ''}{point.balance.toFixed(1)}</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="subtle">No STEO world-balance series is currently available.</p>}
          <div className="forecastCallout"><strong>Evidence class: forecast.</strong> EIA STEO series PAPR_WORLD and PATC_WORLD are revised with each outlook release. They are not displayed as live vessel-level supply. {market?.steo?.status === 'available' && <a href={market.steo.sourceUrl} target="_blank" rel="noreferrer">View STEO ↗</a>}</div>
        </section>

        <section className="card chartCard">
          <div className="sectionHead">
            <div><p className="eyebrow">EIA HISTORY</p><h2>U.S. crude inventories</h2></div>
            <span className="status">Weekly · excluding SPR</span>
          </div>
          {market?.inventories?.length ? (
            <div className="forecastChart">
              {market.inventories.slice(0, 8).reverse().map((observation) => {
                const maximum = Math.max(...market.inventories.map((item) => item.value));
                return (
                  <div className="month" key={observation.period}>
                    <div className="bars"><span className="bar supplyBar" style={{ height: `${Math.max(8, (observation.value / maximum) * 100)}%` }} /></div>
                    <strong>{observation.period.slice(5)}</strong>
                    <small>{(observation.value / 1000).toFixed(0)}m</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="subtle">No inventory observations are displayed while the EIA feed is unavailable.</p>}
          <div className="forecastCallout"><strong>Observed series:</strong> EIA WCESTUS1, ending stocks excluding the Strategic Petroleum Reserve. Price history uses RBRTE and RWTC monthly spot series.</div>
        </section>

        <section className="twoCol lower">
          <article className="card" id="cargoes">
            <div className="sectionHead"><div><p className="eyebrow">MARITIME FLOWS</p><h2>Cargoes en route</h2></div><span className="status">UNAVAILABLE</span></div>
            <div className="availability">
              <span>No cargo provider configured</span>
              <strong>0 source-backed cargoes</strong>
              <small>AIS position alone will not be treated as proof of cargo grade, volume or destination. This table will populate only from validated cargo evidence.</small>
            </div>
          </article>

          <article className="card" id="landed-cost">
            <div className="sectionHead"><div><p className="eyebrow">DELIVERED ECONOMICS</p><h2>Landed cost</h2></div><span className="status">UNAVAILABLE</span></div>
            <div className="availability">
              <span>No defensible comparison yet</span>
              <strong>Awaiting component evidence</strong>
              <small>Crude price or grade differential, freight and applicable fees must each be source-backed before a delivered-cost total or “best value” recommendation is shown.</small>
            </div>
          </article>
        </section>

        <section className="card methodology">
          <div><p className="eyebrow">EVIDENCE STANDARD</p><h2>How the assessment works</h2></div>
          <div className="methodGrid">
            <div><strong>1. Evidence</strong><p>Identify every value as observed, estimated, forecast, scenario or unavailable and retain its source.</p></div>
            <div><strong>2. Agreement</strong><p>Cross-check independent sources and penalise stale, missing or contradictory observations.</p></div>
            <div><strong>3. Forecast risk</strong><p>Separate actual observations from STEO/model output and expose assumptions and revision risk.</p></div>
            <div><strong>4. Explainability</strong><p>Only derive confidence from real freshness, coverage and agreement inputs; never from decorative constants.</p></div>
          </div>
        </section>

        <footer>LASTBARREL · EIA BRENT/WTI + U.S. INVENTORIES · EIA STEO GLOBAL BALANCE FORECAST · CARGO/FREIGHT DATA UNAVAILABLE UNTIL SOURCE-BACKED</footer>
      </section>
    </main>
  );
}
