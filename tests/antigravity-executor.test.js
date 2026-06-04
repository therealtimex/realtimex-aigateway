import test from "node:test";
import assert from "node:assert/strict";

import { createHostAdapter } from "../src/adapters/createHostAdapter.js";
import { executeAntigravityChat } from "../src/providers/antigravity/executeAntigravityChat.js";

test("antigravity executor translates openai request and normalizes response", async () => {
  const traces = [];
  const usages = [];
  let capturedRequest = null;

  const adapter = createHostAdapter({
    async getProviderCredentials() {
      return {
        accessToken: "agy-token-1",
        projectId: "project-123",
      };
    },
    async emitTrace(event) {
      traces.push(event);
    },
    async emitUsage(event) {
      usages.push(event);
    },
  });

  const fetchFn = async (url, init) => {
    capturedRequest = {
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    };

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          response: {
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Hello from Antigravity" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 6,
              totalTokenCount: 16,
            },
            modelVersion: "gemini-native",
            responseId: "resp-123",
          },
        };
      },
    };
  };

  const result = await executeAntigravityChat({
    model: "gemini-native",
    body: {
      messages: [{ role: "user", content: "Hi" }],
    },
    adapter,
    fetchFn,
  });

  assert.equal(
    capturedRequest.url,
    "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
  );
  assert.equal(capturedRequest.headers.Authorization, "Bearer agy-token-1");
  assert.equal(capturedRequest.body.project, "project-123");
  assert.equal(capturedRequest.body.userAgent, "antigravity");
  assert.equal(capturedRequest.body.request.contents[0].parts[0].text, "Hi");
  assert.equal(result.response.object, "chat.completion");
  assert.equal(result.response.choices[0].message.content, "Hello from Antigravity");
  assert.equal(result.response.usage.total_tokens, 16);
  assert.equal(traces.length, 2);
  assert.equal(traces[0].stage, "dispatch");
  assert.equal(traces[1].stage, "provider-response");
  assert.equal(usages.length, 1);
  assert.equal(usages[0].provider, "antigravity");
});
