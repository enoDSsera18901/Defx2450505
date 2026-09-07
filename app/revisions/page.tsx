import path from 'node:path';
import { buildSteoRevisionIntelligence, type RankedSteoRevision, type SteoRevisionWindow } from '../../lib/steo-revision-intelligence';
import { listOfficialSteoVintages } from '../../lib/steo-official-vintage';

export const dynamic = 'force-dynamic';

const panel = {
  background: '#10151d',
  border: '1px solid #252d39',
  borderRadius: 12,
  padding: 22,
} as const;

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function RevisionRows({ rows }: { rows: RankedSteoRevision[] }) {
  if (!rows.length) return <p style={{ color: '#7e8c9e', margin: '14px 0 0' }}>No comparable periods in this category.</p>;
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      {rows.map((row) => (
        <div key={`${row.classification}-${row.period}`} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #232b36' }}>
          <strong style={{ fontSize: 12 }}>{row.period}</strong>
          <span style={{ color: '#8290a2', fontSize: 11 }}>
            Supply {signed(row.deltaSupplyMbpd)} · Demand {signed(row.deltaDemandMbpd)} m b/d
          </span>
          <strong style={{ fontSize: 13 }}>{signed(row.deltaBalanceMbpd)} m b/d</strong>
        </div>
      ))}
    </div>
  );
}

function WindowPanel({ title, subtitle, window }: { title: string; subtitle: string; window: SteoRevisionWindow }) {
  return (
    <section style={panel}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.13em', color: '#8fa0b4' }}>{title}</p>
      <h2 style={{ margin: '5px 0 5px', fontSize: 21 }}>{window.baselineIssue} → {window.referenceIssue}</h2>
      <p style={{ margin: 0, color: '#8491a3', fontSize: 12, lineHeight: 1.5 }}>{subtitle} · releases {window.baselineReleaseDate} → {window.referenceReleaseDate}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
        <div style={{ background: '#151c25', padding: 14, borderRadius: 9 }}><span style={{ color: '#7d8b9d', fontSize: 10 }}>CONTINUING FORECASTS</span><strong style={{ display: 'block', fontSize: 24, marginTop: 4 }}>{window.continuingForecastPeriods}</strong></div>
        <div style={{ background: '#151c25', padding: 14, borderRadius: 9 }}><span style={{ color: '#7d8b9d', fontSize: 10 }}>MATURED PERIODS</span><strong style={{ display: 'block', fontSize: 24, marginTop: 4 }}>{window.maturedPeriods}</strong></div>
        <div style={{ background: '#151c25', padding: 14, borderRadius: 9 }}><span style={{ color: '#7d8b9d', fontSize: 10 }}>MISSING REFERENCE</span><strong style={{ display: 'block', fontSize: 24, marginTop: 4 }}>{window.missingReferencePeriods.length}</strong></div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Largest continuing forecast balance revisions</h3>
        <p style={{ margin: '4px 0 0', color: '#718094', fontSize: 10 }}>Later vintage minus earlier vintage. Ranked by absolute balance revision; signed values remain visible.</p>
        <RevisionRows rows={window.largestForecastBalanceRevisions} />
      </div>

      <div style={{ marginTop: 22 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Largest forecast-to-later-estimate differences</h3>
        <p style={{ margin: '4px 0 0', color: '#718094', fontSize: 10 }}>Reference values are later-vintage EIA public estimates, not final actuals or observed physical flows.</p>
        <RevisionRows rows={window.largestLaterEstimateBalanceDifferences} />
      </div>

      {window.metrics && (
        <div style={{ marginTop: 18, padding: 14, background: '#0e141c', borderRadius: 9, color: '#8190a2', fontSize: 11, lineHeight: 1.6 }}>
          <strong style={{ color: '#d7e0e9' }}>Matured-period summary:</strong>{' '}
          mean balance delta {signed(window.metrics.meanDeltaBalanceMbpd)} m b/d · mean absolute balance delta {window.metrics.meanAbsoluteDeltaBalanceMbpd.toFixed(2)} m b/d across {window.metrics.periods} period(s).
        </div>
      )}
    </section>
  );
}

export default function SteoRevisionsPage() {
  let intelligence;
  try {
    intelligence = buildSteoRevisionIntelligence(
      listOfficialSteoVintages(path.join(process.cwd(), 'data', 'steo-official-vintages')),
    );
  } catch (error) {
    return (
      <main style={{ minHeight: '100vh', background: '#0b0e13', color: '#edf2f7', padding: 32 }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <a href="/" style={{ color: '#8fa0b4', textDecoration: 'none' }}>← Back to market overview</a>
          <section style={{ ...panel, marginTop: 24 }}>
            <h1 style={{ marginTop: 0 }}>STEO revision intelligence unavailable</h1>
            <p style={{ color: '#8491a3' }}>{error instanceof Error ? error.message : 'The committed official archive could not be evaluated.'}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0b0e13', color: '#edf2f7', padding: 32 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <a href="/" style={{ color: '#8fa0b4', textDecoration: 'none' }}>← Back to market overview</a>
        <header style={{ margin: '24px 0 20px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.13em', color: '#8fa0b4' }}>FORECAST REVISION INTELLIGENCE</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 34 }}>What changed between STEO releases?</h1>
          <p style={{ margin: 0, maxWidth: 800, color: '#8491a3', lineHeight: 1.55 }}>
            Descriptive comparison of official EIA Short-Term Energy Outlook vintages already preserved in LastBarrel. Revisions are evidence-backed changes in published estimates/forecasts, not explanations of market causality.
          </p>
        </header>

        <section style={{ ...panel, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.13em', color: '#8fa0b4' }}>ARCHIVE PROVENANCE</p>
          <h2 style={{ margin: '5px 0 6px', fontSize: 19 }}>{intelligence.archive.vintageCount} official vintages · {intelligence.archive.firstIssue} → {intelligence.archive.latestIssue}</h2>
          <p style={{ margin: 0, color: '#8491a3', fontSize: 12 }}>
            U.S. Energy Information Administration STEO official archive · releases {intelligence.archive.firstReleaseDate} → {intelligence.archive.latestReleaseDate} · million barrels per day.
          </p>
        </section>

        <div style={{ display: 'grid', gap: 16 }}>
          <WindowPanel
            title="LATEST RELEASE CHANGE"
            subtitle="Best view of what changed in the newest committed official release"
            window={intelligence.latestRevision}
          />
          <WindowPanel
            title="ARCHIVE-SPAN CHANGE"
            subtitle="How the captured 2026 outlook changed from the first committed issue to the latest"
            window={intelligence.archiveSpan}
          />
        </div>

        <section style={{ ...panel, marginTop: 16 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.13em', color: '#8fa0b4' }}>LIMITATIONS</p>
          <ul style={{ color: '#7e8c9e', fontSize: 11, lineHeight: 1.65, paddingLeft: 18, marginBottom: 0 }}>
            {intelligence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </section>

        <footer style={{ textAlign: 'center', color: '#536073', fontSize: 9, letterSpacing: '.1em', padding: 18 }}>
          LASTBARREL · OFFICIAL EIA STEO VINTAGE REVISION INTELLIGENCE · DESCRIPTIVE, NOT CAUSAL
        </footer>
      </div>
    </main>
  );
}
