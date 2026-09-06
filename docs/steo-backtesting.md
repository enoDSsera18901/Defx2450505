# STEO vintage backtesting

LastBarrel backtests public U.S. Energy Information Administration (EIA) Short-Term Energy Outlook vintages without upgrading public estimates into stronger evidence than the source provides.

Two archive paths are supported:

1. repository/local snapshots captured from the live EIA API; and
2. official monthly historical STEO Excel workbooks published by EIA.

The official archive path is preferred for historical reproduction because it preserves the actual published vintage rather than synthesising an old snapshot from current data.

## Evidence classifications

| Comparison state | LastBarrel classification | Meaning |
| --- | --- | --- |
| Baseline period is in the baseline forward subset | `forecast` | Value used as the earlier forecast. |
| Same period is still in the later forward subset | `forecast-revision` | Change between two public EIA forecast vintages. |
| Period is no longer in the later forward subset but remains in the later source vintage | `later-vintage-public-estimate` | Later public EIA reference value. It is **not** an observed actual. |
| Official workbook source flag marks a period historical | `historical-public-estimate` | Public EIA historical-labelled estimate contained in that workbook vintage. It is not physical-flow truth. |
| Period is absent from the later source vintage | missing | No comparison is calculated. |
| Observed cargo, vessel, freight or proprietary flow truth | unavailable | This STEO layer does not provide it. |

## Official archive provenance

For each imported official workbook LastBarrel retains:

- EIA issue month and release date;
- EIA modeling-completion date from the workbook;
- canonical `eia.gov` archive URL and source filename;
- SHA-256 of the raw XLSX source artifact;
- source-native historical/forecast boundary from the `Dates` sheet;
- `PAPR_WORLD` world liquids supply values;
- `PATC_WORLD` world liquids consumption values;
- transparently derived supply-demand balance;
- a separate SHA-256 revision fingerprint over the paired values.

Raw artifact identity and value fingerprint are deliberately separate. Two official source files may be distinct artifacts even if their paired values happen to be identical.

The importer fails closed if the workbook structure is malformed or ambiguous, if duplicate target-series rows conflict, if the historical/forecast boundary is inconsistent, or if a derived balance cannot be reproduced from supply minus demand.

## Importing official vintages

Import all configured 2026 releases into the default archive:

```bash
npm run steo:import-official -- 2026
```

Use a non-default destination:

```bash
npm run steo:import-official -- 2026 <directory>
```

The importer only accepts the canonical HTTPS EIA STEO archive filename pattern and bounds workbook size before parsing.

## Backtesting official vintages

Use the earliest and latest official vintages in the archive:

```bash
npm run steo:backtest-official
```

Select vintages by issue month:

```bash
npm run steo:backtest-official -- 2026-01 2026-08
```

A full source-artifact SHA-256 may be used instead of an issue selector when an issue has more than one captured artifact. Ambiguous issue selectors fail rather than silently choosing one file.

Use a non-default archive directory:

```bash
npm run steo:backtest-official -- 2026-01 2026-08 <directory>
```

## Live-API snapshot backtesting

Existing live-API snapshots remain supported:

```bash
npm run steo:backtest
```

or select exact live revisions by fingerprint:

```bash
npm run steo:backtest -- <baseline-fingerprint> <reference-fingerprint> [directory]
```

## What the engine calculates

For periods that have moved out of the later forward subset, the engine reports signed and absolute differences in:

- world liquids supply, million barrels/day;
- world liquids demand/consumption, million barrels/day;
- supply-demand balance, million barrels/day.

It also reports mean signed and mean absolute differences across comparable periods. These are differences to a **later-vintage public EIA estimate**, not error against final observed truth.

Periods that remain forward are kept separate as forecast revisions. Missing later reference periods are reported explicitly rather than silently dropped.

## Reproducibility requirements

A reviewable official-vintage backtest should retain:

1. the exact normalized baseline and reference vintage files;
2. raw source-artifact URLs, filenames and SHA-256 identities;
3. EIA release and modeling-completion dates;
4. source-series identifiers (`PAPR_WORLD`, `PATC_WORLD`);
5. source-native historical/forecast classifications;
6. paired-value revision fingerprints;
7. the exact backtest output; and
8. the code version/commit used for the comparison.

## Limitations

This layer does not provide physical cargoes, vessel movements, freight assessments, proprietary flows, refinery economics or commercial-provider truth. It also does not establish causal explanations for why a forecast changed. Those evidence classes remain separate and unavailable unless an appropriate source is connected.
