# Public source-state watch v0.1

LastBarrel preserves public EIA retrieval states as immutable, content-addressed evidence. The source-state watch detects when the currently retrieved public state differs from the committed archive without automatically changing repository evidence.

## What is watched

The candidate state is built by the existing public-market capture path and therefore uses the same canonical evidence contract:

- Brent spot price series: `RBRTE`;
- WTI spot price series: `RWTC`;
- U.S. crude inventories: `WCESTUS1`;
- linked near-term STEO revision identity and forecast point;
- reproducible public derived snapshot;
- machine-readable public evidence manifest.

The candidate is validated through the repository archive reader before watch assessment.

## Watch outcomes

`lastbarrel-public-source-state-watch-v1` emits one of four explicit states.

### `unchanged`

The candidate fingerprint equals the latest committed source-state fingerprint. No archive action is required.

### `new-source-state`

The candidate fingerprint has never appeared in the committed archive. The watch returns a comparison against the latest committed state and requires manual review before any new evidence file is committed.

### `known-source-state-reappeared`

The candidate fingerprint appeared earlier in the archive but is not the latest committed state. This is not collapsed into `unchanged`: a source state can recur after an intervening state, and that recurrence is surfaced for review. The comparison is against the latest committed state.

### `archive-empty`

No committed source state exists. The candidate requires explicit archive seeding rather than being silently accepted.

## Scheduling and failure behaviour

`.github/workflows/public-market-archive-smoke.yml` runs:

- on pull requests to verify capture/idempotency and watch compatibility;
- manually through `workflow_dispatch`;
- daily at `01:17 UTC`.

For pull requests, a changed live public state does not block unrelated code integration. The workflow records the assessment and preserves the candidate artifact.

For scheduled or manual watch runs, any state requiring review ends the job in failure **after** the validated candidate snapshot and `/tmp/public-watch.json` assessment have been uploaded as a short-lived artifact. This uses GitHub Actions failure notification as the operational alert.

The workflow has `contents: read` only. It cannot commit, open a data PR, rewrite the archive or silently accept a changed source state.

## Analyst/reviewer procedure after an alert

1. Download the `public-market-source-state` artifact.
2. Inspect `public-watch.json` and the candidate JSON.
3. Confirm the candidate validates under the current archive/evidence contracts.
4. Review source observation additions/removals/revisions and derived comparability from the attached comparison.
5. Confirm any STEO differences remain labelled forecast/public-estimate evidence.
6. If the fingerprint is genuinely new and acceptable, commit the exact validated candidate artifact without regenerating it.
7. Re-run exact-head CI, live EIA smoke and public-market archive smoke before merge.
8. If the state is a previously known fingerprint reappearing, do not create a duplicate fingerprint file; investigate whether occurrence tracking is needed before changing the archive contract.

## Evidence boundary

This watch detects differences in public EIA evidence states. It does not infer why a value changed, whether the market is bullish or bearish, or whether physical cargo is available. It contains no commercial cargo, vessel, freight, commitment or proprietary flow evidence. STEO values remain forecasts or public estimates as explicitly labelled.
