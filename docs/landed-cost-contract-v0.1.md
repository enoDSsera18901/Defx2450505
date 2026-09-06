# Landed Cost Contract v0.1

## Purpose

This contract implements the fail-closed landed-cost rule already defined in `physical-oil-intelligence-contract-v0.1.md`.

A landed-cost total must never exist because missing inputs were silently replaced with zero. The calculation is only complete when every required cost category is explicitly available, every optional category is explicitly available / unavailable / not applicable, and currency conversion is evidenced where needed.

This module contains **no live freight, cargo, FX or crude-price data**.

## Output basis

Version 0.1 calculates a normalized price in a single target currency **per barrel**.

Provider-specific freight units such as Worldscale, lump-sum freight or USD/tonne are not silently converted by this engine. A separate evidenced normalization method must first produce a `per_bbl` cost input.

## Component slots

Every calculation contains exactly these semantic slots:

### Required

- `crude_basis`
- `freight`
- `insurance`
- `port_terminal`
- `quality_location_differential`

A required slot must be `available`. It cannot be omitted or marked `not_applicable`.

### Optional / route-dependent

- `canal_toll`
- `financing_time_cost`

These may be:

- `available` — an evidenced value is included;
- `unavailable` — the input is required for the selected analysis but is not defensibly available;
- `not_applicable` — the cost genuinely does not apply, with a human-readable rationale.

`not_applicable` is deliberately different from a numeric zero.

## Available component evidence

Every available component retains:

- amount;
- three-letter currency;
- unit (`per_bbl` in v0.1);
- evidence class;
- one or more source record IDs;
- as-of timestamp;
- explicit method ID for every non-observed value;
- optional note.

The quality/location differential may be negative because a grade/location discount can reduce delivered price. Other cost components may not be negative. A zero value is allowed only when it is explicitly supplied and evidenced; absence is never converted to zero.

## Currency conversion

If a component currency differs from the calculation target currency, the component must include an explicit FX record containing:

- positive conversion rate;
- exact source and target currencies;
- as-of timestamp;
- source record IDs;
- evidence class;
- method ID for non-observed FX.

The engine rejects:

- mixed-currency inputs without FX evidence;
- FX whose source currency does not match the component;
- FX whose destination does not match the calculation target;
- redundant same-currency conversion metadata.

FX source IDs are retained in the final source set.

## Evidence classification of the total

The calculation itself is never `observed`.

- If no component or FX input is scenario-labelled, the total is `derived`.
- If any component or FX input is a scenario assumption, the total is `scenario`.

Estimated or forecast inputs remain visible on their component records even though the arithmetic output is classified as derived. The engine does not manufacture a probability/confidence score from arithmetic precision.

## Failure behaviour

`calculateLandedCost()` returns `status: incomplete` and no numeric landed-cost total when:

- a required component is unavailable, omitted or marked not applicable;
- a component is malformed or lacks provenance;
- a non-observed value lacks its method;
- mixed currency lacks valid FX evidence;
- a prohibited negative cost is supplied;
- the final normalized total is non-positive.

The incomplete result names unavailable component kinds and validation errors so UI code can render a visible no-data/degraded state.

## Deliberate omissions

Version 0.1 does not yet:

- convert Worldscale to USD/bbl;
- convert lump-sum freight using cargo quantity;
- convert USD/tonne using grade density/yield;
- infer insurance from crude price;
- infer port fees from geography;
- infer canal usage from AIS routes;
- calculate taxes/duties;
- calculate demurrage;
- fetch FX rates;
- calculate a confidence score;
- expose a landed-cost UI.

Those require real/licensed inputs or explicit scenario methods and should be added as separate bounded work packets.

## Acceptance gate

This engine may merge before Kpler/Vortexa access because it uses only synthetic regression fixtures.

A **live landed-cost feature remains unverified and must stay hidden/no-data** until:

1. provider trial and licence terms are accepted;
2. real freight/route/cargo inputs map through the provider boundary;
3. required cost inputs are sourced or explicitly scenario-labelled;
4. stale/missing/conflicting paths are visible;
5. CI passes;
6. browser verification confirms the UI never presents an incomplete calculation as a live landed cost.
