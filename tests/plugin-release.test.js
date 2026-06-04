import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stagePluginRelease } from "../scripts/build-plugin-release.mjs";

test("stagePluginRelease writes an installable plugin layout", () => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-release-"),
  );

  const build = stagePluginRelease({ outDir });

  const manifestPath = path.join(build.stageDir, "realtimex.plugin.json");
  const metadataPath = path.join(build.stageDir, "plugin-metadata.json");
  const gatewayCliPath = path.join(
    build.stageDir,
    "gateway",
    "src",
    "server",
    "cli.js",
  );

  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(metadataPath), true);
  assert.equal(fs.existsSync(path.join(build.stageDir, "index.js")), true);
  assert.equal(fs.existsSync(path.join(build.stageDir, "runtime.js")), true);
  assert.equal(fs.existsSync(gatewayCliPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.id, "com.realtimex.aigateway");
  assert.equal(manifest.entrypoint, "index.js");
  assert.equal(manifest.capabilities.api_routes[0].path, "/dashboard");
});

