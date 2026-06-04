import test from "node:test";
import assert from "node:assert/strict";

import { createRequestLogger } from "../src/vendor/9router/open-sse/utils/requestLogger.js";

test("request logger emits lifecycle events through the host adapter", async () => {
  const events = [];
  const logger = await createRequestLogger("openai", "gemini-cli", "gemini-2.5-pro", {
    onLifecycleEvent(event) {
      events.push(event);
    },
  });

  logger.logClientRawRequest("/v1/chat/completions", { model: "gemini-2.5-pro" }, {
    authorization: "Bearer super-secret-token",
  });
  logger.logTargetRequest(
    "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
    { authorization: "Bearer super-secret-token" },
    { model: "gemini-2.5-pro" },
  );

  assert.equal(events.length, 2);
  assert.equal(events[0].stage, "client-raw-request");
  assert.equal(events[0].headers.authorization, "Bearer super...");
  assert.equal(events[1].stage, "target-request");
});
