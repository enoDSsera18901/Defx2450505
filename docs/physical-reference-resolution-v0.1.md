# Physical reference resolution v0.1

## Purpose

Physical-oil providers commonly expose commodity, grade, port, terminal, origin and destination labels as provider-specific text. LastBarrel must not treat two similar strings as the same physical entity without an explicit, auditable transform.

This layer provides deterministic canonical-reference resolution while preserving the provider's raw observation unchanged.

## Reference kinds

Version 0.1 supports canonical references for:

- `commodity` — broad physical commodity family;
- `grade` — named grade linked to a canonical commodity;
- `location` — port, terminal, country, region or other physical location.

Canonical IDs are stable namespaced identifiers such as `commodity:<id>`, `grade:<id>` and `location:<id>`.

A reference catalog may also carry aliases. Locations may carry an uppercase five-character UN/LOCODE and ISO alpha-2 country code.

## Resolution states

Every supplied raw value resolves to exactly one of:

### `resolved`

A single canonical reference matched deterministically. The canonical selection is labelled `derived`, records method `deterministic-physical-reference-resolution-v1`, and retains the raw field's source record IDs.

### `ambiguous`

More than one canonical reference matched the same deterministic basis. All candidate IDs/names are returned and **no canonical reference is selected**.

### `unresolved`

No deterministic catalog match exists. The raw value remains available from the original observation, but LastBarrel does not invent a canonical identity.

Ambiguous and unresolved reference states therefore do not become stronger evidence simply because a normalization attempt occurred.

## Matching precedence

Resolution uses this precedence:

1. exact canonical ID;
2. location UN/LOCODE;
3. normalized canonical name;
4. normalized alias.

Name/alias normalization is deliberately conservative: Unicode compatibility normalization, trim/lowercase, separator normalization and whitespace collapse. There is no fuzzy edit-distance, geographic inference, tanker-route inference or language-model guess in v0.1.

If more than one reference matches at the selected basis, the result is `ambiguous`.

## Evidence preservation

The resolver does not modify `CargoObservation`, `RouteEstimate`, `PortEvent` or `FreightObservation` records.

For evidence-valued fields, the derived resolution retains that exact field's `sourceRecordIds` and `asOf` timestamp. Freight origin/destination are currently free text rather than `EvidenceValue` fields, so their resolution uses the parent provider record IDs and observation/effective timestamp.

This difference is explicit rather than hidden.

## Catalog integrity

The catalog validator requires:

- unique canonical IDs;
- ID namespace consistent with reference kind;
- grade → commodity relationship to resolve inside the same catalog;
- valid enum values;
- non-empty names/aliases;
- duplicate aliases within a single reference to be rejected;
- uppercase ISO alpha-2 country codes where supplied;
- five-character uppercase UN/LOCODE metadata where supplied;
- UN/LOCODE country prefix to agree with the supplied country code.

Aliases are **not** required to be globally unique because real provider vocabularies can collide. A collision becomes an explicit ambiguous resolution instead of a catalog-load failure or silent guess.

## Deliberate omissions

Version 0.1 does not:

- ship a claimed-complete global commodity/grade/port master-data set;
- assert that a provider's grade taxonomy is equivalent to LastBarrel's taxonomy;
- fuzzy-match misspellings;
- infer a port from coordinates;
- infer a grade from vessel, origin, refinery or cargo history;
- infer destination from AIS text;
- merge two provider records because their names look similar;
- provide observed cargo, freight or vessel truth.

Real reference catalogs must be sourced and reviewed as their own evidence-bearing data assets. Provider-specific mappings should be tested against trial records before enabling live physical-intelligence features.

## Provider-trial use

When commercial trial data becomes available, the resolver is intended to make taxonomy quality measurable. Trial review should report at minimum:

- resolved share by field;
- ambiguous share by field;
- unresolved share by field;
- top raw values producing ambiguity/unresolved states;
- provider IDs/source records behind each mapping;
- any manual alias/catalog changes required.

A high unresolved rate is a provider-integration finding, not permission to loosen matching rules.
