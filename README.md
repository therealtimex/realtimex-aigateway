# realtimex-aigateway

`realtimex-aigateway` is the public traffic-governance gateway for RealtimeX.

It adapts selected 9router architecture and provider-execution concepts behind a RealtimeX-specific host contract, instead of copying 9router wholesale.

## Purpose

RealtimeX keeps:

- dashboard UI
- workspace and thread identity
- terminal and ACP session orchestration
- host-side plugin lifecycle

`realtimex-aigateway` owns:

- local ingress handling
- provider-native request translation
- upstream execution
- fallback and key-pool policy
- auth bootstrap and token refresh
- ingress, dispatch, response, and delivery traces

## Scope

This repository is intended to power:

- Terminal agent traffic governance
- ACP agent traffic governance
- local proxy ingress for compatible clients
- execution-core-first provider control

It is not intended to be a generic fork of 9router.

## Initial Design

Core runtime layers:

1. ingress adapters
2. execution core
3. provider executors
4. trace and usage pipeline
5. RealtimeX host plugin surface

Primary contract surface:

- dashboard route: `GET /dashboard`
- production schema: [`schemas/dashboard.schema.json`](./schemas/dashboard.schema.json)

## Installation Artifact

GitHub releases publish an installable RealTimeX plugin zip, not just source snapshots.

Each release artifact contains:

- `realtimex.plugin.json`
- a CommonJS plugin entrypoint for the RealTimeX host loader
- an embedded `gateway/` runtime that starts the ESM AI Gateway server inside the plugin directory

Install flow inside RealTimeX:

1. Download the release zip from GitHub Releases.
2. In RealTimeX, install it through the plugin upload flow (`POST /plugins` or the equivalent UI).
3. RealTimeX extracts the archive, reads `realtimex.plugin.json`, and loads `index.js` through the plugin manager.
4. On activation, the plugin starts the embedded AI Gateway runtime and serves the terminal-governance dashboard contract through the host plugin route.

Build the same artifact locally with:

```bash
npm run build:plugin
```

Artifacts are written to `dist/`:

- `realtimex-aigateway-plugin-<version>.zip`
- `realtimex-aigateway-plugin-<version>.sha256`

## GitHub Release CI

GitHub Actions builds release artifacts in `.github/workflows/release.yml`.

- `workflow_dispatch`
  - runs tests
  - builds the plugin zip
  - uploads the zip and checksum as workflow artifacts
- `push` tag `v*`
  - verifies the tag matches `package.json` version
  - runs tests
  - builds the plugin zip
  - publishes a GitHub Release with the zip and checksum attached

## Planned Provider Families

First-class target providers:

- Gemini / Google-native
- Qwen / OpenRouter-forwarded
- Claude
- Codex / OpenAI
- Antigravity

Current forwarding boundary:

- governed sessions use launch-context-provided proxy base URLs under `/_rtx/governed/...`, and the gateway routes governed traffic from that prefix at request time
- only Qwen currently advertises and honors forwarded-provider routing (`openrouter`)
- Gemini, Claude, and Codex currently govern by canonical agent only and do not advertise forwarded-provider support

## Repository Layout

- `docs/`
  Gateway architecture, host contract, and adaptation notes.
- `schemas/`
  Versioned RealtimeX-facing schemas.
- `src/contracts/`
  Host contract constants and validation helpers.
- `src/gateway/`
  Core gateway interfaces and orchestration seams.
- `src/providers/`
  Provider executor stubs and adaptation notes.
- `src/traces/`
  Trace event model and normalization seams.
- `tests/`
  Contract and compatibility test placeholders.

## Status

The repository now includes the first real implementation slice:

- a contract-backed terminal governance dashboard runtime
- a default supported-agent catalog
- a request handler for `GET /dashboard`
- an HTTP server entrypoint with `/dashboard` and `/health`
- config-driven plugin lifecycle and local-proxy status reporting
- a first hosted Gemini execution seam behind RealtimeX-facing adapters
- vendored `9router open-sse` chat/core layers beginning with executor, config, and fallback primitives

Provider execution, proxy lifecycle ownership, and real trace ingestion are still follow-up work.
