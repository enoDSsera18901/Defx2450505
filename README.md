# LastBarrel

Oil-market intelligence dashboard inspired by the LastDrop interaction pattern.

## MVP scope

The current build includes:

- benchmark crude price cards;
- current physical supply and demand balance;
- forward supply/demand outlook;
- cargoes en route with volume, ETA and disruption status;
- landed-cost comparison by crude grade and origin;
- explainable confidence assessment;
- responsive desktop/mobile dashboard shell.

All market values currently shown in the UI are **demonstration data**, not live observations.

## Confidence model

`lib/confidence.ts` contains a deterministic confidence engine using:

- source freshness — 22%;
- source agreement — 25%;
- physical coverage — 23%;
- forecast stability — 20%;
- resolved disruption risk — 10%.

The score is designed as an auditable evidence-quality indicator, **not a probability forecast**.

## Recommended live data architecture

### Prices

Use licensed or permitted benchmark feeds where available. Public fallback inputs can include EIA series for relevant spot/reference prices.

### Current supply and demand

Candidate sources:

- US EIA;
- OPEC Monthly Oil Market Report;
- IEA Oil Market Report where licensing permits;
- national statistical agencies and energy ministries.

Normalise observations into a common daily/monthly time-series model and retain source timestamps and revisions.

### Cargoes and availability

A production version needs vessel/AIS and loading-program data. AIS coverage normally requires a commercial maritime data provider for reliable cargo identification, routing and ETA analytics.

Each cargo record should preserve:

- vessel / IMO;
- crude grade;
- origin and destination;
- load/discharge terminal;
- estimated volume;
- departure and ETA;
- route state;
- source timestamp;
- confidence / ambiguity flags.

### Landed cost

Calculate delivered crude economics from:

`FOB crude price + freight + insurance/fees + route-specific adjustments`

Freight should ultimately incorporate vessel class, route, bunker cost, canal charges, congestion and sanctions/compliance constraints where relevant.

### Future supply

Model announced production changes, project ramp-ups, maintenance, OPEC+ quotas/voluntary adjustments, field decline, outages and scenario assumptions. Every forward observation should keep a source, effective date, uncertainty range and confidence score.

## Next build steps

1. Add a server-side data-provider interface and persistent time-series schema.
2. Connect public EIA data for benchmark pricing and US supply/inventory fundamentals.
3. Add OPEC/IEA ingestion adapters for global balance inputs.
4. Select an AIS/maritime provider for cargo tracking.
5. Add historical backtesting so confidence weights can be calibrated against forecast error.
6. Add scenario controls and alert thresholds.
7. Replace all demonstration values in `app/page.tsx` with provider-backed observations.

## Run locally

```bash
npm install
npm run dev
```
