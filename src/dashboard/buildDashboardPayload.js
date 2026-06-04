import { buildDashboardContractDescriptor } from "../contracts/dashboardContract.js";
import { buildDefaultCatalog, summarizeCatalog } from "../providers/catalog.js";

function buildDefaultAnalytics() {
  return {
    source: "plugin",
    ready: false,
    summary: {
      trackedRequests: 0,
      proxyIngressRequests: 0,
      upstreamDispatches: 0,
      totalCostUsd: 0,
    },
    recent: [],
    notes: [
      "Execution traces are not wired yet in the initial dashboard runtime.",
    ],
  };
}

function buildDefaultLocalProxy() {
  return {
    enabled: false,
    status: "disabled",
    baseUrl: null,
    port: 20128,
    source: "plugin",
    notes: [
      "Local proxy lifecycle will be owned by the plugin runtime in a follow-up slice.",
    ],
  };
}

export function buildDashboardPayload(options = {}) {
  const agents = options.catalog?.agents ?? buildDefaultCatalog();

  return {
    contract: buildDashboardContractDescriptor(),
    plugin: {
      manifestId:
        options.plugin?.manifestId ?? "ai.realtimex.terminal-governance",
      slug: options.plugin?.slug ?? "terminal-governance",
      displayName: options.plugin?.displayName ?? "RealtimeX AI Gateway",
      enabled: options.plugin?.enabled ?? true,
      loaded: options.plugin?.loaded ?? true,
      runtimeStatus: options.plugin?.runtimeStatus ?? "ready",
      installSource: options.plugin?.installSource ?? "github",
      lifecycle: {
        enableSupported:
          options.plugin?.lifecycle?.enableSupported ?? true,
        disableSupported:
          options.plugin?.lifecycle?.disableSupported ?? true,
        reloadRequired:
          options.plugin?.lifecycle?.reloadRequired ?? false,
        healthSource:
          options.plugin?.lifecycle?.healthSource ?? "plugin-self-report",
      },
    },
    catalog: {
      agents,
      summary: options.catalog?.summary ?? summarizeCatalog(agents),
    },
    analytics: options.analytics ?? buildDefaultAnalytics(),
    localProxy: options.localProxy ?? buildDefaultLocalProxy(),
  };
}
