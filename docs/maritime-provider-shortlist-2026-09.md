# Maritime / Cargo Data Provider Shortlist — September 2026

## Decision status

**Preferred provider to trial: Kpler Commodities + Kpler Maritime.**

This is a technical shortlist decision, **not a production procurement decision**. LastBarrel should not enable live cargo, ETA, freight or landed-cost features until a trial confirms the required fields and the commercial licence permits the intended storage, derivation and web display.

**Strong alternate: Vortexa.**

**AIS-only fallback / independent position source: Spire Maritime.**

Pricing, redistribution rights, historical-storage rights, derived-data rights, rate limits and SLA terms are not sufficiently public to close the commercial gate. Those remain trial/contract questions.

## Why Kpler is the preferred trial target

LastBarrel needs more than vessel coordinates. The product requires a chain from vessel -> cargo -> grade/volume -> origin/destination -> route/ETA -> freight -> landed economics, with provenance and uncertainty retained.

Kpler's current public material is the closest fit to that whole chain:

- its developer portal exposes API access for commodity flows and maritime/vessel data;
- crude-oil analytics explicitly combines flows, freight, floating storage, commodities-on-water, supply/demand, inventories and arbitrage;
- oil/chemicals coverage includes cargo flows down to grade, vessel/freight analytics and floating/onshore inventory;
- crude intelligence publicly describes ship-to-ship transfers, bills of lading, commercial players, charter detail and delivered-value/arbitrage workflows;
- freight analytics exposes API/Python-SDK integration and laden/ballast fleet metrics;
- the Kpler Python SDK documents programmatic flow retrieval for liquids with origin/destination/product/vessel filters and forecast options;
- Kpler Maritime exposes real-time/historical AIS positions, voyage details, port activity and vessel characteristics.

This means Kpler can potentially supply both the **commodity-intelligence layer** and the **maritime observation layer**, reducing the amount of cargo inference LastBarrel would have to invent itself.

## Candidate comparison

| Candidate | Publicly evidenced strengths | Main gap for LastBarrel | Status |
| --- | --- | --- | --- |
| **Kpler** | Crude cargo/grade flows, freight, inventories, supply-demand, arbitrage/delivered-value context, AIS/maritime APIs, Python SDK | Commercial terms and exact field/licence entitlements require trial/quote | **Trial first** |
| **Vortexa** | API/Python integration; real-time cargo and vessel flows; discharges, co-loads, floating storage, STS transfers; oil/freight analytics | Public developer documentation is less transparent than Kpler's current portal; exact licence/field package requires sales process | **Strong alternate** |
| **Spire Maritime** | Satellite/terrestrial/dynamic AIS observations; explicit vessel position/navigation fields; developer resources | Raw AIS does not by itself provide defensible crude grade, cargo volume, loading/discharge or landed-cost semantics | **Secondary / AIS-only** |
| **Kpler Maritime / MarineTraffic vessel APIs** | Vessel identity, positions, route/voyage and ownership/particulars infrastructure | Vessel data alone is insufficient; use with Kpler commodity data rather than as the cargo truth source | **Supporting layer** |

## Public evidence snapshot

Reviewed 7 September 2026.

### Kpler

- Developer API overview: https://developers.kpler.com/api/overview
- Crude oil market analytics: https://www.kpler.com/market/crude-oil
- Crude oil intelligence: https://www.kpler.com/solutions/fundamental-intelligence/crude-oil
- Oil & chemicals intelligence: https://www.kpler.com/solutions/fundamental-intelligence/oils-chemicals
- Freight analytics: https://www.kpler.com/product/commodities/freight-analytics
- Supply & demand: https://www.kpler.com/product/commodities/supply-demand
- Python SDK flows: https://python-sdk.dev.kpler.com/resources/flows.html
- Maritime 2.0 documentation: https://servicedocs-sm.kpler.com/maritime-2-0/

### Vortexa

- Oil inventory / integrations overview: https://www.vortexa.com/category-energy-inventories
- API explainer (public PDF): https://marketinfo.vortexa.com/rs/837-MZE-578/images/API-Explainer_Brochure_V3.pdf?version=0

The public API explainer states that the API can expose real-time cargo/vessel flows, discharges, co-loads, floating storage and ship-to-ship transfers.

### Spire

- Developer resources: https://spire.com/developers/
- AIS data factsheet: https://data.spire.com/ais-factsheet/

Spire is useful when LastBarrel needs raw/independent AIS observations, but AIS alone must not be transformed into claimed cargo grade or volume without a separate defensible method/source.

## Trial acceptance packet

A Kpler trial should be treated as a bounded integration spike, not an immediate UI build.

### Required data objects

The trial must establish whether the contracted product can provide or support:

1. stable vessel identity (`IMO`, `MMSI`, provider vessel ID);
2. observed position with provider timestamp and collection/source metadata;
3. voyage/load/discharge events with stable provider IDs;
4. cargo product/grade classification;
5. cargo quantity/volume **and whether it is observed, reported or inferred**;
6. load origin and discharge/destination with uncertainty retained;
7. voyage status and laden/ballast state;
8. ETA or route state, including timestamp and confidence/method when available;
9. port/congestion events useful for ETA risk;
10. freight/rate inputs suitable for a separately-auditable landed-cost calculation;
11. historical observations or snapshots sufficient to backtest ETA/cargo-state changes;
12. API pagination, rate-limit and freshness metadata.

### Required legal/commercial answers

Before storing any production data, obtain written answers for:

- may LastBarrel display provider-derived cargo/vessel data to its intended users?
- may LastBarrel persist historical observations?
- may it calculate and persist derived ETA, availability, confidence and landed-cost fields?
- are screenshots/exports/briefs permitted?
- what attribution is required?
- what data must be deleted when a subscription ends?
- what user/seat restrictions apply?
- which datasets/endpoints are included in the quote?
- API rate/concurrency limits and SLA/support terms;
- pricing basis and expected cost at prototype and scaled usage.

A technically excellent provider that fails the required display/derived-data rights is a **no-go**.

## Proposed adapter boundary

The provider adapter should map provider-specific payloads into LastBarrel's existing physical-oil contract and preserve raw provenance metadata. It should not directly return UI view models.

Minimum normalized objects:

- `VesselObservation`
- `CargoObservation`
- `PortEvent`
- `RouteEstimate`
- `FreightObservation`

Every normalized object should carry:

- provider name;
- provider record ID(s);
- observation/effective timestamp;
- retrieval timestamp;
- evidence class (`observed`, `estimated`, `forecast`);
- source confidence/method metadata when supplied;
- licence/retention tag where the contract requires it.

Provider values must remain distinguishable from LastBarrel-derived values.

## Trial test set

Use a small, auditable sample rather than attempting global ingestion immediately:

- 20–50 crude tanker/cargo records;
- several origin regions and crude grades;
- at least one ship-to-ship or ambiguous cargo chain;
- at least one destination change/diversion;
- at least one stale or missing AIS path;
- at least one completed voyage that can be replayed against historical ETA/cargo state.

For each record, preserve the raw provider identity and compare successive observations rather than overwriting history.

## Go / no-go decision

**Go to Kpler trial** if commercial contact/trial access is available.

Do **not** implement the live cargo UI before the spike demonstrates cargo semantics and legal rights. If Kpler fails the mandatory licence or cargo-identification gates, run the same packet against Vortexa. If both fail on commercial fit, Spire remains useful for vessel-state infrastructure but LastBarrel should continue to show cargo/grade/volume as unavailable rather than infer them from AIS alone.
