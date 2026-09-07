'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicMarketSnapshot } from '../lib/public-market-snapshot';

const gradeDefinitions = [
  { name: 'Brent', series: 'brent', note: 'North Sea benchmark' },
  { name: 'WTI', series: 'wti', note: 'US benchmark' },
  { name: 'Dubai', series: null, note: 'Requires a current licensed/public source' },
  { name: 'Murban', series: null, note: 'Requires a current licensed/public source' },
] as const;

type FeedStatus = 'loading' | 'live' | 'fallback';

type BalancePoint = {
  period: string;
  supplyMbpd: number;
  demandMbpd: number;
  balanceMbpd: number;
  classification: 'forecast';
};

export default function Home() {
  const [market, setMarket] = useState<any>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>('loading');

  useEffect(() => {
    fetch('/api/market')
      .then((response) => response.json())
      .then((payload) => {
        setFeedStatus(payload.status);
        setMarket(payload.data);
      })
      .catch(() => setFeedStatus('fallback'));
  }, []);

  const displayGrades = useMemo(() => gradeDefinitions.map((grade) => {
    const series = grade.series ? market?.prices?.[grade.series] : null;
    const latest = series?.[0];
    const previous = series?.[1];
    if (!latest) return { ...grade, price: '—', move: '—', badge: 'NO DATA', detail: grade.note };
    const move = previous ? `${latest.value >= previous.value ? '+' : ''}${((latest.value / previous.value - 1) * 100).toFixed(1)}%` : '—';
    return { ...grade, price: `$${latest.value.toFixed(2)}`, move, badge: 'LIVE', detail: `${grade.note} · EIA ${latest.period}` };
  }), [market]);

  const snapshot = market?.publicSnapshot as PublicMarketSnapshot | undefined;
  const forecast = (market?.globalBalance?.forecast ?? []) as BalancePoint[];
  const nearTerm = forecast[0] ?? null;
  const chartPoints = forecast.slice(0, 5);
  const chartValues = chartPoints.flatMap((point) => [point.supplyMbpd, point.demandMbpd]);
  const chartMin = chartValues.length ? Math.min(...chartValues) - 0.5 : 0;
  const chartMax = chartValues.length ? Math.max(...chartValues) + 0.5 : 1;
  const barHeight = (value: number) => Math.max(8, ((value - chartMin) / Math.max(0.1, chartMax - chartMin)) * 100);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand"><span className="brandMark">LB</span><span>LASTBARREL</span></div>
          <p className="eyebrow navLabel">INTELLIGENCE</p>
          <nav>
            {['Overview', 'Prices', 'Supply', 'Cargoes', 'Landed Cost', 'Forecasts'].map((item, index) => (
              <a className={index === 0 ? 'navItem active' : 'navItem'} href={`#${item.toLowerCase().replace(' ', '-')}`} key={item}>
                <span className="navDot" />{item}
              </a>
            ))}
            <a className="navItem" href="/revisions"><span className="navDot" />STEO Revisions</a>
            <a className="navItem" href="/scenarios"><span className="navDot" />Scenario Lab</a>
          </nav>
        </div>
        <div className="sideFooter">
          <div className="live"><span className="pulse" /> EIA CORE FEED {feedStatus === 'live' ? 'LIVE' : feedStatus.toUpperCase()}</div>
          <p>Physical providers not connected</p>
          <p>Unsupported values remain no-data</p>
        </div>
      </aside>

      <section className="content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">GLOBAL CRUDE INTELLIGENCE</p>
            <h1>Oil market overview</h1>
            <p className="subtle">Public price, inventory and STEO outlook data with explicit physical-data gaps.</p>
          </div>
          <div className="topActions">
            <a className="ghost" href="/revisions" style={{ textDecoration: 'none' }}>Review STEO changes</a>
            <a className="primary" href="/scenarios" style={{ textDecoration: 'none' }}>Open Scenario Lab</a>
          </div>
        </header>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="sectionHead">
            <div><p className="eyebrow">DATA PROVENANCE</p><h2>{feedStatus === 'live' ? 'EIA public feed connected' : feedStatus === 'loading' ? 'Connecting to EIA…' : 'EIA core feed unavailable'}</h2></div>
            <span className={`status ${feedStatus === 'live' ? 'good' : ''}`}>{feedStatus.toUpperCase()}</span>
          </div>
          <p className="subtle">
            {market ? `${market.source} · ${market.freshnessLabel}.` : 'No live EIA response is currently available.'}{' '}
            <a href="https://www.eia.gov/opendata/" target="_blank" rel="noreferrer">Open EIA source ↗</a>
          </p>
          <div className="availability">
            <span>Global balance layer</span>
            <strong>{market?.globalBalance ? 'EIA STEO forecast connected' : 'No data'}</strong>
            <small>{market?.globalBalance ? `PAPR_WORLD supply + PATC_WORLD consumption · ${market.globalBalance.unit}` : market?.globalBalanceError ?? 'Waiting for STEO.'}</small>
          </div>
        </section>

        <section className="metricGrid" id="prices">
          {displayGrades.map((grade) => (
            <article className="card metric" key={grade.name}>
              <div className="metricHead"><span>{grade.name}</span><span className="badge">{grade.badge}</span></div>
              <div className="priceRow"><strong>{grade.price}</strong><span className={grade.move.startsWith('+') ? 'up' : ''}>{grade.move}</span></div>
              <p>{grade.detail}{grade.badge === 'LIVE' ? ' · USD/bbl' : ''}</p>
              <div className="spark">{grade.badge === 'LIVE' ? '▁▂▂▃▄▃▅▆▅▇' : '──────────'}</div>
            </article>
          ))}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="sectionHead">
            <div><p className="eyebrow">PUBLIC-DATA SNAPSHOT</p><h2>Derived EIA market measures</h2></div>
            <span className="status">DESCRIPTIVE</span>
          </div>
          <div className="supplyRows">
            <div>
              <span>Brent–WTI spread</span>
              <strong>{snapshot?.brentWtiSpread ? `${snapshot.brentWtiSpread.spreadUsdBbl >= 0 ? '+' : ''}${snapshot.brentWtiSpread.spreadUsdBbl.toFixed(2)}` : '—'}</strong>
              <small>{snapshot?.brentWtiSpread ? `USD/bbl · ${snapshot.brentWtiSpread.period}` : 'Requires a common EIA monthly period'}</small>
            </div>
            <div>
              <span>U.S. crude inventory change</span>
              <strong>{snapshot?.inventoryChange ? `${snapshot.inventoryChange.deltaThousandBarrels >= 0 ? '+' : ''}${(snapshot.inventoryChange.deltaThousandBarrels / 1000).toFixed(2)}` : '—'}</strong>
              <small>{snapshot?.inventoryChange ? `million bbl · week to ${snapshot.inventoryChange.latestPeriod}` : 'Requires two distinct EIA weekly observations'}</small>
            </div>
            <div>
              <span>Near-term implied balance</span>
              <strong>{snapshot?.nearTermBalance ? `${snapshot.nearTermBalance.balanceMbpd >= 0 ? '+' : ''}${snapshot.nearTermBalance.balanceMbpd.toFixed(2)}` : '—'}</strong>
              <small>{snapshot?.nearTermBalance ? `m b/d · ${snapshot.nearTermBalance.period} STEO forecast` : 'No paired STEO forecast available'}</small>
            </div>
          </div>
          <div className="forecastCallout"><strong>Descriptive only:</strong> arithmetic derived from public EIA observations plus an explicitly labelled STEO forecast. <span>No bullish/bearish score and no causal interpretation.</span></div>
        </section>

        <section className="twoCol">
          <article className="card confidenceCard">
            <div className="sectionHead"><div><p className="eyebrow">EVIDENCE COVERAGE</p><h2>Physical confidence</h2></div><span className="status">PARTIAL</span></div>
            <div className="availability">
              <span>Numeric physical-confidence score</span>
              <strong>Not issued</strong>
              <small>Prices, U.S. inventories and STEO balance are source-backed, but AIS/cargo, commitments, freight and destination coverage are not connected. A precise physical-supply score would overstate the evidence.</small>
            </div>
            <div className="drivers" style={{ marginTop: 18 }}>
              <div className="driver"><div className="driverTop"><span>Brent / WTI</span><strong>{feedStatus === 'live' ? 'EIA' : 'NO DATA'}</strong></div><small>Public EIA price series.</small></div>
              <div className="driver"><div className="driverTop"><span>U.S. inventories</span><strong>{market?.inventories?.length ? 'EIA' : 'NO DATA'}</strong></div><small>Weekly stocks excluding SPR.</small></div>
              <div className="driver"><div className="driverTop"><span>Global balance</span><strong>{market?.globalBalance ? 'STEO' : 'NO DATA'}</strong></div><small>Explicit near-term forecast, not a live physical observation.</small></div>
              <div className="driver"><div className="driverTop"><span>Cargo / freight</span><strong>NO DATA</strong></div><small>No AIS or freight provider selected.</small></div>
            </div>
          </article>

          <article className="card" id="supply">
            <div className="sectionHead"><div><p className="eyebrow">GLOBAL BALANCE</p><h2>Near-term supply</h2></div><span className="status">{nearTerm ? 'STEO FORECAST' : 'NO DATA'}</span></div>
            <div className="bigNumber">{nearTerm ? nearTerm.supplyMbpd.toFixed(1) : '—'} <span>{nearTerm ? 'm b/d' : ''}</span></div>
            <p className="subtle">{nearTerm ? `${nearTerm.period} EIA STEO petroleum and other liquid fuels forecast.` : 'No paired STEO world supply/demand period is available.'}</p>
            <div className="supplyRows">
              <div><span>World supply</span><strong>{nearTerm ? nearTerm.supplyMbpd.toFixed(1) : '—'}</strong><small>m b/d</small></div>
              <div><span>World consumption</span><strong>{nearTerm ? nearTerm.demandMbpd.toFixed(1) : '—'}</strong><small>m b/d</small></div>
              <div><span>Implied balance</span><strong>{nearTerm ? `${nearTerm.balanceMbpd >= 0 ? '+' : ''}${nearTerm.balanceMbpd.toFixed(2)}` : '—'}</strong><small>m b/d</small></div>
            </div>
            <div className="availability"><span>Prompt physical availability</span><strong>Not assessed</strong><small>Contractual commitments and cargo visibility are absent, so the STEO balance is not relabelled as available barrels.</small></div>
          </article>
        </section>

        <section className="card chartCard" id="forecasts">
          <div className="sectionHead"><div><p className="eyebrow">FORWARD BALANCE</p><h2>Supply vs demand outlook</h2></div><div className="legend"><span><i className="supplyKey" />Supply</span><span><i className="demandKey" />Demand</span></div></div>
          {chartPoints.length ? (
            <div className="forecastChart">
              {chartPoints.map((point) => (
                <div className="month" key={point.period}>
                  <div className="bars">
                    <span className="bar supplyBar" style={{ height: `${barHeight(point.supplyMbpd)}%` }} title={`Supply ${point.supplyMbpd}`} />
                    <span className="bar demandBar" style={{ height: `${barHeight(point.demandMbpd)}%` }} title={`Demand ${point.demandMbpd}`} />
                  </div>
                  <strong>{point.period}</strong>
                  <small>{point.balanceMbpd >= 0 ? '+' : ''}{point.balanceMbpd.toFixed(2)}</small>
                </div>
              ))}
            </div>
          ) : <p className="subtle" style={{ marginTop: 22 }}>STEO forecast data unavailable.</p>}
          <div className="forecastCallout"><strong>Source-backed forecast:</strong> EIA STEO monthly series PAPR_WORLD and PATC_WORLD. <span>Forecast, not live cargo availability.</span></div>
          <a className="ghost" href="/revisions" style={{ display: 'inline-flex', marginTop: 14, textDecoration: 'none' }}>Open revision history →</a>
          <p className="subtle" style={{ marginTop: 9 }}>Compare official STEO vintages to see what EIA changed between releases; revisions remain descriptive, not causal.</p>
        </section>

        <section className="card chartCard">
          <div className="sectionHead"><div><p className="eyebrow">EIA HISTORY</p><h2>U.S. crude inventories</h2></div><span className="status">Weekly · excluding SPR</span></div>
          {market?.inventories?.length ? <div className="forecastChart">
            {market.inventories.slice(0, 8).reverse().map((item: { period: string; value: number }) => <div className="month" key={item.period}><div className="bars"><span className="bar supplyBar" style={{ height: `${Math.max(8, (item.value / Math.max(...market.inventories.map((entry: { value: number }) => entry.value))) * 100)}%` }} /></div><strong>{item.period.slice(5)}</strong><small>{(item.value / 1000).toFixed(0)}m</small></div>)}
          </div> : <p className="subtle">Waiting for the live EIA inventory series.</p>}
          <div className="forecastCallout"><strong>Live series:</strong> EIA WCESTUS1. Price history uses RBRTE and RWTC monthly spot series.</div>
        </section>

        <section className="twoCol lower">
          <article className="card" id="cargoes">
            <div className="sectionHead"><div><p className="eyebrow">MARITIME FLOWS</p><h2>Cargoes en route</h2></div><span className="status">NO DATA</span></div>
            <div className="availability"><span>Live cargo intelligence</span><strong>Provider not connected</strong><small>The previous demonstration vessel/cargo rows have been removed from the live view. AIS, cargo identity, volume, destination and ETA stay unavailable until a provider passes the capability and licensing gate.</small></div>
          </article>

          <article className="card" id="landed-cost">
            <div className="sectionHead"><div><p className="eyebrow">DELIVERED ECONOMICS</p><h2>Landed cost</h2></div><span className="status">NO DATA</span></div>
            <div className="availability"><span>Live delivered cost comparison</span><strong>Not calculated</strong><small>No current freight, insurance, port-fee or route inputs are connected. Missing components are not silently replaced with zero or demonstration values.</small></div>
            <a className="ghost" href="/scenarios" style={{ display: 'inline-flex', marginTop: 14, textDecoration: 'none' }}>Open Scenario Lab →</a>
            <p className="subtle" style={{ marginTop: 9 }}>Scenario Lab uses explicit assumptions and does not change this live card from NO DATA.</p>
          </article>
        </section>

        <section className="card methodology">
          <div><p className="eyebrow">CONFIDENCE ENGINE</p><h2>How the assessment will work</h2></div>
          <div className="methodGrid">
            <div><strong>1. Evidence class</strong><p>Observed, derived, estimated, forecast, scenario and unavailable values stay visibly distinct.</p></div>
            <div><strong>2. Agreement</strong><p>Independent sources can be cross-checked without silently averaging conflicts.</p></div>
            <div><strong>3. Physical coverage</strong><p>Cargo, route and commitment visibility must exist before claiming physical availability.</p></div>
            <div><strong>4. Explainability</strong><p>Any future score must expose freshness, coverage, uncertainty and assumptions.</p></div>
          </div>
        </section>

        <footer>LASTBARREL · EIA PRICES + INVENTORIES LIVE WHEN AVAILABLE · EIA STEO GLOBAL BALANCE FORECAST + OFFICIAL REVISION HISTORY · LIVE CARGOES AND LANDED COST REMAIN NO-DATA · SCENARIO LAB AVAILABLE FOR EXPLICIT ASSUMPTIONS</footer>
      </section>
    </main>
  );
}
