import {
  assertPublicMarketArchiveSnapshot,
  type PublicMarketArchiveSnapshot,
} from './public-market-snapshot-store';
import {
  comparePublicSourceStates,
  type PublicSourceStateComparison,
} from './public-source-state-comparison';

export type PublicSourceStateWatchStatus =
  | 'unchanged'
  | 'new-source-state'
  | 'known-source-state-reappeared'
  | 'archive-empty';

export type PublicSourceStateWatchAssessment = {
  method: 'lastbarrel-public-source-state-watch-v1';
  status: PublicSourceStateWatchStatus;
  candidate: {
    sourceFingerprint: string;
    retrievedAt: string;
  };
  committedArchive: {
    stateCount: number;
    latestFingerprint: string | null;
    latestRetrievedAt: string | null;
  };
  actionRequired: boolean;
  action:
    | 'none'
    | 'review-and-commit-new-source-state'
    | 'review-known-source-state-reappearance'
    | 'seed-archive';
  comparison: PublicSourceStateComparison | null;
  limitations: string[];
};

function orderedArchive(archive: PublicMarketArchiveSnapshot[]) {
  const seen = new Set<string>();
  const ordered = [...archive]
    .map((snapshot) => assertPublicMarketArchiveSnapshot(snapshot))
    .sort((a, b) => Date.parse(a.retrievedAt) - Date.parse(b.retrievedAt));

  for (const snapshot of ordered) {
    if (seen.has(snapshot.sourceFingerprint)) {
      throw new Error(`Committed archive contains duplicate source fingerprint ${snapshot.sourceFingerprint}`);
    }
    seen.add(snapshot.sourceFingerprint);
  }
  return ordered;
}

export function assessPublicSourceStateWatch(
  candidate: PublicMarketArchiveSnapshot,
  committedArchive: PublicMarketArchiveSnapshot[],
): PublicSourceStateWatchAssessment {
  assertPublicMarketArchiveSnapshot(candidate);
  const archive = orderedArchive(committedArchive);
  const latest = archive.at(-1) ?? null;
  const candidateSummary = {
    sourceFingerprint: candidate.sourceFingerprint,
    retrievedAt: candidate.retrievedAt,
  };
  const archiveSummary = {
    stateCount: archive.length,
    latestFingerprint: latest?.sourceFingerprint ?? null,
    latestRetrievedAt: latest?.retrievedAt ?? null,
  };
  const limitations = [
    'This watch detects differences between validated public EIA source states; it does not infer market causality or trading direction.',
    'A newly detected fingerprint is a candidate public source state and must be reviewed before it is committed as durable evidence.',
    'A previously known fingerprint can reappear after another state; this is surfaced for review rather than silently treated as unchanged.',
    'STEO values remain forecasts or public estimates as labelled. No cargo, vessel, freight, commitment or proprietary physical-flow evidence is inferred.',
  ];

  if (!latest) {
    return {
      method: 'lastbarrel-public-source-state-watch-v1',
      status: 'archive-empty',
      candidate: candidateSummary,
      committedArchive: archiveSummary,
      actionRequired: true,
      action: 'seed-archive',
      comparison: null,
      limitations,
    };
  }

  if (latest.sourceFingerprint === candidate.sourceFingerprint) {
    return {
      method: 'lastbarrel-public-source-state-watch-v1',
      status: 'unchanged',
      candidate: candidateSummary,
      committedArchive: archiveSummary,
      actionRequired: false,
      action: 'none',
      comparison: null,
      limitations,
    };
  }

  const candidateTime = Date.parse(candidate.retrievedAt);
  const latestTime = Date.parse(latest.retrievedAt);
  if (!(candidateTime > latestTime)) {
    throw new Error('Candidate public source state must be retrieved after the latest committed archive state');
  }

  const comparison = comparePublicSourceStates(latest, candidate);
  const knownEarlier = archive.some((snapshot) => snapshot.sourceFingerprint === candidate.sourceFingerprint);
  return {
    method: 'lastbarrel-public-source-state-watch-v1',
    status: knownEarlier ? 'known-source-state-reappeared' : 'new-source-state',
    candidate: candidateSummary,
    committedArchive: archiveSummary,
    actionRequired: true,
    action: knownEarlier ? 'review-known-source-state-reappearance' : 'review-and-commit-new-source-state',
    comparison,
    limitations,
  };
}
