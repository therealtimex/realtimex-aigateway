import test from "node:test";
import assert from "node:assert/strict";

import { DASHBOARD_ROUTE } from "../src/contracts/dashboardContract.js";
import { createTerminalGovernancePluginRuntime } from "../src/plugin/runtime.js";

test("dashboard runtime returns a contract-backed payload with supported agents", () => {
  const runtime = createTerminalGovernancePluginRuntime({
    commandDetector() {
      return false;
    },
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
  assert.equal(payload.catalog.agents[0].canonical, "gemini");
  assert.equal(payload.catalog.agents[0].label, "Gemini");
  assert.equal(payload.catalog.agents[0].installed, false);
  assert.equal(payload.analytics.source, "plugin");
  assert.equal(payload.analytics.ready, true);
  assert.equal(payload.analytics.notes[0], "No gateway traffic has been observed in this runtime yet.");
  assert.equal(payload.localProxy.source, "plugin");
  assert.equal(payload.localProxy.enabled, true);
  assert.equal(payload.localProxy.status, "configured");
  assert.equal(payload.localProxy.baseUrl, "http://127.0.0.1:20128");
  assert.equal(
    payload.localProxy.notes[payload.localProxy.notes.length - 1],
    "No proxy ingress traffic has been observed in this runtime yet.",
  );
});

test("dashboard runtime serves GET /dashboard and returns JSON", () => {
  const runtime = createTerminalGovernancePluginRuntime({
    commandDetector(command) {
      return command === "gemini";
    },
  });
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
  assert.equal(body.catalog.summary.installed, 1);
});

test("dashboard runtime reflects recorded telemetry in analytics and local proxy notes", () => {
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

  runtime.recordIngress({
    requestId: "req_1",
    method: "POST",
    path: "/v1/chat/completions",
  });
  runtime.recordTrace({
    stage: "dispatch",
    provider: "gemini-cli",
    model: "gemini-2.5-pro",
    connectionId: "req_1",
    url: "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
  });
  runtime.recordTrace({
    stage: "provider-response",
    provider: "gemini-cli",
    model: "gemini-2.5-pro",
    connectionId: "req_1",
    status: 200,
  });
  runtime.recordUsage({
    provider: "gemini-cli",
    model: "gemini-2.5-pro",
    connectionId: "req_1",
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalCostUsd: 0.0125,
    },
  });
  runtime.recordDelivery({
    requestId: "req_1",
    method: "POST",
    path: "/v1/chat/completions",
    status: 200,
  });

  const payload = runtime.getDashboard();
  assert.equal(payload.analytics.summary.trackedRequests, 1);
  assert.equal(payload.analytics.summary.proxyIngressRequests, 1);
  assert.equal(payload.analytics.summary.upstreamDispatches, 1);
  assert.equal(payload.analytics.summary.totalCostUsd, 0.0125);
  assert.match(payload.analytics.notes[0], /Observed 1 request/);
  assert.match(payload.localProxy.notes[payload.localProxy.notes.length - 2], /Latest ingress: POST \/v1\/chat\/completions/);
});

test("dashboard runtime updates local proxy state dynamically", () => {
  const runtime = createTerminalGovernancePluginRuntime({
    localProxy: {
      enabled: true,
      status: "configured",
      baseUrl: "http://127.0.0.1:20128",
      port: 20128,
      source: "plugin",
      notes: [],
    },
  });

  runtime.setLocalProxyState({
    status: "listening",
    baseUrl: "http://127.0.0.1:20999",
    port: 20999,
  });

  const payload = runtime.getDashboard();
  assert.equal(payload.localProxy.status, "listening");
  assert.equal(payload.localProxy.baseUrl, "http://127.0.0.1:20999");
  assert.equal(payload.localProxy.port, 20999);
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
