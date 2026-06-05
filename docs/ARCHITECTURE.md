# Architecture

`realtimex-aigateway` is an execution-core-first AI gateway for RealtimeX.

## Design Principles

1. RealtimeX host contract first
2. Execution core as the only governance boundary
3. Ingress adapters stay thin
4. Provider-native auth/bootstrap is first-class
5. Traces must cover ingress and upstream dispatch, not only local proxy ingress

## High-Level Model

```text
RealtimeX Host
  -> plugin integration surface
  -> ingress adapter
  -> execution core
  -> provider executor
  -> upstream provider
```

## Runtime Layers

### 1. Host Integration

The host passes:

- workspace
- thread
- session
- agent
- auth mode
- forwarded provider context

The gateway returns:

- dashboard payload
- traces
- usage
- fallback decisions
- health and status

For governed terminal sessions, the plugin launch context is the runtime source of truth:

- the launch context hands compatible CLIs a governed local-proxy base URL under `/_rtx/governed/<agent>`
- forwarded-provider cases extend that path with `/forward/<provider>`
- the gateway strips that prefix on ingress and resolves provider routing from it for both hosted and native request paths
- for hosted execution in the shipped embedded runtime, credentials are resolved request-scoped from the inbound governed proxy request when no external host adapter is present
- unprefixed traffic keeps using the global plugin execution config as the fallback/default path

### 2. Ingress Adapters

Ingress adapters normalize client traffic into the execution core:

- OpenAI-compatible `/v1/*`
- provider-native bootstrap routes
- future ACP-native ingress

Ingress adapters do not own policy.

Current governed-routing support:

- Qwen can advertise `forwardableProviders: ["openrouter"]` and route hosted chat traffic accordingly
- Gemini, Claude, and Codex govern by canonical agent, but do not advertise forwarded-provider support
- native passthrough remains canonical-agent-specific for Codex, Claude, and Gemini CLI

### 3. Execution Core

The execution core owns:

- request planning
- provider resolution
- account selection
- fallback and retry
- key-pool policy
- usage and trace emission

### 4. Provider Executors

Executors are responsible for:

- provider-native request building
- auth refresh
- upstream transport
- response normalization

Qwen overlay note:

- Qwen launch overlays currently source `~/.qwen/settings.json` from the local desktop user home directory
- this plugin treats that overlay source as a single-user desktop assumption, not a multi-user request-scoped contract

### 5. Trace Pipeline

The trace model captures:

- ingress
- plan
- dispatch
- provider response
- delivery

This follows the 9router lesson that ingress-only observability is insufficient.
