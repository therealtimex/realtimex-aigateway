const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const metadata = require("./plugin-metadata.json");

const state = {
  child: null,
  startupPromise: null,
  runtimeStatus: "ready",
  lastError: null,
};

function readConfig(api) {
  const config = api.getConfig();
  return {
    autoStart: toBoolean(config.AUTO_START_GATEWAY, true),
    gatewayHost: String(config.AIGATEWAY_HOST || "127.0.0.1"),
    gatewayPort: toPort(config.AIGATEWAY_PORT, 4010),
    proxyEnabled: toBoolean(config.AIGATEWAY_PROXY_ENABLED, false),
    proxyHost: String(config.AIGATEWAY_PROXY_HOST || "127.0.0.1"),
    proxyPort: toPort(config.AIGATEWAY_PROXY_PORT, 20128),
    executionProvider: String(
      config.AIGATEWAY_EXECUTION_PROVIDER || "gemini-cli",
    ),
    executionBaseUrl: String(
      config.AIGATEWAY_EXECUTION_BASE_URL ||
        "https://cloudcode-pa.googleapis.com/v1internal",
    ),
  };
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toPort(value, fallback) {
  const port = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(port) ? port : fallback;
}

function buildGatewayUrl(config) {
  return `http://${config.gatewayHost}:${config.gatewayPort}`;
}

function buildGatewayEnv(config) {
  return {
    ...process.env,
    AIGATEWAY_HOST: config.gatewayHost,
    AIGATEWAY_PORT: String(config.gatewayPort),
    AIGATEWAY_PROXY_ENABLED: config.proxyEnabled ? "true" : "false",
    AIGATEWAY_PROXY_HOST: config.proxyHost,
    AIGATEWAY_PROXY_PORT: String(config.proxyPort),
    AIGATEWAY_EXECUTION_PROVIDER: config.executionProvider,
    AIGATEWAY_EXECUTION_BASE_URL: config.executionBaseUrl,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(2000),
  });

  if (!response.ok) {
    throw new Error(`Gateway responded with ${response.status} for ${url}`);
  }

  return response.json();
}

async function waitForGatewayReady({ api, gatewayUrl, child }) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (!child || child.exitCode != null) {
      throw new Error(
        state.lastError || "Embedded gateway exited before becoming ready.",
      );
    }

    try {
      await fetchJson(`${gatewayUrl}/health`);
      return;
    } catch (error) {
      state.lastError = error.message;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(
    `Timed out waiting for embedded gateway at ${gatewayUrl}/health`,
  );
}

async function ensureGatewayProcess({ api, pluginDir }) {
  const config = readConfig(api);

  if (!config.autoStart) {
    state.runtimeStatus = "disabled";
    return;
  }

  if (state.child && state.child.exitCode == null) {
    return;
  }

  if (state.startupPromise) {
    return state.startupPromise;
  }

  const gatewayDir = path.join(pluginDir, "gateway");
  const gatewayCliPath = path.join(gatewayDir, "src", "server", "cli.js");
  const gatewayUrl = buildGatewayUrl(config);

  state.runtimeStatus = "starting";
  state.lastError = null;

  state.startupPromise = (async () => {
    const child = spawn(process.execPath, [gatewayCliPath], {
      cwd: gatewayDir,
      env: buildGatewayEnv(config),
      stdio: ["ignore", "pipe", "pipe"],
    });

    state.child = child;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (!message) return;
      if (message.includes("realtimex-aigateway listening on")) {
        state.runtimeStatus = "listening";
      }
      api.log.info(`Embedded gateway: ${message}`);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (!message) return;
      state.lastError = message;
      api.log.warn(`Embedded gateway stderr: ${message}`);
    });

    child.on("exit", (code, signal) => {
      if (state.child === child) {
        state.child = null;
        if (state.runtimeStatus !== "stopped") {
          state.runtimeStatus = "stopped";
        }
      }
      if (code || signal) {
        state.lastError = `Embedded gateway exited (${code ?? "null"}${
          signal ? `, ${signal}` : ""
        })`;
        api.log.warn(state.lastError);
      }
    });

    await waitForGatewayReady({ api, gatewayUrl, child });
    state.runtimeStatus = "listening";
  })()
    .catch((error) => {
      state.runtimeStatus = "error";
      state.lastError = error.message;
      api.log.error("Failed to start embedded gateway", { error: error.message });
      throw error;
    })
    .finally(() => {
      state.startupPromise = null;
    });

  return state.startupPromise;
}

async function stopGatewayProcess({ api }) {
  const child = state.child;
  state.child = null;

  if (!child || child.exitCode != null) {
    state.runtimeStatus = "stopped";
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });

  state.runtimeStatus = "stopped";
  api.log.info("Embedded gateway stopped");
}

function buildFallbackDashboard({ config }) {
  const catalogSummary = metadata.catalog.summary;

  return {
    contract: metadata.contract,
    plugin: {
      manifestId: metadata.plugin.manifestId,
      slug: metadata.plugin.slug,
      displayName: metadata.plugin.displayName,
      enabled: true,
      loaded: true,
      runtimeStatus: state.runtimeStatus,
      installSource: metadata.plugin.installSource,
      lifecycle: metadata.plugin.lifecycle,
    },
    catalog: {
      agents: metadata.catalog.agents,
      summary: catalogSummary,
    },
    analytics: {
      source: "plugin",
      ready: false,
      summary: {
        trackedRequests: 0,
        proxyIngressRequests: 0,
        upstreamDispatches: 0,
        totalCostUsd: 0,
      },
      recent: [],
      notes: state.lastError
        ? [`Embedded gateway unavailable: ${state.lastError}`]
        : ["Embedded gateway has not reported analytics traces yet."],
    },
    localProxy: {
      enabled: config.proxyEnabled,
      status: config.proxyEnabled
        ? state.runtimeStatus === "listening"
          ? "configured"
          : "starting"
        : "disabled",
      baseUrl: config.proxyEnabled
        ? `http://${config.proxyHost}:${config.proxyPort}`
        : null,
      port: config.proxyPort,
      source: "plugin",
      notes: state.lastError
        ? [`Embedded gateway unavailable: ${state.lastError}`]
        : config.proxyEnabled
          ? [
              "Local proxy is enabled in plugin configuration and will route through the embedded gateway runtime.",
            ]
          : ["Local proxy is disabled in plugin configuration."],
    },
  };
}

async function getDashboardPayload({ api, pluginDir }) {
  const config = readConfig(api);
  const gatewayUrl = buildGatewayUrl(config);

  if (config.autoStart && state.runtimeStatus !== "listening") {
    try {
      await ensureGatewayProcess({ api, pluginDir });
    } catch {
      return buildFallbackDashboard({ config });
    }
  }

  if (state.runtimeStatus === "listening") {
    try {
      return await fetchJson(`${gatewayUrl}${metadata.contract.route}`);
    } catch (error) {
      state.runtimeStatus = "error";
      state.lastError = error.message;
      api.log.warn("Failed to fetch embedded gateway dashboard", {
        error: error.message,
      });
    }
  }

  return buildFallbackDashboard({ config });
}

module.exports = {
  ensureGatewayProcess,
  stopGatewayProcess,
  getDashboardPayload,
};

