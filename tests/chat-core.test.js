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
