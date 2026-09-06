# LastBarrel

Oil-market intelligence dashboard inspired by the LastDrop interaction pattern.

## Current milestone

The dashboard now connects server-side to the public EIA API:

- Brent monthly spot price history (RBRTE);
- WTI monthly spot price history (RWTC);
- U.S. crude ending stocks excluding SPR, weekly (WCESTUS1);
- source URL, observation dates, freshness metadata and a data-derived confidence input;
- graceful demo fallback when EIA is unavailable.

Brent and WTI cards and the inventory history are live when the API responds. Dubai, Murban, current global supply/demand, forward balance, cargoes and landed cost remain clearly labelled demonstration data.

The adapter uses EIA_API_KEY when provided and otherwise uses EIA's public demo key. Production deployments should provide an EIA key and add persistence/revision tracking.

## Confidence model

lib/confidence.ts contains a deterministic, auditable 0-100 evidence-quality score using freshness, source agreement, physical coverage, forecast stability and disruption risk. It is not a probability forecast. The current EIA adapter derives freshness from the latest inventory observation; agreement and physical-coverage values remain conservative configured inputs until independent sources and AIS are connected.

## Remaining roadmap

1. Add EIA/STEO production and demand adapters and replace the global balance demo values.
2. Add OPEC/IEA ingestion where licensing permits, with persistence and revision history.
3. Select a commercial AIS/maritime provider for cargo tracking, route state and ETA analytics.
4. Replace demonstration landed-cost inputs with freight, insurance, fees and route adjustments.
5. Add backtesting, scenario controls and alert thresholds.

## Run locally

    npm install
    npm run dev
