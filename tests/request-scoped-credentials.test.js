import test from "node:test";
import assert from "node:assert/strict";

import {
  createRequestScopedCredentialBridge,
  resolveCredentialsFromRequest,
} from "../src/adapters/requestScopedCredentials.js";

test("resolveCredentialsFromRequest maps hosted qwen Authorization to apiKey credentials", () => {
  const credentials = resolveCredentialsFromRequest({
    provider: "qwen",
    headers: {
      authorization: "Bearer sk-openrouter",
    },
  });

  assert.deepEqual(credentials, {
    apiKey: "sk-openrouter",
  });
});

test("request-scoped credential bridge resolves credentials from the current request context", async () => {
  const requestContexts = new Map([
    [
      "req-123",
      {
        headers: {
          authorization: "Bearer qwen-token-123",
        },
        body: {
          model: "qwen3-coder-plus",
        },
      },
    ],
  ]);

  const bridge = createRequestScopedCredentialBridge({
    getRequestContext(connectionId) {
      return requestContexts.get(connectionId) ?? null;
    },
  });

  const credentials = await bridge.getProviderCredentials({
    provider: "qwen",
    connectionId: "req-123",
  });

  assert.deepEqual(credentials, {
    apiKey: "qwen-token-123",
  });
});

test("request-scoped credential bridge returns null when no request context is present", async () => {
  const bridge = createRequestScopedCredentialBridge({
    getRequestContext() {
      return null;
    },
  });

  assert.equal(
    await bridge.getProviderCredentials({
      provider: "qwen",
      connectionId: "missing",
    }),
    null,
  );
});
