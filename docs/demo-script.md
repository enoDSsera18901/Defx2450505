# LastBarrel — five-minute demo

## 0:00–0:40 — Public evidence first

Open the LastBarrel overview.

Message:

> LastBarrel is an oil-market intelligence workspace built around explicit evidence classes. The current live layer uses public EIA data; unsupported physical-market fields stay visibly unavailable rather than being guessed.

Show the feed state and the source-labelled Brent, WTI and inventory sections.

## 0:40–1:20 — Show what changed between outlooks

From the forward-balance section, click **Open revision history →** or **STEO Revisions** in the sidebar.

Show:

- the latest official release-to-release window;
- the archive-span comparison;
- separate supply, demand and implied-balance deltas;
- the ranking of the largest balance revisions.

Message:

> These are descriptive changes between preserved official EIA STEO vintages. Later-vintage values remain public estimates, not observed physical flows or final actuals, and LastBarrel does not infer market causality from revision size.

Return to the overview.

## 1:20–1:55 — Show the honesty boundary

Point to Dubai and Murban and show that unsupported grades remain `NO DATA`.

Then show the global balance/forward view and explain that STEO supply/demand points are labelled forecasts/public estimates, not live cargo availability or final observed truth.

This is a key product behaviour: absence of evidence remains absence of evidence.

## 1:55–2:35 — Enter Scenario Lab

Open **Scenario Lab**.

Point out:

- `SCENARIO · NOT LIVE PHYSICAL DATA`;
- the public EIA Brent basis when available;
- the statement that no default freight, fees or insurance values are preloaded.

Before entering anything, click **Calculate scenario** once with required assumptions blank. Confirm the engine returns **No total issued** rather than manufacturing a number.

## 2:35–3:35 — Build an explicitly synthetic delivered-cost scenario

For demonstration only, enter clearly synthetic assumptions such as:

- freight: `2.20` USD/bbl;
- insurance: `0.15` USD/bbl;
- port/terminal: `0.30` USD/bbl;
- quality/location differential: `-0.75` USD/bbl.

Keep canal/toll and financing/time cost off unless you explicitly want to demonstrate those applicability controls.

Calculate.

Explain that these values are demonstration assumptions, not observed freight/insurance/port quotes. Show the component evidence labels and the arithmetic total.

## 3:35–4:20 — Stress and compare

Pin the complete result as the in-memory comparison baseline.

Change one assumption, for example freight from `2.20` to `3.20`, and recalculate.

Show **Current versus pinned baseline** and the component attribution. Then use the one-at-a-time sensitivity control on a component.

Explain that stresses remain scenario-classified and never rewrite the source classification of the public EIA observation.

## 4:20–5:00 — Close with the commercial gate

Return to the overview or provider/evidence discussion.

Message:

> LastBarrel already has provider-neutral cargo, route and landed-cost contracts, but commercial observations are deliberately not exposed just because an API can technically be connected. A provider must clear both the evidence-quality trial and commercial-rights gate for the same provider, and each observation must match the approved provider/licence identity.

Close on the current limitation: the product is demonstrable now as a public-data, official-revision and analyst-scenario intelligence workspace; it is not yet a complete live physical-oil platform.

## Demo acceptance

A deployed demo is verified only after directly observing:

- HTTPS root page load;
- live or explicit fallback EIA state;
- visible **STEO Revisions** navigation from the overview;
- `/revisions` loads the latest-release and archive-span official-vintage comparisons;
- revision limitations explicitly state the analysis is descriptive/non-causal and later-vintage values are public estimates;
- unsupported grade `NO DATA` behaviour;
- Scenario Lab route load;
- fail-closed incomplete calculation;
- complete explicitly synthetic calculation;
- sensitivity and pinned-baseline comparison;
- refresh clears the in-memory baseline as documented;
- no fabricated commercial physical observations;
- direct host port 3000 is not externally reachable.
