# Provider Executors

This directory will hold provider executor implementations.

Planned first executors:

- `gemini/`
- `qwen/`
- `claude/`
- `codex/`
- `antigravity/`

Each executor should own:

- provider-native request building
- auth bootstrap / refresh handling
- upstream transport
- response normalization
- trace emission hooks
