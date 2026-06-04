# 9Router Adaptation Notes

This repo adapts 9router ideas. It does not import all 9router features unchanged.

Reference checkout:

- `/Users/realtimex/github/9router`

## Keep

- execution-core-first routing model
- provider executor abstraction
- account fallback primitives
- ingress and upstream dispatch observability
- provider-native auth/bootstrap handling

## Skip Initially

- broad standalone dashboard features
- cloud sync features
- generic combo-model UX
- features that only matter to 9router as a standalone end-user app
- MITM/interceptor paths unless a concrete RealtimeX agent requires them

## RealtimeX-Specific Differences

- RealtimeX host owns dashboard rendering
- RealtimeX host owns workspace and thread identity
- this repo exposes a RealtimeX-specific contract instead of a generic dashboard API
- catalog, analytics, and local proxy state must align with the host contract frozen in `#790`

## First Adaptation Targets

1. Gemini native bootstrap and execution
2. Qwen with forwarded-provider behavior
3. Claude native execution
4. Codex/OpenAI execution
5. Antigravity governance strategy
