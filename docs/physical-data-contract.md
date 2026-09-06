# Physical Oil Data Contract

## Purpose

LastBarrel must never make a demonstration cargo, freight rate, supply balance or confidence narrative look live. Physical-oil intelligence is only displayable when the application can identify what the value is, where it came from, how fresh it is and whether it is observed, estimated, forecast, scenario output or unavailable.

## Evidence states

Every physical-market value uses one of five states:

- **observed** — directly retrieved from a named source or provider;
- **estimate** — derived from observed inputs with a documented method;
- **forecast** — future value from a named forecast dataset/model and methodology;
- **scenario** — output generated from explicit user/system assumptions;
- **unavailable** — no defensible value is currently available.

`unavailable` is a first-class state, not an error to hide with demo data.

## Provider path

### Public / low-cost core

The current EIA adapter remains authoritative for the public data it actually retrieves. The next public-source extension should prefer EIA STEO/API data for global supply, demand and forward balance where the required series are available.

Other public reports may be used only when redistribution and update cadence are suitable. Report-derived values must retain publication date and retrieval date and cannot be labelled real-time.

### Cargo and vessel intelligence

No global cargo provider is configured today. Until one exists, the cargo layer must render **unavailable** rather than generated vessel names, cargo volumes, destinations or ETAs.

A future provider adapter must distinguish:

- AIS-observed vessel position;
- inferred laden/ballast state;
- estimated cargo grade;
- estimated cargo volume;
- declared or inferred destination;
- estimated ETA;
- source timestamp and retrieval timestamp.

AIS position alone is not proof of cargo grade, volume, ownership or final destination.

Commercial providers can be added behind the same contract later. Provider licensing and redistribution rights must be checked before exposing data publicly.

## Landed cost

A landed-cost comparison is displayable only when its components are individually source-backed:

1. crude price or grade differential;
2. freight estimate/observation;
3. applicable fees or adjustments;
4. calculation method and timestamp.

If freight or grade pricing is unavailable, the total landed cost is unavailable. The app must not silently substitute decorative example values.

## Confidence

Confidence is not a probability. It is an explainable quality score based on the evidence that actually exists. A physical-market confidence assessment must not claim strong physical coverage when cargo, loading-program or route evidence is unavailable.

The existing deterministic confidence engine can remain, but its inputs must be derived from real provider coverage/freshness rather than hard-coded presentation values.

## UI requirements

- Only source-backed Brent/WTI/EIA series may receive a `LIVE` badge today.
- Dubai, Murban or other prices remain unavailable/demo unless a real source adapter supplies them.
- Cargoes, route status and landed cost remain unavailable until their provider inputs exist.
- Forecast and scenario panels must visibly identify their state.
- A failing optional physical provider must not break the working EIA price/inventory path.

## Implementation sequence

1. Enforce these evidence types at adapter boundaries.
2. Remove or clearly disable fake-live physical values in the current UI.
3. Add EIA STEO/global-balance adapter where feasible.
4. Select and integrate a licensed cargo/AIS provider.
5. Calculate landed cost only from validated component evidence.
6. Derive confidence inputs from provider freshness, agreement and coverage.
