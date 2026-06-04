import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateUsage,
  extractUsage,
  filterUsageForFormat,
  hasValidUsage,
  normalizeUsage,
} from "../src/vendor/9router/open-sse/utils/usageTracking.js";
import { FORMATS } from "../src/translator/index.js";

test("usage tracking extracts gemini usage and filters by format", () => {
  const usage = extractUsage({
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 8,
      totalTokenCount: 20,
      cachedContentTokenCount: 3,
    },
  });

  assert.deepEqual(usage, {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
    cached_tokens: 3,
  });
  assert.equal(hasValidUsage(usage), true);
  assert.deepEqual(filterUsageForFormat(usage, FORMATS.OPENAI), {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
    cached_tokens: 3,
  });
});

test("usage tracking normalizes numbers and estimates fallback usage", () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: "10", completion_tokens: "5" }), {
    prompt_tokens: 10,
    completion_tokens: 5,
  });

  const estimated = estimateUsage(
    {
      messages: [{ role: "user", content: "Hello world" }],
    },
    120,
  );
  assert.equal(typeof estimated.prompt_tokens, "number");
  assert.equal(typeof estimated.total_tokens, "number");
  assert.equal(estimated.estimated, true);
});
