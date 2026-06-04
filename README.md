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

## Planned Provider Families

First-class target providers:

- Gemini / Google-native
- Qwen / OpenRouter-forwarded
- Claude
- Codex / OpenAI
- Antigravity

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

Provider execution, proxy lifecycle ownership, and real trace ingestion are still follow-up work.
