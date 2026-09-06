# Landed Cost Analysis v0.1

## Purpose

This layer adds analyst-grade explanation, sensitivity and comparison to LastBarrel's fail-closed landed-cost engine without weakening the evidence rules in `landed-cost-contract-v0.1.md`.

It does **not** source freight, cargo, insurance, port, differential, FX or proprietary market data. It operates only on landed-cost inputs that already satisfy the core calculation contract.

## 1. Evidence chain

`explainLandedCost()` recalculates the supplied landed-cost input and returns no complete evidence chain unless the base calculation itself is complete.

For each available component it retains:

- component kind;
- original input amount and currency;
- input as-of timestamp;
- evidence class;
- source record IDs;
- non-observed method ID where applicable;
- normalized target-currency contribution;
- whether FX was applied;
- full FX evidence metadata when conversion was required.

Optional components explicitly marked `not_applicable` remain visible with their rationale rather than disappearing as an implied zero.

The final aggregation is explicitly identified as `sum-normalized-per-bbl-components-v1` and carries the union of source record IDs used by the landed-cost result.

This is an evidence-reference chain. Source record IDs identify upstream records; this module does not claim to contain or independently verify the upstream provider record itself.

## 2. One-at-a-time sensitivity

`analyzeLandedCostSensitivity()` requires a complete base landed cost and one or more explicit shocks.

Two shock modes are supported:

- `absolute_per_bbl` — add a stated amount to one normalized component contribution in the target currency per barrel;
- `percent_of_normalized_component` — multiply one normalized component contribution by an explicit percentage change.

Each point changes **one component only**. This is deliberately a one-at-a-time sensitivity method, not a correlated scenario model.

Every sensitivity output is classified `scenario`, even when the base calculation is derived entirely from observed inputs. The stress is an analyst assumption and does not alter the evidence classification or stored value of the base source observation.

The method ID is `one-at-a-time-post-normalization-component-stress-v1`.

### Post-normalization boundary

Sensitivity is applied after the base component has been converted to the calculation's target currency. It therefore answers questions such as:

- What happens to delivered cost if normalized freight is USD 1/bbl higher?
- What happens if the normalized crude-basis contribution is 10% higher?

It does **not** automatically stress the underlying FX rate, Worldscale assessment, cargo quantity, route or source record. Those require their own explicit scenarios/methods.

A stress fails rather than producing a number when:

- the base landed cost is incomplete;
- the selected component is not available in the base calculation;
- the shock is malformed;
- the stress would make a prohibited cost negative;
- crude basis becomes non-positive;
- the stressed total becomes non-positive.

A route component marked `not_applicable` cannot be introduced through sensitivity. The analyst must first define a new valid landed-cost scenario where that route cost is applicable.

## 3. Scenario/comparison attribution

`compareLandedCostInputs()` recalculates both inputs and requires both to be complete, use the same currency and use the same unit.

For every semantic landed-cost component it reports:

- whether the component is included on each side;
- normalized contribution on each side;
- component evidence class and source record IDs;
- right-minus-left component delta.

The sum of component deltas must reconcile exactly (within floating-point tolerance) to the right-minus-left total landed-cost delta. If attribution does not reconcile, the comparison fails rather than returning a misleading explanation.

The comparison itself is:

- `derived` when both landed-cost results are derived;
- `scenario` when either underlying landed-cost result is scenario-labelled.

The method ID is `right-minus-left-normalized-component-attribution-v1`.

## Evidence boundaries

These analysis functions must not be interpreted as:

- live cargo availability;
- observed freight if freight was a scenario input;
- route inference;
- vessel or ETA intelligence;
- a forecast probability;
- a confidence score;
- causal explanation of why a market price moved.

Observed, derived, estimated, forecast and scenario labels remain attached to the inputs that actually carried those semantics.

## Commercial-data blocker

A live physical landed-cost product still requires licensed/evidenced inputs for the relevant route and cargo. At minimum, LastBarrel needs defensible freight semantics and stable source records that can be mapped into the existing provider-neutral contract. Cargo/vessel/route intelligence remains unavailable until a suitable provider is connected and licensing permits the intended storage/display/derived-data use.
