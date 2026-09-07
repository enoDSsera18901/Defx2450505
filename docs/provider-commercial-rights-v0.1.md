# Provider commercial rights gate v0.1

## Purpose

Commercial API access is not the same thing as permission to expose provider data in a product.

This gate creates a fail-closed, machine-readable release control for the provider rights and commercial terms LastBarrel must explicitly record before commercial physical-oil data can be treated as product-release eligible.

It is an internal evidence control. It is not legal advice, a legal opinion, a provider-quality approval or a substitute for review of the actual agreement.

## Rights packet

A `ProviderCommercialRightsPacket` records:

- provider ID;
- stable `licenceTag`;
- review date;
- agreement effective/expiry dates when supplied;
- required data-use rights;
- attribution obligation;
- seat/user scope;
- included API dataset scope;
- API rate limits;
- pricing/commercial terms;
- stable source-document IDs supporting each assertion.

The packet does not copy or publish the underlying agreement. It preserves references to the evidence used for the release decision.

## Mandatory use rights

The gate requires exactly one term for each of:

1. `web_display`;
2. `historical_storage`;
3. `derived_data`;
4. `export_derived_briefs`;
5. `retention_after_subscription`.

Each right is classified as:

- `permitted`;
- `conditional`;
- `prohibited`;
- `unknown`.

`prohibited` and `unknown` block release readiness.

A `conditional` right must contain the explicit condition text and a `conditionalCompliance` value. Release readiness requires that operational compliance is `confirmed`; recording a condition without confirming that the product/process satisfies it is not enough.

## Commercial obligations and limits

The following must also be explicitly known:

- attribution requirement;
- seat/user scope;
- included API dataset scope;
- rate limits;
- pricing/commercial terms.

The gate does not judge whether a price is attractive or a seat count is sufficient. It requires those terms to be explicit so the product cannot silently assume them away.

If attribution is required, the exact operational requirement must be recorded.

If API dataset scope is specified, at least one included dataset must be named. This prevents credentials for one product/data family from being treated as blanket permission for every provider dataset.

## Dates and expiry

Agreement- and right-level effective/expiry dates are validated when supplied.

A future-effective or expired agreement/right blocks readiness at the packet's `reviewedAt` timestamp.

The release gate therefore represents rights at a specific review point; it is not a perpetual approval.

## Source evidence

Every right and commercial term requires at least one stable `sourceDocumentId`.

This can refer to an executed agreement, order form, provider terms, written clarification or other controlled evidence. The identifier should be sufficient for an authorised reviewer to locate the underlying evidence.

Unsourced assertions do not pass validation.

## Observation-level binding

Physical observations already carry `provenance.provider` and optional `provenance.licenceTag`.

`assessObservationCommercialUse()` requires:

- a release-ready provider rights packet;
- observation provider = rights-packet provider;
- observation `licenceTag` = rights-packet `licenceTag`.

This prevents data captured under trial-only, evaluation-only, expired or otherwise different terms from becoming product-visible merely because a later commercial agreement exists with the same provider.

A missing `licenceTag` blocks commercial use.

## CLI

Run:

```bash
npm run commercial:report -- <commercial-rights.json>
```

Use `--json` for machine-readable output.

The command exits:

- `0` when the internal release gate is `ready`;
- `1` when the packet is valid but blocked, or structurally incomplete/invalid;
- `2` when the input file cannot be read/parsed or CLI usage is invalid.

A successful exit is not legal approval. It means the repository's mandatory rights/terms evidence controls have been satisfied for the supplied packet.

## Relationship to the provider trial

The provider trial and commercial-rights gate answer different questions.

The provider-trial evidence gate asks whether the data is structurally useful, traceable, sufficiently representative and canonically resolvable.

The commercial-rights gate asks whether the recorded terms permit the intended product handling and whether the operational/commercial constraints are explicit.

Neither substitutes for the other.

A future production exposure decision should require both:

- provider-trial evidence complete; and
- commercial rights release-ready.

## What this gate does not do

It does not:

- interpret ambiguous legal language automatically;
- infer permission from API access or a successful login;
- infer permission from provider marketing material;
- decide whether a contract is legally enforceable;
- decide whether commercial pricing is attractive;
- approve provider data accuracy;
- waive product compliance with recorded conditions;
- migrate trial-only records onto a new licence tag.

If a term is unclear, it should be recorded as `unknown` and the gate must remain blocked until the ambiguity is resolved by an authorised human/commercial/legal process.
