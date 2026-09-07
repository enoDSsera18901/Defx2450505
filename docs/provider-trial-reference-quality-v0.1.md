# Provider-trial reference quality v0.1

## Purpose

A physical-oil provider trial must not treat provider-specific commodity, grade or location strings as stable identity.

The trial evaluator therefore uses the repository's deterministic physical-reference resolver before it credits a trial with representative grade or route diversity.

This layer is an evaluation control. It is not a claim that a commercial provider is connected, licensed, accurate or suitable for production use.

## Trial envelope

A normalized provider-trial dataset now includes:

- `providerId`;
- `capturedAt`;
- freshness thresholds by observation kind;
- canonical physical observations;
- a `referenceCatalog` containing the explicit commodity, grade and location identities/aliases used for the trial.

The catalog belongs to the evaluation envelope. It does not replace or mutate provider raw values.

## Deterministic reference requirement

For every supplied reference-bearing field, the evaluator applies `deterministic-physical-reference-resolution-v1`.

Reference-bearing fields currently include:

- cargo commodity;
- cargo grade;
- cargo load port;
- cargo destination;
- cargo discharge port;
- route origin/destination;
- port-event port;
- freight origin/destination.

A supplied value must resolve to exactly one canonical identity for the trial evidence packet to be complete.

The allowed outcomes are:

1. `resolved` — exactly one canonical reference matched;
2. `ambiguous` — more than one canonical reference matched at the same deterministic precedence;
3. `unresolved` — no deterministic reference matched.

Ambiguous and unresolved supplied values are preserved as explicit issues and block trial completeness. Missing fields remain missing evidence and are evaluated separately; they are not converted into unresolved strings.

No fuzzy matching, probabilistic identity selection or best-candidate guess is allowed in this gate.

## Raw versus canonical diversity

The report retains raw label counts for diagnostics, but raw strings cannot satisfy representative-diversity checks.

`multiple_grades` is based on distinct resolved canonical grade IDs.

`multiple_routes` is based on distinct resolved canonical load-location → destination-location ID pairs.

This prevents spelling, casing, aliases or provider naming conventions from inflating apparent diversity.

For example, `Arab Light` and an explicit alias such as `AL` may appear as two raw labels while still contributing only one canonical grade identity.

## Destination precedence

For cargo route attribution, discharge port takes precedence when it is supplied. Otherwise the cargo destination field is used.

If the selected destination field is ambiguous or unresolved, no canonical route is credited for that cargo. The evaluator does not silently fall back to a less authoritative field to manufacture a route.

## Reference-quality report

The trial report includes:

- whether a reference catalog was supplied and validated;
- total supplied reference fields;
- resolved, ambiguous and unresolved counts;
- resolved percentage;
- counts by reference kind (`commodity`, `grade`, `location`);
- distinct canonical grades;
- distinct canonical routes;
- per-record reference-resolution issues;
- candidate IDs for ambiguous matches;
- source-record IDs associated with each issue.

## Evidence-completeness effect

A trial evidence packet is incomplete when:

- the reference catalog is missing or invalid;
- any supplied reference field is ambiguous;
- any supplied reference field is unresolved;
- fewer than two canonical grades resolve;
- fewer than two canonical cargo routes resolve;
- or any pre-existing provider-trial acceptance check fails.

There is deliberately no invented percentage threshold such as “90% resolution is good enough.” For this bounded trial, every supplied reference must be deterministically accounted for before the normalized packet is considered review-ready.

## What this does not prove

Passing this gate does not establish:

- provider commercial rights or licence suitability;
- provider data accuracy;
- cargo identity correctness beyond the supplied evidence;
- vessel/cargo linkage correctness;
- destination certainty where the provider itself is uncertain;
- freight economic suitability;
- live production readiness;
- historical retention rights;
- derived-data/display/export rights.

Those remain explicit provider-trial and commercial/licence gates.

## Practical provider-trial workflow

1. Capture provider records without discarding provider IDs or raw labels.
2. Normalize them into the repository physical-oil contracts.
3. Build/curate the bounded trial reference catalog from explicit provider documentation and source evidence.
4. Run `npm run trial:report -- <normalized-trial.json>`.
5. Inspect every ambiguous/unresolved reference issue.
6. Fix the adapter/catalog only when evidence justifies the mapping.
7. Re-run until the reference gate and the wider provider-trial evidence checks pass.
8. Review licensing and commercial rights separately before any product exposure.
