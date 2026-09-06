 'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateConfidence } from '../lib/confidence';

const grades = [
  { name: 'Brent', price: '$92.41', move: '+1.8%', tone: 'up', note: 'North Sea benchmark' },
  { name: 'WTI', price: '$88.76', move: '+1.4%', tone: 'up', note: 'US benchmark' },
  { name: 'Dubai', price: '$90.18', move: '+1.1%', tone: 'up', note: 'Middle East sour' },
  { name: 'Murban', price: '$91.03', move: '+1.3%', tone: 'up', note: 'UAE light sour' },
];

const cargoes = [
  { vessel: 'Ocean Vanguard', grade: 'Arab Light', origin: 'Ras Tanura', destination: 'Singapore', volume: '1.98m bbl', eta: '3d 8h', status: 'On time' },
  { vessel: 'Nordic Horizon', grade: 'Basrah Medium', origin: 'Basra', destination: 'Ningbo', volume: '2.04m bbl', eta: '6d 2h', status: 'Weather risk' },
  { vessel: 'Aegean Star', grade: 'Murban', origin: 'Fujairah', destination: 'Yeosu', volume: '1.02m bbl', eta: '4d 19h', status: 'On time' },
  { vessel: 'Pacific Crown', grade: 'ESPO', origin: 'Kozmino', destination: 'Qingdao', volume: '0.74m bbl', eta: '2d 11h', status: 'Congestion' },
];

const drivers = [
  { label: 'Source freshness', score: 94, detail: 'Market and vessel feeds < 30 min' },
  { label: 'Source agreement', score: 87, detail: '5 of 6 indicators aligned' },
  { label: 'Physical coverage', score: 78, detail: 'Key hubs covered; West Africa partial' },
  { label: 'Forecast stability', score: 82, detail: 'Low revision volatility over 72h' },
];

const forwardSupply = [
  { month: 'Sep', supply: 103.2, demand: 102.6 },
  { month: 'Oct', supply: 103.5, demand: 103.0 },
  { month: 'Nov', supply: 103.8, demand: 103.4 },
  { month: 'Dec', supply: 104.4, demand: 103.7 },
  { month: 'Jan', supply: 104.8, demand: 104.0 },
];

