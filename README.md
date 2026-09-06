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

Dubai, Murban, cargo/vessel intelligence and landed cost now remain **no-data** in the live view until defensible current sources/providers are connected. Demonstration physical-oil records are not presented as live values.

The adapter uses `EIA_API_KEY` when provided and otherwise uses EIA's public demo key. Production deployments should provide an EIA key and add persistence/revision tracking.

## Confidence model

`lib/confidence.ts` contains a deterministic, auditable 0-100 evidence-quality scoring function for future physical coverage. The UI deliberately does not issue a numeric physical-supply confidence score yet: public prices, U.S. inventories and STEO balance are not enough to justify precision about cargo availability, freight or destination risk.

## Physical-oil integrity contract

See:

- `docs/physical-oil-intelligence-contract-v0.1.md`
- `docs/physical-data-provider-checklist.md`

These define evidence classes, vessel/cargo separation, ETA and landed-cost semantics, provider/licensing gates and failure behavior.

## Remaining roadmap

1. Add EIA/STEO revision persistence and historical backtesting of forecast balance.
2. Add OPEC/IEA ingestion where licensing permits, preserving source disagreement rather than silently averaging.
3. Select a commercial AIS/maritime provider for vessel observations, then separately validate cargo inference and ETA.
4. Add real freight/insurance/fee inputs before enabling landed-cost calculations.
5. Add confidence scoring only when physical coverage is sufficient and explainable.

## Run locally

    npm install
    npm run dev
