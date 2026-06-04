import test from "node:test";
import assert from "node:assert/strict";

import { executeClaudeChat } from "../src/providers/claude/executeClaudeChat.js";

test("claude executor translates openai request and normalizes response", async () => {
  const traces = [];
  const usages = [];
  let capturedRequest = null;

  const result = await executeClaudeChat({
    model: "claude-sonnet-4",
    body: {
      messages: [{ role: "user", content: "Summarize this" }],
      temperature: 0.3,
    },
    adapter: {
      async getProviderCredentials() {
        return {
          apiKey: "claude-key-abc",
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
            id: "msg_abc",
            model: "claude-sonnet-4",
            content: [{ type: "text", text: "Summary result" }],
            stop_reason: "end_turn",
            usage: {
              input_tokens: 9,
              output_tokens: 4,
            },
          };
        },
      };
    },
  });

  assert.equal(capturedRequest.url, "https://api.anthropic.com/v1/messages?beta=true");
  assert.equal(capturedRequest.headers["x-api-key"], "claude-key-abc");
  assert.equal(capturedRequest.body.model, "claude-sonnet-4");
  assert.equal(capturedRequest.body.temperature, 0.3);
  assert.equal(capturedRequest.body.messages[0].role, "user");
  assert.equal(result.response.choices[0].message.content, "Summary result");
  assert.equal(result.response.usage.total_tokens, 13);
  assert.equal(traces.length, 2);
  assert.equal(usages.length, 1);
});
