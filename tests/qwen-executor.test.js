import test from "node:test";
import assert from "node:assert/strict";

import { executeQwenChat } from "../src/providers/qwen/executeQwenChat.js";

test("qwen executor preserves forwarded openrouter base url and emits openrouter usage", async () => {
  const traces = [];
  const usages = [];
  let capturedRequest = null;

  const result = await executeQwenChat({
    model: "qwen3-coder-plus",
    body: {
      messages: [{ role: "user", content: "List files" }],
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "token-123",
          providerSpecificData: {
            baseUrl: "https://openrouter.ai/api/v1",
          },
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace(event) {
        traces.push(event);
      },
      async emitUsage(event) {
        usages.push(event);
      },
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
            id: "chatcmpl-openrouter",
            object: "chat.completion",
            created: 1,
            model: "qwen3-coder-plus",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Forwarded response",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          };
        },
      };
    },
  });

  assert.equal(capturedRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedRequest.headers.Authorization, "Bearer token-123");
  assert.equal(capturedRequest.headers["X-Title"], "Endpoint Proxy");
  assert.equal(capturedRequest.body.messages[0].role, "system");
  assert.equal(result.upstream.provider, "openrouter");
  assert.equal(result.response.choices[0].message.content, "Forwarded response");
  assert.equal(traces.length, 2);
  assert.equal(usages.length, 1);
  assert.equal(usages[0].provider, "openrouter");
});
