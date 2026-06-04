import test from "node:test";
import assert from "node:assert/strict";

import { resolveServerConfig } from "../src/server/config.js";

test("server config resolves disabled local proxy by default", () => {
  const config = resolveServerConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4010);
  assert.equal(config.localProxy.enabled, false);
  assert.equal(config.localProxy.status, "disabled");
  assert.equal(config.localProxy.baseUrl, null);
  assert.equal(config.localProxy.port, 20128);
});

test("server config resolves enabled local proxy from env", () => {
  const config = resolveServerConfig({
    AIGATEWAY_HOST: "0.0.0.0",
    AIGATEWAY_PORT: "4500",
    AIGATEWAY_PROXY_ENABLED: "true",
    AIGATEWAY_PROXY_HOST: "127.0.0.1",
    AIGATEWAY_PROXY_PORT: "21000",
  });

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 4500);
  assert.equal(config.localProxy.enabled, true);
  assert.equal(config.localProxy.status, "configured");
  assert.equal(config.localProxy.baseUrl, "http://127.0.0.1:21000");
  assert.equal(config.localProxy.port, 21000);
  assert.equal(config.execution.provider, "gemini-cli");
});
