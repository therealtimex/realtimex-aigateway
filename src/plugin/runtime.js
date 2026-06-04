import { DASHBOARD_ROUTE } from "../contracts/dashboardContract.js";
import { buildDashboardPayload } from "../dashboard/buildDashboardPayload.js";
import { createDashboardTelemetry } from "../dashboard/createDashboardTelemetry.js";

function jsonResponse(status, payload) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload, null, 2),
  };
}

export function createTerminalGovernancePluginRuntime(options = {}) {
  const state = {
    runtimeStatus: options.pluginState?.runtimeStatus ?? "ready",
  };
  const telemetry = options.telemetry ?? createDashboardTelemetry({
    localProxy: options.localProxy,
  });

  function buildPayload() {
    return buildDashboardPayload({
      ...options,
      pluginState: state,
      analytics: telemetry.buildAnalytics(),
      localProxy: telemetry.buildLocalProxy(),
    });
  }

  return {
    kind: "terminal-governance-plugin",
    getState() {
      return { ...state };
    },
    setRuntimeStatus(runtimeStatus) {
      state.runtimeStatus = runtimeStatus;
    },
    recordIngress(event = {}) {
      telemetry.recordIngress(event);
    },
    recordTrace(event = {}) {
      telemetry.recordTrace(event);
    },
    recordUsage(event = {}) {
      telemetry.recordUsage(event);
    },
    recordDelivery(event = {}) {
      telemetry.recordDelivery(event);
    },
    recordLifecycle(event = {}) {
      telemetry.recordLifecycle(event);
    },
    getDashboard() {
      return buildPayload();
    },
    handleRequest({ method = "GET", path = "/" } = {}) {
      if (method === "GET" && path === DASHBOARD_ROUTE) {
        return jsonResponse(200, buildPayload());
      }

      return jsonResponse(404, {
        error: "route-not-found",
        message: `No plugin route matches ${method} ${path}`,
      });
    },
  };
}
