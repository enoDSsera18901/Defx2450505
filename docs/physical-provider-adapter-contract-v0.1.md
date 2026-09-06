# Physical Provider Adapter Contract v0.1

## Purpose

This contract defines the code boundary a licensed maritime/cargo provider must satisfy before its data can enter LastBarrel's physical-oil domain.

It sits between a vendor SDK/API and the canonical records in `lib/physical-data.ts`. It contains no Kpler, Vortexa, Spire or other provider-specific field assumptions.

## Provider capabilities

An adapter declares only the capabilities it is currently allowed and able to supply:

- `vessel_observations`
- `cargo_observations`
- `port_events`
- `route_estimates`
- `freight_observations`

A declared capability must have a corresponding adapter method. Capability declaration is not a claim that LastBarrel currently owns a commercial licence; that still requires the provider-trial gate.

## Query boundary

Provider queries use bounded, provider-neutral filters. Common rules include:

- optional ISO-compatible `from` / `to` timestamps;
- `to` may not precede `from`;
- optional result limit must be 1–1000;
- provider/vessel/cargo/port filter lists may not contain blank identifiers.

A future provider adapter can translate these filters into vendor request semantics. Unsupported vendor filters should fail or be omitted explicitly rather than silently broadening the query.

## Provider result envelope

Every adapter call returns a `ProviderResult<T>` containing:

- canonical provider ID;
- retrieval timestamp;
- optional provider request ID;
- `partial` flag;
- human-readable warnings;
- normalized canonical records.

A partial result without an explanation is invalid. This prevents a provider outage, pagination failure or coverage gap from looking like complete market coverage.

## Normalized result gate

`validateProviderResult()` and `assertProviderResult()` enforce:

1. result provider identity matches the configured adapter;
2. every record is the expected canonical record kind;
3. every record retains matching provider provenance;
4. every record independently passes the physical-data runtime validator;
5. malformed/untyped records fail closed rather than reaching UI code.

The adapter therefore cannot return a raw vendor payload and simply cast it to a LastBarrel type.

## Freshness

`assessObservationFreshness()` classifies provider-level observation/effective time as:

- `fresh`
- `stale`
- `unknown`
- `future`

The threshold is supplied by the calling product surface because acceptable age depends on the use case. For example, an AIS position may have a much tighter freshness requirement than a monthly freight assessment.

`unknown` and `future` are explicit states; they are not treated as current observations.

## Trial usage

The future Kpler trial (or Vortexa fallback) should use this sequence for every supported endpoint:

1. validate the LastBarrel query;
2. call the licensed provider;
3. preserve vendor IDs and timestamps;
4. map only defensible vendor fields into canonical observations;
5. validate each physical observation;
6. validate the provider result envelope;
7. retain partial/degraded warnings;
8. evaluate stale/unknown/future paths before rendering.

## Current boundary

This contract can be merged and tested without credentials. It does **not** verify a provider, cargo accuracy, AIS coverage, ETA quality, freight quality or licensing rights. Those remain blocked on issue #6's bounded commercial trial.
