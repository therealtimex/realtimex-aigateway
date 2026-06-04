import test from "node:test";
import assert from "node:assert/strict";

import { resolveHostedProvider, listHostedProviders } from "../src/providers/shared/providerRegistry.js";
import { FORMATS } from "../src/translator/index.js";

test("provider registry resolves supported hosted providers", () => {
  assert.deepEqual(
    listHostedProviders().sort(),
    ["antigravity", "claude", "codex", "gemini", "gemini-cli", "qwen"].sort(),
  );
  assert.equal(resolveHostedProvider("antigravity").targetFormat, FORMATS.ANTIGRAVITY);
  assert.equal(resolveHostedProvider("claude").targetFormat, FORMATS.CLAUDE);
  assert.equal(resolveHostedProvider("codex").targetFormat, FORMATS.OPENAI_RESPONSES);
  assert.equal(resolveHostedProvider("qwen").targetFormat, FORMATS.OPENAI);
});

test("provider registry rejects unsupported provider", () => {
  assert.throws(() => resolveHostedProvider("unsupported"), /Unsupported execution provider/);
});
