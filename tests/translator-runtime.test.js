import test from "node:test";
import assert from "node:assert/strict";

import {
  detectRequestFormat,
  FORMATS,
  initState,
  needsTranslation,
  translateRequest,
} from "../src/translator/index.js";

test("detectRequestFormat resolves openai by chat endpoint and gemini by body shape", () => {
  assert.equal(
    detectRequestFormat("/v1/chat/completions", {
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hi" }],
    }),
    FORMATS.OPENAI,
  );

  assert.equal(
    detectRequestFormat("/ignored", {
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    }),
    FORMATS.GEMINI,
  );
});

test("translateRequest normalizes tool ids and delegates openai to gemini-cli", () => {
  const translated = translateRequest({
    sourceFormat: FORMATS.OPENAI,
    targetFormat: FORMATS.GEMINI_CLI,
    model: "gemini-2.5-pro",
    body: {
      messages: [
        { role: "user", content: "List files" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "tool call 1",
              function: {
                name: "list_files",
                arguments: { path: "/tmp" },
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(translated.contents[1].parts[0].functionCall.id, "toolcall1");
  assert.deepEqual(translated.contents[1].parts[0].functionCall.args, { path: "/tmp" });
  assert.equal(translated.contents.length, 2);
});

test("needsTranslation and initState expose chat-core seam basics", () => {
  assert.equal(needsTranslation(FORMATS.OPENAI, FORMATS.GEMINI_CLI), true);
  assert.equal(needsTranslation(FORMATS.OPENAI, FORMATS.OPENAI), false);

  const state = initState(FORMATS.OPENAI);
  assert.equal(state.sourceFormat, FORMATS.OPENAI);
  assert.equal(state.finishReason, null);
  assert.equal(state.contentBlockIndex, -1);
});
