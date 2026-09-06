# LastBarrel

Oil-market intelligence dashboard inspired by the LastDrop interaction pattern.

## Current milestone

The dashboard connects server-side to public EIA data:

- Brent monthly spot price history (RBRTE);
- WTI monthly spot price history (RWTC);
- U.S. crude ending stocks excluding SPR, weekly (WCESTUS1);
- EIA Short-Term Energy Outlook monthly world petroleum and other liquid fuels production (PAPR_WORLD);
- EIA STEO monthly world petroleum and other liquid fuels consumption (PATC_WORLD);
- source URLs, observation/retrieval dates, freshness metadata and explicit forecast labelling.

Brent and WTI cards and the inventory history are live when the EIA API responds. The global balance card and forward chart use the STEO outlook and are explicitly labelled forecasts rather than live physical availability.

Dubai, Murban and cargo/vessel intelligence remain **no-data** in the live view until defensible current sources/providers are connected. Demonstration physical-oil records are not presented as live values.

The `/scenarios` workspace exercises the fail-closed landed-cost engine without pretending commercial maritime inputs are live. It may use a current public EIA Brent observation as the crude basis; freight, insurance, fees, differentials and route-dependent costs entered by the user remain explicitly labelled scenario assumptions. Missing applicable inputs produce no total.

The adapter uses `EIA_API_KEY` when provided and otherwise uses EIA's public demo key. Production deployments should provide an EIA key.

## STEO reproducibility and backtesting

LastBarrel now separates live retrieval snapshots from official historical EIA STEO workbook vintages.

The official-vintage importer preserves the release date, modeling-completion date, canonical EIA workbook URL/name, raw XLSX SHA-256, source-native historical/forecast boundary, paired `PAPR_WORLD`/`PATC_WORLD` values and a separate value fingerprint. Historical-labelled workbook values remain `historical-public-estimate`; they are not promoted to observed physical-flow actuals.

Import configured official 2026 vintages:

```bash
npm run steo:import-official -- 2026
```

Backtest January against August:

```bash
npm run steo:backtest-official -- 2026-01 2026-08
```

See `docs/steo-backtesting.md` for evidence classifications, provenance requirements, selection semantics and limitations.

## Confidence model

`lib/confidence.ts` contains a deterministic, auditable 0-100 evidence-quality scoring function for future use once every input is evidence-backed. The EIA adapter does **not** invent source-agreement, physical-coverage, forecast-stability or disruption-risk values. The UI deliberately does not issue a numeric physical-supply confidence score yet: public prices, U.S. inventories and STEO balance are not enough to justify precision about cargo availability, freight or destination risk.

## Physical-oil integrity contract

See:

- `docs/physical-oil-intelligence-contract-v0.1.md`
- `docs/physical-data-provider-checklist.md`
- `docs/landed-cost-contract-v0.1.md`

These define evidence classes, vessel/cargo separation, ETA and landed-cost semantics, provider/licensing gates and failure behavior.

## Remaining roadmap

1. Complete and retain a real official-vintage STEO history/backtest dataset with reproducible source identities.
2. Strengthen landed-cost sensitivity/scenario comparison while keeping every non-public commercial input explicit.
3. Expand public-source intelligence where licensing and source semantics permit, preserving source disagreement rather than silently averaging.
4. Continue building provider-neutral physical-oil infrastructure without enabling commercial-data features yet.
5. Add confidence scoring only when physical coverage is sufficient and every factor is evidence-backed and explainable.

Commercial maritime/provider data is intentionally deferred while the product is still being built.

## Run locally

```bash
npm install
npm run dev
```
