# Public source-state comparison v0.1

## Purpose

LastBarrel preserves immutable public EIA source states for Brent (`RBRTE`), WTI (`RWTC`), U.S. crude inventories (`WCESTUS1`) and the linked near-term STEO revision. This comparison layer answers a narrow analyst question: **what changed between two genuine preserved public source states?**

It does not answer why the market changed.

## Evidence model

The comparison starts from two already-validated `PublicMarketArchiveSnapshot` objects. Both retain their original source fingerprints and evidence manifests.

The comparison separates:

1. **Public source-observation changes**
   - `added`: a period exists only in the later source state;
   - `removed`: a period exists only in the earlier source state;
   - `revised`: the same source-series period has a different value or unit.

2. **Derived public metric changes**
   - Brent-WTI spread;
   - U.S. crude inventory change;
   - near-term implied world balance.

3. **STEO source-state changes**
   - revision fingerprint identity;
   - near-term forecast period;
   - supply, demand and balance deltas only when the compared forecast period is the same.

## Same-window rule

A derived delta is calculated only when both archived states refer to the same underlying comparison window.

Examples:

- Brent-WTI spread for August 2026 vs Brent-WTI spread for August 2026: delta may be calculated.
- Brent-WTI spread for August 2026 vs September 2026: `window-shifted`; delta is deliberately `null`.
- inventory change using the same pair of weekly dates: delta may be calculated.
- inventory change using a newly advanced weekly pair: `window-shifted`; delta is deliberately `null`.
- September STEO balance vs September STEO balance: forecast delta may be calculated.
- September STEO balance vs October STEO balance: shifted period; no forecast delta is calculated.

This prevents normal period roll-forward from masquerading as a like-for-like revision.

## Provenance

Source changes retain stable source evidence IDs such as:

- `eia:RBRTE:2026-08`
- `eia:RWTC:2026-08`
- `eia:WCESTUS1:2026-09-04`

Derived comparisons retain the archived evidence IDs from each state's evidence manifest. The comparison does not replace or rewrite the original archive evidence.

## Chronology and identity

- baseline and reference source fingerprints must be different;
- the reference retrieval timestamp must be later than the baseline retrieval timestamp;
- identical source states cannot be compared as if they were a revision;
- at least two genuine archived source states are required for a latest-state comparison.

## Repository workflows

Run the comparison regressions:

```bash
npm run test:public-history
```

Compare the latest two states in the default archive:

```bash
npm run public:compare
```

Compare two explicit archived fingerprints:

```bash
npm run public:compare -- data/public-market-snapshots <baseline-sha256> <reference-sha256>
```

If fewer than two genuine source states exist, the CLI returns `insufficient-history` and does not create synthetic history.

The read-only endpoint:

```text
GET /api/public/history
```

always exposes archive state count and fingerprints. Its `comparisonStatus` is `insufficient-history` until at least two genuine states exist.

## Limitations

- Public EIA historical observations may themselves later be revised.
- A source revision is not proof of market causality or physical cargo availability.
- STEO values retain forecast/public-estimate semantics and are not physical-flow truth.
- No cargo, vessel, freight, commitment, proprietary flow, trade recommendation or bullish/bearish score is inferred.
- The archive is not a substitute for licensed commercial physical-oil data.
