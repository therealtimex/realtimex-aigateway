import test from "node:test";
import assert from "node:assert/strict";

import {
  checkFallbackError,
  filterAvailableAccounts,
  getQuotaCooldown,
} from "../src/vendor/9router/open-sse/services/accountFallback.js";

test("vendored account fallback computes exponential quota cooldown", () => {
  assert.equal(getQuotaCooldown(1), 2000);
  assert.equal(getQuotaCooldown(2), 4000);
});

test("vendored account fallback marks rate-limit errors as fallback eligible", () => {
  const result = checkFallbackError(429, "Rate limit exceeded", 1);

  assert.equal(result.shouldFallback, true);
  assert.equal(result.cooldownMs > 0, true);
  assert.equal(result.newBackoffLevel, 2);
});

test("vendored account fallback filters unavailable accounts", () => {
  const accounts = [
    { id: "a", rateLimitedUntil: null },
    { id: "b", rateLimitedUntil: new Date(Date.now() + 60_000).toISOString() },
  ];

  const available = filterAvailableAccounts(accounts);
  assert.deepEqual(available.map((account) => account.id), ["a"]);
});
