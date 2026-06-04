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
  return {
    kind: "terminal-governance-plugin",
    getDashboard() {
      return buildDashboardPayload(options);
    },
    handleRequest({ method = "GET", path = "/" } = {}) {
      if (method === "GET" && path === DASHBOARD_ROUTE) {
        return jsonResponse(200, buildDashboardPayload(options));
      }

      return jsonResponse(404, {
        error: "route-not-found",
        message: `No plugin route matches ${method} ${path}`,
      });
    },
  };
}
