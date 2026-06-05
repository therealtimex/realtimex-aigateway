export const REALTIMEX_AIGATEWAY_PLUGIN_ID = "com.realtimex.aigateway";
export const REALTIMEX_AIGATEWAY_PLUGIN_NAME = "realtimex-aigateway";
export const REALTIMEX_AIGATEWAY_PLUGIN_DISPLAY_NAME = "RealtimeX AI Gateway";
export const GOVERNED_PLUGIN_ROUTE_PREFIX = "/_rtx/governed";
export const GOVERNED_PLUGIN_ROUTE_METHODS = ["GET", "POST"];

export function buildReleaseAssetBaseName({ version }) {
  return `${REALTIMEX_AIGATEWAY_PLUGIN_NAME}-plugin-${version}`;
}

export function buildGovernedPluginRouteDescriptors() {
  return GOVERNED_PLUGIN_ROUTE_METHODS.map((method) => ({
    method,
    path: GOVERNED_PLUGIN_ROUTE_PREFIX,
    match: "prefix",
    description:
      "Forwards governed local-proxy traffic to the embedded AI Gateway runtime.",
  }));
}

export function buildPluginManifest({ version }) {
  return {
    id: REALTIMEX_AIGATEWAY_PLUGIN_ID,
    name: REALTIMEX_AIGATEWAY_PLUGIN_NAME,
    displayName: REALTIMEX_AIGATEWAY_PLUGIN_DISPLAY_NAME,
    version,
    description:
      "Runs the RealtimeX AI Gateway as an installable RealTimeX plugin and exposes the terminal governance dashboard contract.",
    author: {
      name: "RealTimeX Team",
    },
    license: "MIT",
    enabledByDefault: true,
    entrypoint: "index.js",
    capabilities: {
      api_routes: [
        {
          method: "GET",
          path: "/dashboard",
          description:
            "Returns plugin-backed dashboard status for Terminal Agents settings.",
        },
        {
          method: "POST",
          path: "/launch-context",
          description:
            "Builds generic launch context for governed terminal agent sessions.",
        },
        ...buildGovernedPluginRouteDescriptors(),
      ],
    },
    configSchema: [
      {
        key: "AUTO_START_GATEWAY",
        label: "Auto-start Gateway",
        type: "boolean",
        required: false,
        default: true,
        description:
          "Start the embedded AI Gateway process automatically when the plugin activates.",
      },
      {
        key: "AIGATEWAY_HOST",
        label: "Gateway Host",
        type: "text",
        required: false,
        default: "127.0.0.1",
        description:
          "Host interface for the embedded AI Gateway HTTP server.",
      },
      {
        key: "AIGATEWAY_PORT",
        label: "Gateway Port",
        type: "text",
        required: false,
        default: "4010",
        description:
          "Port for the embedded AI Gateway HTTP server.",
      },
      {
        key: "AIGATEWAY_PROXY_ENABLED",
        label: "Enable Local Proxy",
        type: "boolean",
        required: false,
        default: false,
        description:
          "Expose local proxy status and reserve the proxy port for compatible terminal agents.",
      },
      {
        key: "AIGATEWAY_PROXY_HOST",
        label: "Local Proxy Host",
        type: "text",
        required: false,
        default: "127.0.0.1",
        description:
          "Host interface for plugin-managed local proxy ingress.",
      },
      {
        key: "AIGATEWAY_PROXY_PORT",
        label: "Local Proxy Port",
        type: "text",
        required: false,
        default: "20128",
        description:
          "Port for plugin-managed local proxy ingress.",
      },
      {
        key: "AIGATEWAY_EXECUTION_PROVIDER",
        label: "Default Execution Provider",
        type: "text",
        required: false,
        default: "gemini-cli",
        description:
          "Default provider family for hosted execution when no upstream override is supplied.",
      },
      {
        key: "AIGATEWAY_EXECUTION_BASE_URL",
        label: "Default Execution Base URL",
        type: "text",
        required: false,
        default: "https://cloudcode-pa.googleapis.com/v1internal",
        description:
          "Default upstream base URL for the hosted execution provider.",
      },
    ],
    permissions: [],
  };
}
