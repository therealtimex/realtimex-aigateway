import test from "node:test";
import assert from "node:assert/strict";

import { createGatewayServer } from "../src/server/createServer.js";

test("gateway server exposes /health and /dashboard", async (t) => {
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      localProxy: {
        enabled: true,
        status: "configured",
        baseUrl: "http://127.0.0.1:20128",
        port: 20128,
        source: "plugin",
        notes: ["Configured in plugin state."],
      },
    },
  });
  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const healthResponse = await fetch(
    `http://${address.host}:${address.port}/health`,
  );
  assert.equal(healthResponse.status, 200);

  const healthBody = await healthResponse.json();
  assert.equal(healthBody.status, "ok");
  assert.equal(healthBody.service, "realtimex-aigateway");
  assert.equal(healthBody.plugin.runtimeStatus, "listening");
  assert.equal(healthBody.localProxy.enabled, true);
  assert.equal(healthBody.localProxy.baseUrl, "http://127.0.0.1:20128");

  const dashboardResponse = await fetch(
    `http://${address.host}:${address.port}/dashboard`,
  );
  assert.equal(dashboardResponse.status, 200);

  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.contract.route, "/dashboard");
  assert.equal(dashboardBody.plugin.slug, "terminal-governance");
  assert.equal(dashboardBody.plugin.runtimeStatus, "listening");
  assert.equal(dashboardBody.localProxy.status, "configured");
});

test("gateway server returns 404 for unknown routes", async (t) => {
  const gateway = createGatewayServer();
  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(`http://${address.host}:${address.port}/nope`);
  assert.equal(response.status, 404);

  const body = await response.json();
  assert.equal(body.error, "route-not-found");
});
