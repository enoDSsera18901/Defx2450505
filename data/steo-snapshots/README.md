# STEO snapshot archive

This directory is the repository-local archive target for **public EIA Short-Term Energy Outlook** snapshots.

No fabricated or demonstration forecast records belong here.

Run:

```bash
npm run steo:capture
```

The capture command fetches the paired `PAPR_WORLD` supply and `PATC_WORLD` consumption series from the public EIA STEO API and stores two distinct things:

- `revisionBasis` — the complete paired source-response window used only to identify the EIA data revision;
- `forecast` — the forward subset used by LastBarrel and explicitly labelled `forecast`.

The immutable file name is:

```text
<sha256-revision-fingerprint>.json
```

The fingerprint is calculated from the sorted paired `revisionBasis` values, not from retrieval time and not from the moving local forward-period cutoff. This prevents a calendar month rollover by itself from creating a false EIA revision. A new file is created only when the paired source-response window changes; that change can reflect revised values or a changed source horizon and must not automatically be described as a forecast-value revision without comparing the vintages.

Each snapshot validates the canonical EIA source, `PAPR_WORLD`/`PATC_WORLD` series IDs, units, fingerprint/content agreement, forecast-to-revision-basis consistency and filename/fingerprint agreement before it is accepted.

The file preserves the first retrieval timestamp for that revision. Git history can therefore act as a lightweight development archive until a production persistence layer is deliberately introduced.

This is **not** a production database, an EIA publication timestamp, or evidence that every historical STEO vintage has been captured. EIA publishes official monthly STEO archives separately. Backtests must report exactly which archived fingerprints/vintages were available and must distinguish later-vintage public estimates from observed actuals unless the source provides evidence for an observed classification.
