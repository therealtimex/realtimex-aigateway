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
