import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { stagePluginRelease } from "../scripts/build-plugin-release.mjs";

function loadStagedPluginRuntime() {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-governed-proxy-"),
  );
  const build = stagePluginRelease({ outDir });
  const require = createRequire(import.meta.url);
  return require(path.join(build.stageDir, "runtime.js"));
}

test("governed proxy target url preserves subPath and query parameters", () => {
  const { GOVERNED_ROUTE_PREFIX, buildGovernedProxyTargetUrl } =
    loadStagedPluginRuntime();
  const targetUrl = buildGovernedProxyTargetUrl({
    gatewayUrl: "http://127.0.0.1:4010",
    request: {
      subPath: "/codex/responses",
      query: {
        stream: "true",
        limit: 2,
      },
    },
  });

  assert.equal(
    targetUrl,
    `http://127.0.0.1:4010${GOVERNED_ROUTE_PREFIX}/codex/responses?stream=true&limit=2`,
  );
});

test("governed proxy request init strips host headers and serializes json bodies", () => {
  const { buildGovernedProxyRequestInit } = loadStagedPluginRuntime();
  const init = buildGovernedProxyRequestInit({
    method: "POST",
    headers: {
      host: "127.0.0.1:20128",
      "content-length": "999",
      authorization: "Bearer test-token",
    },
    body: {
      model: "gpt-5.4-mini",
      input: "hi",
    },
  });

  assert.equal(init.method, "POST");
  assert.equal(init.headers.host, undefined);
  assert.equal(init.headers["content-length"], undefined);
  assert.equal(init.headers.authorization, "Bearer test-token");
  assert.equal(init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    model: "gpt-5.4-mini",
    input: "hi",
  });
});

test("governed proxy returns plugin-owned 503 when embedded gateway cold-start fails", async () => {
  const { proxyGovernedRequest } = loadStagedPluginRuntime();
  const warnings = [];
  const responseState = {
    statusCode: null,
    body: null,
  };
  const response = {
    status(code) {
      responseState.statusCode = code;
      return this;
    },
    json(payload) {
      responseState.body = payload;
      return payload;
    },
  };

  await proxyGovernedRequest({
    api: {
      getConfig() {
        return {
          AUTO_START_GATEWAY: true,
          AIGATEWAY_HOST: "127.0.0.1",
          AIGATEWAY_PORT: "4010",
          AIGATEWAY_PROXY_ENABLED: true,
          AIGATEWAY_PROXY_HOST: "127.0.0.1",
          AIGATEWAY_PROXY_PORT: "20128",
          AIGATEWAY_EXECUTION_PROVIDER: "gemini-cli",
          AIGATEWAY_EXECUTION_BASE_URL:
            "https://cloudcode-pa.googleapis.com/v1internal",
        };
      },
      log: {
        warn(message, payload) {
          warnings.push({ message, payload });
        },
      },
    },
    request: {
      method: "POST",
      path: "/_rtx/governed/codex/responses",
      subPath: "/codex/responses",
      headers: {},
      body: { input: "hi" },
    },
    response,
    async ensureGatewayProcessImpl() {
      throw new Error("boom on startup");
    },
  });

  assert.equal(responseState.statusCode, 503);
  assert.deepEqual(responseState.body, {
    error: "gateway-unavailable",
    message: "boom on startup",
  });
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0].message,
    "Failed to start embedded gateway for governed request",
  );
});
