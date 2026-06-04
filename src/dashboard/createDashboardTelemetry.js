const MAX_RECENT_EVENTS = 12;

function isoNow() {
  return new Date().toISOString();
}

function pushRecent(list, entry) {
  list.unshift(entry);
  if (list.length > MAX_RECENT_EVENTS) {
    list.length = MAX_RECENT_EVENTS;
  }
}

function formatCount(value, singular, plural) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildRecentEntry(event = {}) {
  return {
    recordedAt: event.recordedAt || isoNow(),
    stage: event.stage || event.type || "event",
    requestId: event.requestId || event.connectionId || null,
    method: event.method || null,
    path: event.path || null,
    provider: event.provider || null,
    model: event.model || null,
    status: event.status ?? null,
    url: event.url || null,
    totalTokens: Number(event?.usage?.totalTokens ?? 0) || 0,
    totalCostUsd: Number(event?.usage?.totalCostUsd ?? 0) || 0,
  };
}

export function createDashboardTelemetry({ localProxy = null } = {}) {
  const baseLocalProxy = localProxy && typeof localProxy === "object" ? localProxy : {};
  const state = {
    requestIds: new Set(),
    ingressCount: 0,
    dispatchCount: 0,
    providerResponseCount: 0,
    deliveryCount: 0,
    totalCostUsd: 0,
    recent: [],
    latestIngress: null,
    latestDispatch: null,
    latestProviderResponse: null,
    latestDelivery: null,
    latestRequestLog: null,
  };

  function recordRecent(event = {}) {
    pushRecent(state.recent, buildRecentEntry(event));
  }

  return {
    recordIngress(event = {}) {
      const requestId = event.requestId || event.connectionId || `ingress-${Date.now()}`;
      state.requestIds.add(requestId);
      state.ingressCount += 1;
      state.latestIngress = {
        requestId,
        method: event.method || "POST",
        path: event.path || "/v1/chat/completions",
        recordedAt: event.recordedAt || isoNow(),
      };
      recordRecent({
        ...event,
        requestId,
        stage: "ingress",
      });
    },

    recordTrace(event = {}) {
      const stage = event.stage || "trace";
      if (stage === "dispatch") {
        state.dispatchCount += 1;
        state.latestDispatch = {
          provider: event.provider || null,
          model: event.model || null,
          url: event.url || null,
          recordedAt: event.recordedAt || isoNow(),
        };
      }
      if (stage === "provider-response") {
        state.providerResponseCount += 1;
        state.latestProviderResponse = {
          provider: event.provider || null,
          status: event.status ?? null,
          recordedAt: event.recordedAt || isoNow(),
        };
      }
      recordRecent(event);
    },

    recordUsage(event = {}) {
      const usageCost = Number(event?.usage?.totalCostUsd ?? 0);
      if (Number.isFinite(usageCost) && usageCost > 0) {
        state.totalCostUsd += usageCost;
      }
      recordRecent({
        ...event,
        stage: "usage",
      });
    },

    recordDelivery(event = {}) {
      state.deliveryCount += 1;
      state.latestDelivery = {
        requestId: event.requestId || event.connectionId || null,
        status: event.status ?? null,
        path: event.path || null,
        recordedAt: event.recordedAt || isoNow(),
      };
      recordRecent({
        ...event,
        stage: "delivery",
      });
    },

    recordLifecycle(event = {}) {
      state.latestRequestLog = {
        stage: event.stage || event.type || "request-log",
        recordedAt: event.recordedAt || isoNow(),
      };
    },

    buildAnalytics() {
      const hasTraffic =
        state.requestIds.size > 0 ||
        state.dispatchCount > 0 ||
        state.providerResponseCount > 0 ||
        state.deliveryCount > 0;

      const notes = hasTraffic
        ? [
            `Observed ${formatCount(state.requestIds.size, "request", "requests")} in this runtime.`,
            `Proxy ingress: ${state.ingressCount}; upstream dispatches: ${state.dispatchCount}.`,
          ]
        : ["No gateway traffic has been observed in this runtime yet."];

      if (state.latestProviderResponse?.provider) {
        notes.push(
          `Latest provider response: ${state.latestProviderResponse.provider} ${state.latestProviderResponse.status ?? ""}`.trim(),
        );
      }

      return {
        source: "plugin",
        ready: true,
        summary: {
          trackedRequests: state.requestIds.size,
          proxyIngressRequests: state.ingressCount,
          upstreamDispatches: state.dispatchCount,
          totalCostUsd: Number(state.totalCostUsd.toFixed(6)),
        },
        recent: state.recent.map((entry) => ({ ...entry })),
        notes,
      };
    },

    buildLocalProxy() {
      const notes = [...(Array.isArray(baseLocalProxy.notes) ? baseLocalProxy.notes : [])];

      if (state.ingressCount > 0) {
        notes.push(
          `Observed ${formatCount(state.ingressCount, "proxy ingress request", "proxy ingress requests")} in this runtime.`,
        );
      } else {
        notes.push("No proxy ingress traffic has been observed in this runtime yet.");
      }

      if (state.latestIngress) {
        notes.push(
          `Latest ingress: ${state.latestIngress.method} ${state.latestIngress.path}`,
        );
      }

      if (state.latestDispatch?.provider) {
        notes.push(
          `Latest upstream dispatch: ${state.latestDispatch.provider}${state.latestDispatch.model ? ` (${state.latestDispatch.model})` : ""}`,
        );
      }

      return {
        enabled: baseLocalProxy.enabled ?? false,
        status: baseLocalProxy.status ?? "disabled",
        baseUrl: baseLocalProxy.baseUrl ?? null,
        port: baseLocalProxy.port ?? 20128,
        source: "plugin",
        notes,
      };
    },
  };
}
