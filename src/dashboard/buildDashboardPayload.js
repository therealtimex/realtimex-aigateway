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
  const agents =
    options.catalog?.agents ??
    buildDefaultCatalog({ commandDetector: options.commandDetector });
  const pluginState = options.pluginState ?? {};
  const pluginConfig = options.plugin ?? {};

  return {
    contract: buildDashboardContractDescriptor(),
    plugin: {
      manifestId:
        pluginConfig.manifestId ?? "com.realtimex.aigateway",
      slug: pluginConfig.slug ?? "realtimex-aigateway",
      displayName: pluginConfig.displayName ?? "RealtimeX AI Gateway",
      enabled: pluginConfig.enabled ?? true,
      loaded: pluginConfig.loaded ?? true,
      runtimeStatus: pluginState.runtimeStatus ?? pluginConfig.runtimeStatus ?? "ready",
      installSource: pluginConfig.installSource ?? "github",
      lifecycle: {
        enableSupported:
          pluginConfig.lifecycle?.enableSupported ?? true,
        disableSupported:
          pluginConfig.lifecycle?.disableSupported ?? true,
        reloadRequired:
          pluginConfig.lifecycle?.reloadRequired ?? false,
        healthSource:
          pluginConfig.lifecycle?.healthSource ?? "plugin-runtime-state",
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
