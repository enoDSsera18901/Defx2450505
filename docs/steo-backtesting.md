# STEO vintage backtesting

LastBarrel backtests archived public EIA Short-Term Energy Outlook source revisions without upgrading public estimates into stronger evidence than the source provides.

## Evidence classifications

| Comparison state | LastBarrel classification | Meaning |
| --- | --- | --- |
| Baseline period is in the baseline forward subset | `forecast` | Value used as the earlier forecast. |
| Same period is still in the later forward subset | `forecast-revision` | Change between two public EIA forecast vintages. |
| Period is no longer in the later forward subset but is still present in the later archived source window | `later-vintage-public-estimate` | Later public EIA reference value. It is **not** labelled as an observed actual. |
| Period is absent from the later archived source window | missing | No comparison is calculated. |
| Observed physical cargo, vessel, freight or proprietary flow truth | unavailable | This STEO backtest does not provide it. |

## What the engine calculates

For periods that have moved out of the later forward subset, the engine reports signed and absolute differences in:

- world liquids supply, million barrels/day;
- world liquids demand/consumption, million barrels/day;
- supply-demand balance, million barrels/day.

It also reports mean signed difference and mean absolute difference across comparable periods. These are differences to a **later-vintage public EIA estimate**, not error against final observed truth.

Periods that remain forward are kept separate as forecast revisions. Missing later reference periods are reported explicitly rather than silently dropped.

## Running a backtest

The archive must contain at least two valid immutable source revisions.

Use the earliest and latest archived revisions:

```bash
npm run steo:backtest
```

Select exact revisions by fingerprint:

```bash
npm run steo:backtest -- <baseline-fingerprint> <reference-fingerprint>
```

Use a non-default archive directory:

```bash
npm run steo:backtest -- <baseline-fingerprint> <reference-fingerprint> <directory>
```

The JSON output includes both selected fingerprints, retrieval timestamps, per-period evidence classification, metrics, missing periods and limitations.

## Reproducibility requirements

A reviewable backtest should retain:

1. the exact baseline and reference snapshot files;
2. their SHA-256 revision fingerprints;
3. the archive retrieval timestamps;
4. the source-series identifiers (`PAPR_WORLD`, `PATC_WORLD`);
5. the exact backtest output;
6. the code version/commit used to run the comparison.

EIA publishes official historical STEO releases and monthly archive files. Importing those official vintages is preferable to synthesising historical snapshots. Until an importer is implemented and verified, the repository-local archive only proves the vintages actually captured into it.

## Limitations

This layer does not provide physical cargoes, vessel movements, freight assessments, proprietary flows, refinery economics or commercial-provider truth. It also does not establish causal explanations for why a forecast changed. Those evidence classes must remain separate and unavailable unless an appropriate source is connected.
