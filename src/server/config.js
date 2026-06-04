export function resolveServerConfig(env = process.env) {
  const port = Number.parseInt(env.AIGATEWAY_PORT ?? "4010", 10);
  const proxyPort = Number.parseInt(env.AIGATEWAY_PROXY_PORT ?? "20128", 10);
  const proxyEnabled = (env.AIGATEWAY_PROXY_ENABLED ?? "false") === "true";
  const proxyHost = env.AIGATEWAY_PROXY_HOST ?? "127.0.0.1";
  const proxyBaseUrl =
    env.AIGATEWAY_PROXY_BASE_URL ??
    (proxyEnabled
      ? `http://${proxyHost}:${Number.isFinite(proxyPort) ? proxyPort : 20128}`
      : null);

  return {
    host: env.AIGATEWAY_HOST ?? "127.0.0.1",
    port: Number.isFinite(port) ? port : 4010,
    localProxy: {
      enabled: proxyEnabled,
      status: proxyEnabled ? "configured" : "disabled",
      baseUrl: proxyBaseUrl,
      port: Number.isFinite(proxyPort) ? proxyPort : 20128,
      source: "plugin",
      notes: proxyEnabled
        ? [
            "Local proxy is enabled in plugin configuration and ready for lifecycle wiring.",
          ]
        : ["Local proxy is disabled in plugin configuration."],
    },
  };
}
