import test from "node:test";
import assert from "node:assert/strict";

import { openAIResponseToAntigravityResult } from "../src/providers/antigravity/openaiToAntigravityResult.js";

test("openai response is converted into antigravity response shape", () => {
  const result = openAIResponseToAntigravityResult({
    id: "chatcmpl-123",
    model: "claude-sonnet-4",
    choices: [
      {
        message: {
          role: "assistant",
          content: "Hi from gateway",
          tool_calls: [
            {
              type: "function",
              function: {
                name: "list_files",
                arguments: "{\"path\":\"/tmp\"}",
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: {
      prompt_tokens: 8,
      completion_tokens: 5,
      total_tokens: 13,
    },
  });

  assert.equal(result.response.modelVersion, "claude-sonnet-4");
  assert.equal(result.response.responseId, "chatcmpl-123");
  assert.equal(result.response.candidates[0].content.parts[0].text, "Hi from gateway");
  assert.equal(result.response.candidates[0].content.parts[1].functionCall.name, "list_files");
  assert.deepEqual(result.response.candidates[0].content.parts[1].functionCall.args, {
    path: "/tmp",
  });
  assert.equal(result.response.usageMetadata.totalTokenCount, 13);
});