export default function Home() {
  const [market, setMarket] = useState<any>(null);
  const [feedStatus, setFeedStatus] = useState<'loading' | 'live' | 'fallback'>('loading');
  useEffect(() => { fetch('/api/market').then((r) => r.json()).then((payload) => { setFeedStatus(payload.status); setMarket(payload.data); }).catch(() => setFeedStatus('fallback')); }, []);
  const displayGrades = useMemo(() => grades.map((g) => {
    const series = g.name === 'Brent' ? market?.prices?.brent : g.name === 'WTI' ? market?.prices?.wti : null;
    const latest = series?.[0];
    const previous = series?.[1];
    return latest ? { ...g, price: `$${latest.value.toFixed(2)}`, move: previous ? `${latest.value >= previous.value ? '+' : ''}${((latest.value / previous.value - 1) * 100).toFixed(1)}%` : '—', note: `${g.note} · EIA ${latest.period}` } : g;
  }), [market]);
  const confidence = market ? calculateConfidence(market.confidenceInputs) : null;
  const max = 105;
  const min = 101;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand"><span className="brandMark">LB</span><span>LASTBARREL</span></div>
          <p className="eyebrow navLabel">INTELLIGENCE</p>
          <nav>
            {['Overview', 'Prices', 'Supply', 'Cargoes', 'Landed Cost', 'Forecasts', 'Alerts'].map((item, i) => (
              <a className={i === 0 ? 'navItem active' : 'navItem'} href={`#${item.toLowerCase().replace(' ', '-')}`} key={item}>
                <span className="navDot" />{item}
              </a>
            ))}
          </nav>
        </div>
        <div className="sideFooter">
          <div className="live"><span className="pulse" /> DATA FEEDS LIVE</div>
          <p>Demo intelligence layer</p>
          <p>UTC 11:57 · 06 SEP 2026</p>
        </div>
      </aside>

      <section className="content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">GLOBAL CRUDE INTELLIGENCE</p>
            <h1>Oil market overview</h1>
            <p className="subtle">Price, physical availability, shipping and forward supply in one decision layer.</p>
          </div>
          <div className="topActions">
            <button className="ghost">Export brief</button>
            <button className="primary">+ Create alert</button>
          </div>
        </header>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="sectionHead"><div><p className="eyebrow">DATA PROVENANCE</p><h2>{feedStatus === 'live' ? 'EIA public feed connected' : feedStatus === 'loading' ? 'Connecting to EIA…' : 'EIA feed unavailable — demo values retained'}</h2></div><span className={`status ${feedStatus === 'live' ? 'good' : ''}`}>{feedStatus.toUpperCase()}</span></div>
          <p className="subtle">{market ? `${market.source} · ${market.freshnessLabel} · confidence freshness input ${market.freshness}/100` : 'The dashboard will show the last demo snapshot until the public feed responds.'} <a href="https://www.eia.gov/opendata/" target="_blank" rel="noreferrer">View source ↗</a></p>
          {confidence && <div className="availability"><span>Data-derived confidence</span><strong>{confidence.score}/100 · {confidence.band}</strong><small>Freshness, source quality, physical coverage and risk inputs are now calculated from the feed adapter; shipping and forward outlook remain mocked.</small></div>}
        </section>

        <section className="metricGrid" id="prices">
          {displayGrades.map((g) => (
            <article className="card metric" key={g.name}>
              <div className="metricHead"><span>{g.name}</span><span className="badge">LIVE</span></div>
              <div className="priceRow"><strong>{g.price}</strong><span className={g.tone}>{g.move}</span></div>
              <p>{g.note} · USD/bbl</p>
              <div className="spark">▁▂▂▃▄▃▅▆▅▇</div>
            </article>
          ))}
        </section>

        <section className="twoCol">
          <article className="card confidenceCard">
            <div className="sectionHead">
              <div><p className="eyebrow">DECISION SIGNAL</p><h2>Supply confidence</h2></div>
              <span className="status good">HIGH</span>
            </div>
            <div className="confidenceHero">
              <div className="scoreRing"><span>86</span><small>/100</small></div>
              <div>
                <h3>Market likely remains adequately supplied</h3>
                <p>Current physical flows and announced additions outweigh near-term disruption risk. Confidence is reduced by incomplete West African cargo visibility and weather exposure in the Gulf.</p>
              </div>
            </div>
            <div className="drivers">
              {drivers.map((d) => (
                <div className="driver" key={d.label}>
                  <div className="driverTop"><span>{d.label}</span><strong>{d.score}</strong></div>
                  <div className="track"><span style={{ width: `${d.score}%` }} /></div>
                  <small>{d.detail}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="card" id="supply">
            <div className="sectionHead">
              <div><p className="eyebrow">PHYSICAL BALANCE</p><h2>Current supply</h2></div>
              <span className="status">+0.6m b/d</span>
            </div>
            <div className="bigNumber">103.2 <span>m b/d</span></div>
            <p className="subtle">Estimated global liquids supply versus 102.6m b/d current demand.</p>
            <div className="supplyRows">
              <div><span>OPEC+</span><strong>43.1</strong><small>m b/d</small></div>
              <div><span>United States</span><strong>20.4</strong><small>m b/d</small></div>
              <div><span>Other non-OPEC</span><strong>39.7</strong><small>m b/d</small></div>
            </div>
            <div className="availability"><span>Prompt availability</span><strong>Normal</strong><small>48 tracked loading programs · 7 constrained</small></div>
          </article>
        </section>

        <section className="card chartCard" id="forecasts">
          <div className="sectionHead">
            <div><p className="eyebrow">FORWARD BALANCE</p><h2>Supply vs demand outlook</h2></div>
            <div className="legend"><span><i className="supplyKey" />Supply</span><span><i className="demandKey" />Demand</span></div>
          </div>
          <div className="forecastChart">
            {forwardSupply.map((x) => {
              const sh = ((x.supply - min) / (max - min)) * 100;
              const dh = ((x.demand - min) / (max - min)) * 100;
              return (
                <div className="month" key={x.month}>
                  <div className="bars">
                    <span className="bar supplyBar" style={{ height: `${sh}%` }} title={`Supply ${x.supply}`} />
                    <span className="bar demandBar" style={{ height: `${dh}%` }} title={`Demand ${x.demand}`} />
                  </div>
                  <strong>{x.month}</strong>
                  <small>+{(x.supply - x.demand).toFixed(1)}</small>
                </div>
              );
            })}
          </div>
          <div className="forecastCallout"><strong>Illustrative scenario:</strong> forward balance is still mocked pending an EIA/STEO forecast adapter. <span>Not live.</span></div>
        </section>

        <section className="card chartCard">
          <div className="sectionHead"><div><p className="eyebrow">EIA HISTORY</p><h2>U.S. crude inventories</h2></div><span className="status">Weekly · excluding SPR</span></div>
          {market?.inventories?.length ? <div className="forecastChart">
            {market.inventories.slice(0, 8).reverse().map((x: { period: string; value: number }) => <div className="month" key={x.period}><div className="bars"><span className="bar supplyBar" style={{ height: `${Math.max(8, (x.value / Math.max(...market.inventories.map((i: { value: number }) => i.value))) * 100)}%` }} /></div><strong>{x.period.slice(5)}</strong><small>{(x.value / 1000).toFixed(0)}m</small></div>)}
          </div> : <p className="subtle">Waiting for the live EIA inventory series.</p>}
          <div className="forecastCallout"><strong>Live series:</strong> EIA WCESTUS1, ending stocks excluding the Strategic Petroleum Reserve. Price history uses RBRTE and RWTC monthly spot series.</div>
        </section>

        <section className="twoCol lower">
          <article className="card" id="cargoes">
            <div className="sectionHead"><div><p className="eyebrow">MARITIME FLOWS</p><h2>Cargoes en route</h2></div><span className="status">5.78m bbl shown</span></div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Vessel / Grade</th><th>Route</th><th>Volume</th><th>ETA</th><th>Status</th></tr></thead>
                <tbody>
                  {cargoes.map((c) => (
                    <tr key={c.vessel}>
                      <td><strong>{c.vessel}</strong><small>{c.grade}</small></td>
                      <td>{c.origin} → {c.destination}</td>
                      <td>{c.volume}</td><td>{c.eta}</td>
                      <td><span className={c.status === 'On time' ? 'mini goodMini' : 'mini warnMini'}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card" id="landed-cost">
            <div className="sectionHead"><div><p className="eyebrow">DELIVERED ECONOMICS</p><h2>Landed cost — Singapore</h2></div><span className="status">VLCC</span></div>
            <div className="costRows">
              <div><span>Arab Light · Ras Tanura</span><strong>$94.86</strong><small>+ $2.45 freight</small></div>
              <div><span>Murban · Fujairah</span><strong>$94.21</strong><small>+ $3.18 freight</small></div>
              <div><span>Basrah Medium · Basra</span><strong>$92.74</strong><small>+ $3.04 freight</small></div>
              <div><span>ESPO · Kozmino</span><strong>$95.08</strong><small>+ $4.17 freight</small></div>
            </div>
            <div className="recommendation"><p className="eyebrow">BEST DELIVERED VALUE</p><strong>Basrah Medium</strong><span>$1.47/bbl below next-best adjusted option</span></div>
          </article>
        </section>

        <section className="card methodology">
          <div><p className="eyebrow">CONFIDENCE ENGINE</p><h2>How the assessment works</h2></div>
          <div className="methodGrid">
            <div><strong>1. Evidence</strong><p>Price feeds, production estimates, inventories, refinery runs, loading programs, vessel movement and announced capacity.</p></div>
            <div><strong>2. Agreement</strong><p>Cross-check independent sources and penalise stale, missing or contradictory observations.</p></div>
            <div><strong>3. Forecast risk</strong><p>Score disruption exposure, schedule certainty, historical revision error and scenario dispersion.</p></div>
            <div><strong>4. Explainability</strong><p>Every confidence score exposes its drivers, data gaps and key assumptions rather than presenting unsupported certainty.</p></div>
          </div>
        </section>

        <footer>LASTBARREL · EIA PRICES + INVENTORIES LIVE · CARGOES, LANDED COST AND FORWARD OUTLOOK DEMONSTRATION DATA</footer>
      </section>
    </main>
  );
}

