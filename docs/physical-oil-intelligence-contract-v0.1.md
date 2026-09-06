# Physical Oil Intelligence Contract v0.1

## Purpose

LastBarrel should become a physical-oil intelligence product without turning unavailable tanker, cargo, availability or landed-cost information into fake-live data.

This contract defines the minimum semantics a provider and UI must satisfy before a physical-oil metric can be presented as operational intelligence.

## Evidence classes

Every physical-oil value must carry one of these evidence classes:

- `observed` — directly reported by a named source/provider.
- `derived` — calculated deterministically from observed inputs.
- `estimated` — inferred from incomplete physical observations using an explicit method.
- `forecast` — future value from a named source/model.
- `scenario` — result of user/analyst assumptions.
- `unavailable` — required input is not defensibly available.

The UI must not style `estimated`, `forecast` or `scenario` as if they were observed truth.

## Core domains

### 1. Global supply and demand

Required fields:

- period;
- geography;
- crude/liquids scope;
- supply value and unit;
- demand value and unit;
- source IDs;
- evidence class;
- publication/retrieval timestamps;
- revision identifier where available.

A balance is `derived`, never an observation:

`balance = supply - demand`

The app must retain the source period and revision used for both inputs.

### 2. Cargo / vessel state

A cargo record must be distinct from a vessel record.

Minimum vessel fields:

- provider vessel ID;
- IMO when available;
- vessel name;
- vessel class / DWT where licensed;
- last observed position and timestamp;
- AIS observation source;
- draught where available;
- destination text exactly as reported where available.

Minimum cargo fields:

- stable cargo ID internal to LastBarrel;
- linked vessel ID;
- commodity / grade if observed;
- load port and load window;
- destination / discharge port if observed;
- estimated volume only when method metadata is present;
- cargo state;
- evidence class per field;
- source/provenance references.

Allowed cargo states:

- `loading`
- `loaded`
- `in_transit`
- `awaiting_discharge`
- `discharging`
- `delivered`
- `unknown`

The app must not infer a cargo merely because a tanker exists at sea.

### 3. Route and ETA

ETA output is `observed` only when directly supplied by a provider. Otherwise it is `estimated` and must retain:

- last AIS timestamp;
- route assumption;
- assumed speed or provider ETA method;
- destination confidence;
- timestamp of calculation;
- uncertainty window.

Stale AIS must widen uncertainty and reduce confidence.

### 4. Availability

Availability must not mean "global supply exists". It should describe a defined decision context, for example:

- cargoes plausibly available for a destination/region;
- uncommitted export barrels within a date window;
- storage inventory accessible to the relevant market;
- expected production minus known commitments, only when commitment data is actually available.

If contractual/commitment visibility is absent, the product must say so and avoid calling the residual `available`.

### 5. Landed cost

Landed cost is always `derived` or `scenario` unless supplied directly by a licensed provider.

Minimum components:

- crude/grade price basis;
- freight;
- insurance;
- port/terminal fees;
- canal/toll charges where applicable;
- quality/location differential;
- financing/time cost if used;
- currency conversion basis if required;
- calculation timestamp;
- source IDs and evidence class per component.

A component that is unavailable must not be silently replaced with zero. The result should be incomplete/unavailable unless the user explicitly selects a scenario assumption.

## Provider boundary

Physical data integrations should implement a provider-neutral boundary rather than leak vendor-specific response objects into the UI.

Conceptual interfaces:

```ts
interface PhysicalOilProvider {
  getVesselObservations(query: VesselQuery): Promise<VesselObservation[]>;
  getCargoObservations(query: CargoQuery): Promise<CargoObservation[]>;
  getRouteState(query: RouteQuery): Promise<RouteState[]>;
}

interface BalanceProvider {
  getSupplyDemand(query: BalanceQuery): Promise<SupplyDemandObservation[]>;
}
```

Provider adapters must preserve vendor record IDs, timestamps, source metadata and licensing restrictions.

## Confidence contract

LastBarrel's confidence score is an evidence-quality indicator, not a probability forecast.

Physical-oil confidence should be composed from visible factors such as:

- source freshness;
- source independence/agreement;
- observed physical coverage;
- identification confidence (vessel/cargo/grade/destination);
- route/ETA uncertainty;
- forecast horizon and revision stability;
- unresolved disruption risk.

A confidence score must not increase merely because a deterministic formula produced a precise number.

## Failure behaviour

- Provider outage: preserve other live sources and mark the physical layer degraded.
- Stale AIS: retain last observation with stale flag; do not present as current position.
- Ambiguous destination: show `unknown` / confidence reduction.
- Missing cargo volume: do not infer exact barrels from tanker class alone.
- Missing landed-cost component: return incomplete/unavailable unless a labelled scenario assumption supplies it.
- Conflicting providers: retain both observations and expose disagreement; do not silently average.

## First implementation sequence

1. Wire public/licensed global supply-demand observations and revision metadata.
2. Add provider-neutral physical-oil domain types and tests.
3. Select one AIS/maritime provider based on the separate provider checklist.
4. Implement vessel observations first.
5. Add cargo inference only for fields the provider or explicit method can defend.
6. Add ETA uncertainty.
7. Add landed-cost calculation only after freight and route inputs are real or explicitly scenario-labelled.

## Acceptance gate

No cargo, vessel, ETA, availability or landed-cost feature is `feature verified` until:

- every displayed field has an evidence class;
- source/provider and observation timestamp are retained;
- stale/missing/conflicting data paths are visible;
- confidence is explainable;
- CI passes;
- the UI does not present demonstration records as live data.
