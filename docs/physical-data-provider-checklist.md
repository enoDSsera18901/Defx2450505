# Physical Data Provider Selection Checklist

Use this before wiring tanker/cargo/ETA features. The objective is not to find the provider with the prettiest demo; it is to establish whether LastBarrel can legally and technically support the physical-oil claims it wants to make.

## Mandatory capability questions

### Vessel identity and AIS

- Historical and near-real-time AIS coverage?
- Satellite + terrestrial coverage or one only?
- IMO/MMSI/name/class/DWT fields available?
- Position timestamps and data latency exposed?
- Draught/history available?
- Destination text and voyage metadata available?
- Historical replay/backfill window?

### Cargo intelligence

- Does the provider supply cargo records, or only vessels?
- Commodity/grade classification available?
- Load/discharge ports and dates available?
- Volume supplied or inferred?
- If inferred, is methodology/confidence exposed?
- Can cargo records be linked stably across voyage changes?
- Does the licence permit storing derived cargo history?

### Route / ETA

- Provider ETA available?
- Confidence/uncertainty exposed?
- Route geometry or only destination/ETA?
- Canal, congestion and port-waiting state available?
- Historical ETA values available for backtesting?

### Commercial and legal

- API pricing basis: calls, vessels, data points, users or enterprise licence?
- Trial/sandbox available without production commitment?
- Redistribution/display rights for a web app?
- Historical storage permitted?
- Derived-data rights?
- Attribution requirements?
- Rate limits and concurrency?
- SLA/support terms?

## Evaluation scorecard

Score 0–5 only after evidence is available.

| Dimension | Weight | Gate |
| --- | ---: | --- |
| AIS freshness / global coverage | 20% | Mandatory |
| Cargo identification quality | 20% | Mandatory for cargo feature |
| Historical depth / replay | 10% | Needed for backtesting |
| Route / ETA quality | 10% | Needed for ETA feature |
| Provenance / confidence metadata | 10% | Mandatory |
| Licence and derived-data rights | 15% | Mandatory |
| API reliability / limits | 5% | Mandatory |
| Cost / scaling fit | 10% | Commercial gate |

A provider that fails a mandatory gate should not be selected because its weighted score is otherwise high.

## Integration spike acceptance

Before committing to a provider, a bounded spike should prove:

1. fetch a small set of tanker observations;
2. preserve provider IDs and observation timestamps;
3. distinguish vessel data from cargo data;
4. render stale observations honestly;
5. demonstrate one missing/ambiguous destination path;
6. retain licensing/attribution metadata;
7. avoid storing or exposing data beyond the licence;
8. pass typecheck/build and provider-adapter tests.

## Explicit non-decision

This checklist does **not** select or endorse a commercial AIS provider. Selection requires current capability, licence and pricing evidence. Until that exists, cargo/vessel/ETA features should remain disabled or clearly demonstration-only.
