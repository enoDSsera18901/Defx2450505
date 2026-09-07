# Provider integration decision v0.1

## Purpose

A provider must not be treated as integration-ready merely because its sample data looks useful, and it must not be treated as integration-ready merely because commercial rights look acceptable.

The combined provider integration decision requires both evidence domains to pass independently:

1. provider-trial evidence quality; and
2. provider commercial-rights readiness.

The provider identity must also match across both evidence packets.

## Decision states

The combined decision has two states:

- `ready_for_controlled_integration`;
- `blocked`.

`ready_for_controlled_integration` means the bounded trial evidence is complete under the repository rules and the supplied commercial-rights packet is release-ready for the same provider.

It is deliberately not called `production_ready`, `live_ready` or `product_release_ready`.

## Required evidence

### Provider trial

The existing provider-trial evaluator must return `evidenceComplete: true`.

That includes:

- canonical physical-data validity;
- bounded sample size;
- completed-voyage evidence;
- missing/ambiguous destination evidence;
- canonical grade/route diversity;
- freight observation coverage;
- valid deterministic reference catalog;
- zero ambiguous/unresolved supplied reference identities.

### Commercial rights

The commercial-rights assessment must return `ready`.

That includes the required product-use rights, commercial obligations/limits, source-document IDs, date validity, conditional compliance and exact provider/licence evidence described in `provider-commercial-rights-v0.1.md`.

### Provider identity

`trial.providerId` and `commercialRights.providerId` must both be present and equal.

A rights packet for one provider can never clear evidence collected from another provider.

## Observation release boundary

Passing the combined provider decision does **not** authorize historical trial records, current provider records or future observations for product exposure by itself.

Every observation intended for commercial product use must separately pass `assessObservationCommercialUse()`.

That requires:

- observation provider = release-ready rights-packet provider;
- observation `provenance.licenceTag` = release-ready rights-packet `licenceTag`.

This is important because provider trial evidence may legitimately be collected under evaluation/trial-only terms. A later commercial agreement does not retroactively change the licence provenance of those records.

## CLI

Run:

```bash
npm run provider:decision -- <normalized-trial.json> <commercial-rights.json>
```

Use `--json` for machine-readable output.

The command exits:

- `0` for `ready_for_controlled_integration`;
- `1` for `blocked`;
- `2` for unreadable/invalid CLI input files.

## What this decision does not prove

A passing decision is not:

- legal advice;
- provider-quality certification;
- a production deployment approval;
- evidence that real production credentials are configured;
- evidence that every commercial observation carries the correct licence tag;
- evidence that operational security, billing or deployment controls are complete;
- permission to expose trial-only data.

It means the provider has cleared the repository's bounded analytical-evidence and commercial-rights prerequisites for a controlled integration step.
