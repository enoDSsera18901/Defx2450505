# LastBarrel

Oil-market intelligence dashboard inspired by the LastDrop interaction pattern.

## Current milestone

The dashboard connects server-side to public U.S. Energy Information Administration (EIA) data and separates observations, forecasts and unavailable physical intelligence.

### Public observed-data path

- Brent monthly spot price history (`RBRTE`);
- WTI monthly spot price history (`RWTC`);
- U.S. crude ending stocks excluding SPR, weekly (`WCESTUS1`);
- source URL, observation dates and freshness metadata;
- safe no-data state when the EIA core feed is unavailable.

Brent and WTI cards and the U.S. inventory history are only populated when the EIA API responds. Dubai and Murban remain unavailable because no source adapter is configured for those benchmarks.

### EIA STEO macro-outlook path

The optional Short-Term Energy Outlook adapter retrieves:

- world petroleum and other liquid fuels production (`PAPR_WORLD`);
- world petroleum and other liquid fuels consumption (`PATC_WORLD`).

These values are displayed as a **forecast/model outlook**, not as live physical supply. The adapter is deliberately independent from the Brent/WTI/inventory path: if STEO fails, the proven observed-data path can continue to operate.

The STEO annual production/consumption series now replaces the previous decorative global-balance chart. LastBarrel does not infer vessel availability, prompt cargo supply or route confidence from the STEO macro forecast.

## Physical-data boundary

No global cargo/AIS, loading-program, freight or grade-price provider is configured today. Therefore:

- cargo rows remain unavailable rather than generated;
- AIS position alone is not treated as proof of grade, volume or destination;
- landed cost remains unavailable until crude/grade price, freight and applicable fees are individually source-backed;
- no HIGH/MEDIUM/LOW physical-supply confidence score is emitted from incomplete coverage;
- unsupported values render as `UNAVAILABLE` or `NO SOURCE` rather than demo-live data.

See `docs/PHYSICAL_DATA_CONTRACT.md` for the evidence model and provider requirements.

## Evidence and confidence model

`lib/physical-data.ts` defines `observed`, `estimate`, `forecast`, `scenario` and `unavailable` evidence states plus validation helpers for source and methodology metadata.

`lib/confidence.ts` contains a deterministic evidence-quality scoring primitive, but the UI no longer feeds it decorative physical-coverage constants. A physical confidence assessment should only return when provider freshness, agreement, coverage and uncertainty are derived from real evidence. Confidence is quality metadata, not a probability.

## API key and cost

EIA API access is public and the application reads `EIA_API_KEY` when provided. Register for a free EIA API key for a production deployment. The code currently retains `DEMO_KEY` as a development fallback, but runtime availability should not be assumed without a valid key.

## Remaining roadmap

1. Add persistence/revision tracking for EIA and STEO releases.
2. Add OPEC/IEA or other public/licensed inputs where redistribution permits and preserve source scope.
3. Select a licensed AIS/maritime/cargo provider for vessel state, route state and ETA analytics.
4. Add grade-price and freight providers, then calculate landed cost only from validated component evidence.
5. Derive evidence-quality confidence from actual provider coverage, freshness and agreement.
6. Add backtesting, scenario controls and alert thresholds.

## Run locally

```bash
npm install
npm run dev
```

For production-like EIA access:

```bash
EIA_API_KEY=your_free_eia_key npm run dev
```
