import test from "node:test";
import assert from "node:assert/strict";

import { createHostAdapter } from "../src/adapters/createHostAdapter.js";
import { executeGeminiChat } from "../src/providers/gemini/executeGeminiChat.js";
import { openAIToGeminiCLIRequest } from "../src/providers/gemini/openaiToGeminiRequest.js";

test("openai request is translated to gemini-cli request shape", () => {
  const request = openAIToGeminiCLIRequest("gemini-2.5-pro", {
    messages: [
      { role: "system", content: "Be terse." },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.2,
    max_tokens: 128,
  });

  assert.equal(request.model, "gemini-2.5-pro");
  assert.equal(request.systemInstruction.parts[0].text, "Be terse.");
  assert.equal(request.contents[0].role, "user");
  assert.equal(request.contents[0].parts[0].text, "Hello");
  assert.equal(request.generationConfig.temperature, 0.2);
  assert.equal(request.generationConfig.maxOutputTokens, 128);
  assert.equal(request.safetySettings[0].category, "HARM_CATEGORY_HATE_SPEECH");
});

test("openai request translation preserves tools, tool results, and multimodal parts", () => {
  const request = openAIToGeminiCLIRequest("gemini-2.5-pro", {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect this screenshot" },
          { type: "image_url", image_url: { url: "https://example.com/screenshot.png" } },
        ],
      },
      {
        role: "assistant",
        content: "Calling tool",
        tool_calls: [
          {
            id: "tool-call-1",
            type: "function",
            function: {
              name: "list_files",
              arguments: "{\"path\":\"/tmp\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "tool-call-1",
        content: "{\"entries\":[\"a.txt\"]}",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "list_files",
          description: "List files in a directory",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                minLength: 1,
              },
            },
            required: ["path"],
          },
        },
      },
    ],
    reasoning_effort: "medium",
  });

  assert.equal(request.contents[0].parts[1].fileData.fileUri, "https://example.com/screenshot.png");
  assert.equal(request.contents[1].parts[1].functionCall.name, "list_files");
  assert.deepEqual(request.contents[2].parts[0].functionResponse.response.result, {
    entries: ["a.txt"],
  });
  assert.equal(request.tools[0].functionDeclarations[0].parameters.properties.path.type, "string");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      request.tools[0].functionDeclarations[0].parameters.properties.path,
      "minLength",
    ),
    false,
  );
  assert.equal(request.generationConfig.thinkingConfig.thinkingBudget, 8192);
});

test("gemini executor uses adapter credentials, emits traces, and returns openai response shape", async () => {
  const traces = [];
  const usages = [];
  let capturedRequest = null;

  const adapter = createHostAdapter({
    async getProviderCredentials() {
      return {
        accessToken: "token-1",
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
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: 8,
            totalTokenCount: 20,
          },
        };
      },
    };
  };

  const result = await executeGeminiChat({
    model: "gemini-2.5-pro",
    body: {
      messages: [{ role: "user", content: "Hi" }],
    },
    adapter,
    fetchFn,
  });

  assert.equal(
    capturedRequest.url,
    "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
  );
  assert.equal(capturedRequest.headers.Authorization, "Bearer token-1");
  assert.equal(capturedRequest.body.project, "project-123");
  assert.equal(capturedRequest.body.request.contents[0].parts[0].text, "Hi");
  assert.equal(result.response.object, "chat.completion");
  assert.equal(result.response.choices[0].message.content, "Hello from Gemini");
  assert.equal(result.response.usage.total_tokens, 20);
  assert.equal(traces.length, 2);
  assert.equal(traces[0].stage, "dispatch");
  assert.equal(traces[1].stage, "provider-response");
  assert.equal(usages.length, 1);
  assert.equal(usages[0].provider, "gemini-cli");
});
