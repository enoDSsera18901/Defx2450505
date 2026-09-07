import type { PublicEvidenceManifest } from './public-evidence-manifest';
import type { PublicMarketSnapshot } from './public-market-snapshot';
import type { SteoRevisionIntelligence } from './steo-revision-intelligence';

export type PublicEiaBriefMarket = {
  source: string;
  sourceUrl: string;
  observedAt: string;
  freshnessLabel: string;
  prices: {
    brent: Array<{ period: string; value: number }>;
    wti: Array<{ period: string; value: number }>;
  };
  publicSnapshot: PublicMarketSnapshot;
  publicEvidenceManifest: PublicEvidenceManifest;
};

function signed(value: number, decimals = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function latestPrice(series: Array<{ period: string; value: number }>) {
  return [...series]
    .filter((point) => typeof point?.period === 'string' && Number.isFinite(point.value))
    .sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
}

function revisionRows(revisions: SteoRevisionIntelligence | null) {
  if (!revisions) return ['- Official STEO revision archive: unavailable in this brief.'];
  const lines = [
    `- Archive: ${revisions.archive.vintageCount} official vintages, ${revisions.archive.firstIssue} → ${revisions.archive.latestIssue}.`,
    `- Latest release comparison: ${revisions.latestRevision.baselineIssue} → ${revisions.latestRevision.referenceIssue}.`,
  ];

  const top = revisions.latestRevision.largestForecastBalanceRevisions.slice(0, 3);
  if (!top.length) {
    lines.push('- Continuing forecast balance revisions: none available in the latest comparison window.');
  } else {
    lines.push('- Largest continuing forecast balance revisions (later vintage minus earlier vintage):');
    top.forEach((point) => {
      lines.push(`  - ${point.period}: balance ${signed(point.deltaBalanceMbpd)} m b/d; supply ${signed(point.deltaSupplyMbpd)}; demand ${signed(point.deltaDemandMbpd)}.`);
    });
  }
  return lines;
}

function evidenceRows(manifest: PublicEvidenceManifest) {
  const lines = [
    `- Manifest method: ${manifest.method}.`,
    `- Manifest generated: ${manifest.generatedAt}.`,
  ];

  const orderedMetrics = [
    'Brent-WTI spread',
    'U.S. crude inventory change',
    'Near-term implied world balance',
  ];
  for (const metric of orderedMetrics) {
    const item = manifest.derivations.find((candidate) => candidate.metric === metric);
    if (!item) {
      lines.push(`- ${metric}: no derived evidence ID because the required source inputs were unavailable.`);
      continue;
    }
    lines.push(`- ${metric}: ${item.evidenceId}; inputs ${item.inputEvidenceIds.join(', ')}; method ${item.method}.`);
  }

  const unavailable = manifest.observations.filter((item) => item.classification === 'unavailable');
  lines.push(`- Explicit unavailable evidence records: ${unavailable.map((item) => item.evidenceId).join(', ')}.`);
  return lines;
}

export function buildPublicEiaBrief(input: {
  generatedAt: string;
  market: PublicEiaBriefMarket;
  revisions: SteoRevisionIntelligence | null;
}): string {
  const { generatedAt, market, revisions } = input;
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('Public EIA brief generatedAt must be date-compatible');
  if (!market?.source?.trim() || !market?.sourceUrl?.trim()) throw new Error('Public EIA brief requires source identity');
  if (Number.isNaN(Date.parse(market.observedAt))) throw new Error('Public EIA brief market observedAt must be date-compatible');
  if (market.publicEvidenceManifest?.method !== 'lastbarrel-public-evidence-manifest-v1') {
    throw new Error('Public EIA brief requires a valid public evidence manifest');
  }

  const brent = latestPrice(market.prices?.brent ?? []);
  const wti = latestPrice(market.prices?.wti ?? []);
  const spread = market.publicSnapshot?.brentWtiSpread ?? null;
  const inventory = market.publicSnapshot?.inventoryChange ?? null;
  const balance = market.publicSnapshot?.nearTermBalance ?? null;

  const lines = [
    '# LastBarrel Public EIA Evidence Brief',
    '',
    `Generated: ${generatedAt}`,
    `Core market response observed: ${market.observedAt}`,
    `Freshness: ${market.freshnessLabel}`,
    '',
    '> Scope: public EIA observations, EIA STEO forecasts, and preserved official STEO revision evidence only. This brief contains no commercial physical-provider observations.',
    '',
    '## Public market observations',
    '',
    `- Brent: ${brent ? `$${brent.value.toFixed(2)}/bbl (${brent.period})` : 'unavailable'}.`,
    `- WTI: ${wti ? `$${wti.value.toFixed(2)}/bbl (${wti.period})` : 'unavailable'}.`,
    `- Brent–WTI spread: ${spread ? `${signed(spread.spreadUsdBbl)} USD/bbl (${spread.period}, derived from same-period public observations)` : 'unavailable; no common valid public period'}.`,
    `- U.S. crude inventory change: ${inventory ? `${signed(inventory.deltaThousandBarrels / 1000)} million bbl (${inventory.previousPeriod} → ${inventory.latestPeriod}, derived)` : 'unavailable; fewer than two distinct valid public observations'}.`,
    `- Near-term implied world balance: ${balance ? `${signed(balance.balanceMbpd)} m b/d (${balance.period}, EIA STEO forecast)` : 'unavailable'}.`,
    '',
    '## Evidence lineage',
    '',
    ...evidenceRows(market.publicEvidenceManifest),
    '',
    '## Official STEO revision context',
    '',
    ...revisionRows(revisions),
    '',
    '## Explicit unsupported gaps',
    '',
    '- Dubai and Murban live prices remain unavailable until a current supported source is connected.',
    '- Live cargo identity, volumes, destination/ETA, commitments and freight remain unavailable until a provider clears the evidence and commercial-rights gates.',
    '- Live landed-cost comparisons remain unavailable without current freight, insurance, port-fee and route evidence.',
    '- Scenario Lab assumptions are not exported as observed market evidence.',
    '',
    '## Evidence boundary',
    '',
    '- Brent–WTI spread and inventory change are arithmetic derived measures, not independent observations.',
    '- STEO balance values are forecasts; later-vintage STEO historical-labelled values are public estimates, not observed physical flows or audited final actuals.',
    '- Revision magnitude is descriptive and does not establish market causality.',
    '- No bullish/bearish score, trade recommendation, or physical-availability claim is produced by this brief.',
    '',
    '## Sources',
    '',
    `- ${market.source}: ${market.sourceUrl}`,
    '- U.S. Energy Information Administration Short-Term Energy Outlook: https://www.eia.gov/outlooks/steo/',
    '',
  ];

  return lines.join('\n');
}
