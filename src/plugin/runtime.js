import { DASHBOARD_ROUTE } from "../contracts/dashboardContract.js";
import { buildDashboardPayload } from "../dashboard/buildDashboardPayload.js";

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

  function buildPayload() {
    return buildDashboardPayload({
      ...options,
      pluginState: state,
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
