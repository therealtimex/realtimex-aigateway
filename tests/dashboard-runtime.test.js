import test from "node:test";
import assert from "node:assert/strict";

import { DASHBOARD_ROUTE } from "../src/contracts/dashboardContract.js";
import { createTerminalGovernancePluginRuntime } from "../src/plugin/runtime.js";

test("dashboard runtime returns a contract-backed payload with supported agents", () => {
  const runtime = createTerminalGovernancePluginRuntime({
    localProxy: {
      enabled: true,
      status: "configured",
      baseUrl: "http://127.0.0.1:20128",
      port: 20128,
      source: "plugin",
      notes: ["Configured in plugin state."],
    },
  });
  const payload = runtime.getDashboard();

  assert.equal(payload.contract.route, DASHBOARD_ROUTE);
  assert.equal(payload.plugin.slug, "realtimex-aigateway");
  assert.equal(payload.catalog.summary.supported, 5);
  assert.equal(payload.catalog.summary.installed, 0);
  assert.equal(payload.catalog.summary.uninstalled, 5);
  assert.equal(payload.catalog.summary.docsLinked, 5);
  assert.equal(payload.catalog.summary.forwardable, 4);
  assert.equal(payload.analytics.source, "plugin");
  assert.equal(payload.localProxy.source, "plugin");
  assert.equal(payload.localProxy.enabled, true);
  assert.equal(payload.localProxy.status, "configured");
  assert.equal(payload.localProxy.baseUrl, "http://127.0.0.1:20128");
});

test("dashboard runtime serves GET /dashboard and returns JSON", () => {
  const runtime = createTerminalGovernancePluginRuntime();
  const response = runtime.handleRequest({
    method: "GET",
    path: DASHBOARD_ROUTE,
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );

  const body = JSON.parse(response.body);
  assert.equal(body.contract.route, DASHBOARD_ROUTE);
  assert.equal(body.plugin.displayName, "RealtimeX AI Gateway");
});

test("dashboard runtime returns 404 for unknown routes", () => {
  const runtime = createTerminalGovernancePluginRuntime();
  const response = runtime.handleRequest({
    method: "POST",
    path: "/unknown",
  });

  assert.equal(response.status, 404);

  const body = JSON.parse(response.body);
  assert.equal(body.error, "route-not-found");
});
