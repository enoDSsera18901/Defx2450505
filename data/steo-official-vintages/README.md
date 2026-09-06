# Official EIA STEO 2026 vintages

This directory contains normalized public U.S. Energy Information Administration Short-Term Energy Outlook monthly archive vintages for January through August 2026.

Each JSON filename is `<release-date>_<raw-xlsx-sha256>.json`. The raw SHA-256 identifies the exact official EIA workbook artifact used to produce the normalization. The JSON preserves the canonical EIA archive URL, source filename, release and modeling-completion dates, source-native historical/forecast boundary, paired `PAPR_WORLD` and `PATC_WORLD` values, derived balance, and a separate value revision fingerprint.

`historical-public-estimate` means the value is historical-labelled by that EIA workbook vintage. It is not an observed cargo, vessel, freight, proprietary physical-flow value, or final actual.

Regenerate/verify with:

```bash
npm run steo:import-official -- 2026
npm run steo:backtest-official -- 2026-01 2026-08
```

The importer fails if an unchanged raw source artifact would normalize differently from the committed representation, so parser/source-semantic drift requires explicit review.
