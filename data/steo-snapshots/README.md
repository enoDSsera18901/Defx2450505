# STEO snapshot archive

This directory is the repository-local archive target for **public EIA Short-Term Energy Outlook** forecast snapshots.

No fabricated or demonstration forecast records belong here.

Run:

```bash
npm run steo:capture
```

The capture command fetches the current paired `PAPR_WORLD` supply and `PATC_WORLD` consumption forecast, validates its deterministic revision fingerprint, and writes an immutable file named:

```text
<sha256-revision-fingerprint>.json
```

Re-fetching an unchanged EIA forecast does not create another file. A new file is created only when the paired forecast values change.

The file preserves the first retrieval timestamp for that revision. Git history can therefore act as a lightweight development archive until a production persistence layer is deliberately introduced.

This is **not** a production database, an EIA publication timestamp, or evidence that every historical STEO vintage has been captured. Backtests must report exactly which archived fingerprints were available to them.
