import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { stagePluginRelease } from "../scripts/build-plugin-release.mjs";

function writePluginSdkStub(stageDir) {
  const sdkDir = path.join(stageDir, "node_modules", "@realtimex", "plugin-sdk");
  fs.mkdirSync(sdkDir, { recursive: true });
  fs.writeFileSync(
    path.join(sdkDir, "index.js"),
    "module.exports = { definePlugin(definition) { return definition; } };\n",
    "utf8",
  );
}

test("staged plugin entrypoint registers governed prefix routes with the host", async () => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-entrypoint-"),
  );
  const build = stagePluginRelease({ outDir });
  writePluginSdkStub(build.stageDir);

  const require = createRequire(import.meta.url);
  const plugin = require(path.join(build.stageDir, "index.js"));

  const routes = [];
  const api = {
    registerRoute(method, routePath, handler, options = {}) {
      routes.push({ method, routePath, handler, options });
    },
  };

  await plugin.register(api);

  assert.ok(
    routes.some(
      (route) =>
        route.method === "GET" &&
        route.routePath === "/_rtx/governed" &&
        route.options.match === "prefix" &&
        typeof route.handler === "function",
    ),
  );
  assert.ok(
    routes.some(
      (route) =>
        route.method === "POST" &&
        route.routePath === "/_rtx/governed" &&
        route.options.match === "prefix" &&
        typeof route.handler === "function",
    ),
  );
});
