import test from "node:test";
import assert from "node:assert/strict";

import { finalizeHostedSuccess, finalizeHostedError } from "../src/gateway/finalizeHostedExecution.js";

test("hosted finalizer returns successful JSON response", async () => {
  const logged = [];
  const result = finalizeHostedSuccess({
    result: {
      response: {
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      },
    },
    requestLogger: {
      logConvertedResponse(payload) {
        logged.push(payload);
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 200);
  assert.equal(logged.length, 1);
  const payload = await result.response.json();
  assert.equal(payload.object, "chat.completion");
});

test("hosted finalizer preserves invalid_request_error payload", async () => {
  const logged = [];
  const error = new Error("bad request");
  error.payload = {
    error: {
      type: "invalid_request_error",
      message: "Tool choice is invalid",
    },
  };

  const result = finalizeHostedError({
    error,
    translatedRequest: { model: "gpt-5-codex" },
    requestLogger: {
      logError(err, payload) {
        logged.push({ err, payload });
      },
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(logged.length, 1);
  const payload = await result.response.json();
  assert.equal(payload.error.type, "invalid_request_error");
  assert.equal(payload.error.message, "Tool choice is invalid");
});

test("hosted finalizer normalizes generic upstream errors", async () => {
  const error = new Error("upstream failed");
  error.statusCode = 503;

  const result = finalizeHostedError({
    error,
    translatedRequest: {},
    requestLogger: {
      logError() {},
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 503);
  const payload = await result.response.json();
  assert.equal(payload.error.type, "server_error");
  assert.equal(payload.error.message, "upstream failed");
});
