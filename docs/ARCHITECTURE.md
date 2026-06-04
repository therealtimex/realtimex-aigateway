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

### 2. Ingress Adapters

Ingress adapters normalize client traffic into the execution core:

- OpenAI-compatible `/v1/*`
- provider-native bootstrap routes
- future ACP-native ingress

Ingress adapters do not own policy.

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

### 5. Trace Pipeline

The trace model captures:

- ingress
- plan
- dispatch
- provider response
- delivery

This follows the 9router lesson that ingress-only observability is insufficient.
