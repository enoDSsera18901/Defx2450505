# Physical Data Schema v0.1

## Purpose

This is the provider-neutral runtime boundary for licensed maritime/cargo integrations. It implements the domain semantics already defined in `physical-oil-intelligence-contract-v0.1.md` before any Kpler, Vortexa or AIS payload enters LastBarrel.

The schema contains **no live or demonstration provider records**.

## Core records

### VesselObservation

Represents a vessel identity plus optional evidence-bearing physical fields such as position, DWT, draught and destination text.

Rules:
- stable LastBarrel vessel ID and provider vessel ID are required;
- at least one IMO, MMSI or vessel name identity is required;
- coordinates are range-validated;
- every physical field retains evidence class, source record IDs, timestamp/method and confidence where available.

### CargoObservation

Cargo remains a separate object from the vessel.

Quantity explicitly carries:
- amount;
- unit (`bbl`, `mt`, `m3`);
- basis (`reported`, `provider_estimated`, `derived`);
- matching evidence class.

A reported quantity cannot be labelled estimated, a derived quantity cannot masquerade as observed, and any non-observed value requires an explicit `methodId`.

Cargo state is constrained to the physical-oil contract states. Missing grade, quantity or destination remains absent/unavailable rather than inferred from vessel class or location alone.

### PortEvent

Represents arrival, departure, load, discharge or ship-to-ship events with evidence-bearing port and event time. Runtime validation also rejects unknown event types even if an external adapter has bypassed TypeScript through an untyped provider payload.

### RouteEstimate

Represents route/destination/ETA state. Estimated ETA requires a method. ETA uncertainty cannot be negative and route state is runtime-constrained to the canonical underway/anchored/waiting/diverted/unknown values.

The object is deliberately called `RouteEstimate`; it does not turn a destination string or AIS extrapolation into an observed arrival time.

### FreightObservation

Represents a sourced freight/rate observation with explicit amount and unit. Monetary rates require a currency. `worldscale` is intentionally treated as a dimensionless Worldscale points observation and therefore does not invent a currency denomination. Zero/missing freight is invalid rather than silently becoming a free landed-cost component.

Supported units are `usd_per_bbl`, `usd_per_mt`, `worldscale` and `lumpsum`; unknown provider units fail runtime validation until an explicit mapping is defined.

## EvidenceValue

Every optional physical field that carries meaning uses an evidence wrapper:

- `value`;
- `evidenceClass`;
- one or more stable `sourceRecordIds`;
- optional `asOf` timestamp;
- `methodId` for every derived/estimated/forecast/scenario value;
- optional 0..1 evidence/identification confidence.

`confidence` is evidence quality, not the probability of a market outcome.

Runtime validation re-checks evidence-class values rather than trusting compile-time TypeScript alone. This matters because licensed provider payloads begin as external/untyped data.

## Provenance

Every record carries provider-level provenance:

- provider;
- one or more provider record IDs;
- retrieval timestamp;
- observation/effective timestamp when available;
- evidence class;
- method when non-observed;
- optional confidence;
- optional licence/retention tag.

Provider IDs are retained even after normalization so a later audit can trace the canonical object back to the licensed payload.

## Validation boundary

`validatePhysicalObservation()` rejects, among other cases:

- missing provider/stable identity;
- malformed timestamps;
- confidence outside 0..1;
- invalid runtime record/evidence enum values;
- non-observed values without a method;
- impossible latitude/longitude;
- non-positive cargo quantity or freight rate;
- unknown cargo quantity units/bases;
- inconsistent cargo quantity basis/evidence class;
- unknown port-event or route-state values;
- unknown freight units;
- missing currency for monetary freight rates;
- reversed load windows;
- invalid ETA timestamps or negative uncertainty.

`assertPhysicalObservation()` is the fail-closed adapter boundary for future provider integrations.

## Provider implementation rule

A future Kpler/Vortexa/Spire adapter should:

1. retain the raw provider payload outside the UI boundary where the licence permits;
2. map provider fields into these canonical records;
3. call `assertPhysicalObservation()` before returning a normalized object;
4. preserve fields it cannot defend as missing/unavailable;
5. never infer cargo grade/volume from AIS position alone;
6. keep provider-supplied estimates distinguishable from LastBarrel-derived values;
7. fail closed on vendor enum/unit values that have no reviewed canonical mapping.

## Current gate

The schema and validation tests can merge before provider credentials exist. **Feature verification for cargo, vessel ETA, availability, freight or landed cost still requires a licensed provider trial plus visible UI failure/stale-data paths.**
