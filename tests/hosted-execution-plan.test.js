import test from "node:test";
import assert from "node:assert/strict";

import { buildHostedExecutionPlan } from "../src/gateway/buildHostedExecutionPlan.js";

test("hosted execution plan resolves provider, logger, and translated request", async () => {
  const lifecycle = [];

  const plan = await buildHostedExecutionPlan({
    body: {
      model: "gpt-5-codex",
      messages: [{ role: "user", content: "Hi from plan" }],
    },
    execution: {
      provider: "codex",
    },
    adapter: {
      async onLifecycleEvent(event) {
        lifecycle.push(event);
      },
    },
    request: {
      path: "/v1/chat/completions",
      headers: { "x-test": "1" },
    },
  });

  assert.equal(plan.model, "gpt-5-codex");
  assert.equal(plan.provider, "codex");
  assert.equal(plan.translatedRequest.model, "gpt-5-codex");
  assert.ok(Array.isArray(plan.translatedRequest.input));
  assert.equal(typeof plan.providerEntry.runner, "function");
  assert.ok(lifecycle.length >= 2);
});

test("hosted execution plan rejects missing model", async () => {
  await assert.rejects(
    () =>
      buildHostedExecutionPlan({
        body: { messages: [{ role: "user", content: "no model" }] },
        adapter: {},
      }),
    /Chat request is missing model/,
  );
});
