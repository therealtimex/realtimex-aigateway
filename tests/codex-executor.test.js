import test from "node:test";
import assert from "node:assert/strict";

import { executeCodexChat } from "../src/providers/codex/executeCodexChat.js";

test("codex executor translates chat request to responses shape and normalizes response", async () => {
  const traces = [];
  const usages = [];
  let capturedRequest = null;

  const result = await executeCodexChat({
    model: "gpt-5-codex",
    body: {
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Refactor this file" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
      tool_choice: "required",
      reasoning_effort: "medium",
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "codex-token-123",
          providerSpecificData: {
            workspaceId: "workspace-1",
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
            id: "resp_codex_1",
            model: "gpt-5-codex",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "I can help with that." }],
              },
            ],
            usage: {
              input_tokens: 12,
              output_tokens: 8,
              total_tokens: 20,
            },
          };
        },
      };
    },
  });

  assert.equal(capturedRequest.url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(capturedRequest.headers.Authorization, "Bearer codex-token-123");
  assert.equal(capturedRequest.headers.session_id, "workspace-1");
  assert.equal(capturedRequest.body.model, "gpt-5-codex");
  assert.equal(capturedRequest.body.store, false);
  assert.equal(capturedRequest.body.stream, false);
  assert.equal(capturedRequest.body.input[0].role, "developer");
  assert.equal(capturedRequest.body.tool_choice, "required");
  assert.deepEqual(capturedRequest.body.include, ["reasoning.encrypted_content"]);
  assert.equal(result.response.choices[0].message.content, "I can help with that.");
  assert.equal(result.response.usage.total_tokens, 20);
  assert.equal(traces.length, 2);
  assert.equal(usages.length, 1);
});
