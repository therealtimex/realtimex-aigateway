import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDashboardContractDescriptor,
} from "../src/contracts/dashboardContract.js";
import { createTerminalGovernancePluginRuntime } from "../src/plugin/runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("dashboard schema file exists and contract descriptor matches expected route", () => {
  const schemaPath = path.resolve(__dirname, "../schemas/dashboard.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const descriptor = buildDashboardContractDescriptor();
  const runtime = createTerminalGovernancePluginRuntime();
  const payload = runtime.getDashboard();

  assert.equal(schema.properties.contract.properties.route.const, "/dashboard");
  assert.equal(descriptor.route, "/dashboard");
  assert.equal(descriptor.id, "terminal-governance-dashboard");
  assert.equal(payload.contract.route, descriptor.route);
  assert.equal(payload.contract.id, descriptor.id);
});
