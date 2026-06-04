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
