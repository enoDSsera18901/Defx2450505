# LastBarrel demo deployment

This runbook turns the existing public-data LastBarrel application into a reproducible external demonstration. It does not enable commercial physical-oil providers.

## Release boundary

The demonstrable release uses:

- public EIA Brent and WTI observations;
- public EIA U.S. crude inventory observations;
- public EIA STEO world supply/demand outlook values, explicitly labelled forecast/public estimate;
- user-entered Scenario Lab assumptions, explicitly labelled scenario data.

Dubai, Murban, cargo, vessel, freight-provider and proprietary physical-oil observations remain unavailable unless a separately approved provider clears the repository's evidence and commercial-rights gates.

Do not add commercial provider credentials to a public demo deployment.

## Runtime

The canonical production runtime remains `next start`. The Docker image packages that same runtime and exposes an internal dependency-independent health endpoint at `/api/health`.

Build and start:

```bash
docker compose up --build -d
```

The default Compose mapping is deliberately loopback-only:

```text
127.0.0.1:3000 -> container:3000
```

Verify locally:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/market
```

Expected health identity:

```json
{"status":"ok","app":"LastBarrel"}
```

## EIA credential

For a durable external demonstration, provide `EIA_API_KEY` as a server-side environment variable or secret. The application retains the EIA `DEMO_KEY` fallback for development, but the README contract recommends a real EIA key for production deployments.

The EIA key must never be put into browser code, committed source or a public URL.

## HTTPS exposure

Terminate HTTPS at a reverse proxy/access layer and proxy to:

```text
http://127.0.0.1:3000
```

Keep direct host TCP/3000 blocked externally. The application currently contains no customer account/authentication model; do not use the public demo to collect confidential user information or proprietary scenario inputs.

## Deployment smoke

After deployment, verify from an external browser/device:

1. HTTPS root page loads and shows **Oil market overview**.
2. The EIA feed reaches `LIVE`; if EIA is unavailable, the application shows its fallback/no-data state rather than fabricated values.
3. Brent, WTI and inventory values visibly retain EIA source/period context.
4. Dubai and Murban remain `NO DATA` unless a separately approved integration has actually landed.
5. `/scenarios` loads and visibly states `SCENARIO · NOT LIVE PHYSICAL DATA`.
6. Missing Scenario Lab inputs produce **No total issued**.
7. A complete explicitly synthetic scenario produces an arithmetic landed-cost result with evidence classification.
8. Direct external access to host port 3000 is blocked.
9. `/api/health` returns `status: ok` and `app: LastBarrel` through the intended HTTPS route if that endpoint is exposed by the proxy.

Do not mark the release externally deployed until those observations have been made against the actual URL.

## Current limitations

- Public EIA data is the only live market source in the demonstrable release.
- STEO values are public outlook estimates, not observed physical-flow truth.
- No live commercial freight/cargo/vessel intelligence is presented.
- Scenario Lab assumptions are entered by the analyst and are not market observations.
- Pinned Scenario Lab baselines are intentionally in-memory and disappear on refresh.
- The repository currently installs dependencies with `npm install`; a future reproducibility increment should add/maintain a committed lockfile before stronger production release claims.
