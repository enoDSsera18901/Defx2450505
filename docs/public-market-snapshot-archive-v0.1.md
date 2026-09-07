# Public market snapshot archive v0.1

## Purpose

The public market snapshot archive preserves reproducible retrieval states for LastBarrel's current public EIA market layer. It extends historical reproducibility beyond the official STEO vintage archive without implying that public price/inventory observations are commercial physical-flow intelligence.

A stored snapshot contains:

- EIA Brent monthly observations (`RBRTE`);
- EIA WTI monthly observations (`RWTC`);
- EIA U.S. crude inventory weekly observations excluding SPR (`WCESTUS1`);
- the linked near-term EIA STEO supply/demand forecast point (`PAPR_WORLD` / `PATC_WORLD`) when available;
- the linked STEO revision fingerprint;
- the deterministic public-data snapshot derived from those observations;
- the machine-readable public evidence manifest and explicit unavailable records.

## Source-state identity

Snapshots are keyed by a SHA-256 fingerprint of canonical source state, not by polling time.

The fingerprint includes canonicalized Brent, WTI and inventory observations plus the linked STEO revision identity and near-term forecast point. It excludes retrieval timestamp and derived presentation metadata.

Consequences:

- repeating a capture while the source state is unchanged is idempotent;
- source row ordering does not manufacture a new state;
- a changed public observation or linked STEO revision produces a new fingerprint;
- one fingerprint cannot silently map to different normalized calculations or evidence lineage.

## Immutability and validation

The archive is append-only by source fingerprint. Existing files are never overwritten.

Every read/write validates:

1. canonical source and series identities;
2. timestamps and numeric values;
3. duplicate source periods;
4. source fingerprint against canonical contents;
5. STEO forecast classification and balance arithmetic;
6. reproduction of the public-data snapshot from archived observations;
7. reproduction of the public evidence manifest from the same observations;
8. filename binding to the source fingerprint.

A repeated source state may have a different retrieval timestamp. For idempotency comparison, retrieval timestamps and source-array ordering are normalized; the derived snapshot and evidence structure are still required to match.

## Evidence boundary

This archive preserves what the public EIA interfaces returned to LastBarrel at a retrieval state. It is not a statement that all public values are immutable final truth. Public historical series can themselves be revised.

The archive does not contain or infer:

- vessel or cargo identity;
- cargo volumes or destinations;
- freight quotes;
- contractual commitments;
- proprietary physical-flow intelligence;
- live landed-cost evidence.

Those fields remain unavailable until a commercial provider clears LastBarrel's evidence-quality and commercial-rights gates.

The linked STEO point remains a forecast. It is not relabelled as observed physical availability.

## Capture workflow

Capture the current public source state with:

```bash
npm run public:capture -- data/public-market-snapshots
```

The command reports whether a new source state was created or whether the same state already existed.

For CI/live verification, captures should normally use a temporary directory. Repository snapshots should only be committed after their source-state artifact and normalized contents have been reviewed.
