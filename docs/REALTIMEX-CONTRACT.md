# RealtimeX Host Contract

This repository implements the RealtimeX terminal governance host contract frozen in RealtimeX issue `#790`.

Current contract version:

- `terminal-governance-dashboard`
- version `1.0.0`

Current host-facing route:

- `GET /dashboard`

Top-level dashboard sections:

- `contract`
- `plugin`
- `catalog`
- `analytics`
- `localProxy`

The canonical schema for the current contract lives at:

- [`../schemas/dashboard.schema.json`](../schemas/dashboard.schema.json)

## Compatibility Rules

1. New optional fields may be added in minor versions.
2. Required field removals or type changes require a new major version.
3. RealtimeX host-side compatibility tests should validate real plugin payloads.
4. `Catalog` may have a host-side fallback in RealtimeX when plugin routes are unavailable.
5. `Analytics` and `Local Proxy` are expected to remain plugin-backed.
