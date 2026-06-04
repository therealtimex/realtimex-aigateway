import test from "node:test";
import assert from "node:assert/strict";

import { handleHostedChatCore } from "../src/vendor/9router/open-sse/handlers/chatCore.js";

test("hosted chatCore returns 400 when model is missing", async () => {
  const result = await handleHostedChatCore({
    body: {
      messages: [{ role: "user", content: "Hi" }],
    },
    adapter: {
      onLifecycleEvent() {},
    },
    fetchFn: fetch,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  const payload = await result.response.json();
  assert.equal(payload.error.type, "invalid_request_error");
});

test("hosted chatCore executes gemini path and returns response object", async () => {
  const result = await handleHostedChatCore({
    body: {
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hi" }],
    },
    execution: {
      provider: "gemini-cli",
      baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "token-1",
          projectId: "project-123",
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "Hi from hosted chatCore" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 3,
            candidatesTokenCount: 4,
            totalTokenCount: 7,
          },
        };
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 200);
  const payload = await result.response.json();
  assert.equal(payload.object, "chat.completion");
  assert.equal(payload.choices[0].message.content, "Hi from hosted chatCore");
});

test("hosted chatCore executes qwen through forwarded openrouter mode", async () => {
  let capturedRequest = null;

  const result = await handleHostedChatCore({
    body: {
      model: "qwen3-coder-plus",
      messages: [{ role: "user", content: "Hi from qwen" }],
    },
    execution: {
      provider: "qwen",
      baseUrl: "https://openrouter.ai/api/v1",
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "token-openrouter",
          providerSpecificData: {
            baseUrl: "https://openrouter.ai/api/v1",
          },
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async (url, init) => {
      capturedRequest = {
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "chatcmpl-qwen",
            object: "chat.completion",
            created: 1,
            model: "qwen3-coder-plus",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Hi from OpenRouter-forwarded Qwen",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 6,
              completion_tokens: 4,
              total_tokens: 10,
            },
          };
        },
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(capturedRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedRequest.headers["X-Title"], "Endpoint Proxy");
  assert.equal(capturedRequest.body.messages[0].role, "system");

  const payload = await result.response.json();
  assert.equal(payload.choices[0].message.content, "Hi from OpenRouter-forwarded Qwen");
});

test("hosted chatCore executes claude path and returns normalized response", async () => {
  let capturedRequest = null;

  const result = await handleHostedChatCore({
    body: {
      model: "claude-sonnet-4",
      messages: [{ role: "user", content: "Hi from claude" }],
    },
    execution: {
      provider: "claude",
      baseUrl: "https://api.anthropic.com/v1/messages",
    },
    adapter: {
      async getProviderCredentials() {
        return {
          apiKey: "claude-key-123",
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async (url, init) => {
      capturedRequest = {
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "msg_123",
            model: "claude-sonnet-4",
            content: [{ type: "text", text: "Hi from Claude" }],
            stop_reason: "end_turn",
            usage: {
              input_tokens: 8,
              output_tokens: 5,
            },
          };
        },
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(capturedRequest.url, "https://api.anthropic.com/v1/messages?beta=true");
  assert.equal(capturedRequest.headers["x-api-key"], "claude-key-123");
  assert.equal(capturedRequest.body.messages[0].role, "user");

  const payload = await result.response.json();
  assert.equal(payload.choices[0].message.content, "Hi from Claude");
  assert.equal(payload.usage.total_tokens, 13);
});

test("hosted chatCore executes codex path and returns normalized response", async () => {
  let capturedRequest = null;

  const result = await handleHostedChatCore({
    body: {
      model: "gpt-5-codex",
      messages: [{ role: "user", content: "Hi from codex" }],
    },
    execution: {
      provider: "codex",
      baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "codex-token-123",
          providerSpecificData: {
            workspaceId: "workspace-9",
          },
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async (url, init) => {
      capturedRequest = {
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "resp_codex_2",
            model: "gpt-5-codex",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "Hi from Codex" }],
              },
            ],
            usage: {
              input_tokens: 4,
              output_tokens: 5,
              total_tokens: 9,
            },
          };
        },
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(capturedRequest.url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(capturedRequest.headers.session_id, "workspace-9");
  assert.equal(capturedRequest.body.input[0].role, "user");

  const payload = await result.response.json();
  assert.equal(payload.choices[0].message.content, "Hi from Codex");
  assert.equal(payload.usage.total_tokens, 9);
});
