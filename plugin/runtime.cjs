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
const GOVERNED_TERMINAL_AGENTS = new Set([
  "antigravity",
  "claude",
  "codex",
  "gemini",
  "qwen",
]);
const QWEN_USER_AUTH_OVERLAY_KEYS = [
  "security",
  "modelProviders",
  "env",
  "model",
  "providerMetadata",
];
const PROXY_BASE_URL_ENV_KEYS = [
  "OPENAI_BASE_URL",
  "ANTHROPIC_BASE_URL",
  "GEMINI_BASE_URL",
  "QWEN_BASE_URL",
  "OPENROUTER_BASE_URL",
  "DEEPSEEK_BASE_URL",
  "GROQ_API_BASE_PATH",
  "MISTRAL_BASE_URL",
  "TOGETHER_AI_BASE_URL",
  "FIREWORKS_AI_LLM_BASE_URL",
  "PERPLEXITY_BASE_URL",
  "NOVITA_LLM_BASE_URL",
  "MOONSHOT_AI_BASE_URL",
  "XAI_LLM_BASE_URL",
  "PPIO_BASE_URL",
  "APIPIE_LLM_BASE_URL",
  "GENERIC_OPEN_AI_BASE_PATH",
];
const GEMINI_PROXY_ENV_KEYS = [
  "GOOGLE_GEMINI_BASE_URL",
  "GOOGLE_VERTEX_BASE_URL",
  "CODE_ASSIST_ENDPOINT",
];
const CURSOR_PROXY_ENV_KEYS = ["CURSOR_API_ENDPOINT"];
const GOVERNED_ROUTE_PREFIX = "/_rtx/governed";
const FORWARDED_PROVIDERS_BY_AGENT = {
  qwen: new Set(["openrouter"]),
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

function normalizeIdentifier(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeForwardedProvider(canonicalAgent, value = "") {
  const normalizedAgent = normalizeIdentifier(canonicalAgent);
  const normalizedProvider = normalizeIdentifier(value);
  if (!normalizedProvider) {
    return null;
  }

  const supportedProviders = FORWARDED_PROVIDERS_BY_AGENT[normalizedAgent];
  if (!supportedProviders || !supportedProviders.has(normalizedProvider)) {
    return null;
  }

  return normalizedProvider;
}

function buildProxyBaseUrl(config) {
  return `http://${config.proxyHost}:${config.proxyPort}`;
}

function buildGovernedProxyBaseUrl(config, canonicalAgent, forwardedProvider = null) {
  const routeSegments = [
    GOVERNED_ROUTE_PREFIX,
    encodeURIComponent(canonicalAgent),
  ];
  if (forwardedProvider) {
    routeSegments.push("forward", encodeURIComponent(forwardedProvider));
  }
  return `${buildProxyBaseUrl(config)}${routeSegments.join("/")}`;
}

function applyProviderBaseUrlOverrides(env = {}, baseUrl = "") {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  if (!normalizedBaseUrl || !env || typeof env !== "object") {
    return env;
  }

  for (const key of PROXY_BASE_URL_ENV_KEYS) {
    env[key] = normalizedBaseUrl;
  }
  for (const key of GEMINI_PROXY_ENV_KEYS) {
    env[key] = normalizedBaseUrl;
  }
  for (const key of CURSOR_PROXY_ENV_KEYS) {
    env[key] = normalizedBaseUrl;
  }
  for (const key of Object.keys(env)) {
    if (/_BASE_(URL|PATH)$/i.test(String(key || "").trim())) {
      env[key] = normalizedBaseUrl;
    }
  }

  return env;
}

function resolveQwenUserSettingsPath() {
  const homeDir = String(process.env.HOME || process.env.USERPROFILE || "").trim();
  if (!homeDir) return "";
  return path.join(homeDir, ".qwen", "settings.json");
}

function safeReadJsonFile(filePath = "") {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildQwenSettingsOverlay({ baseUrl = "", modelId = "" } = {}) {
  const source = safeReadJsonFile(resolveQwenUserSettingsPath());
  const resolvedModelId = String(modelId || "qwen-max").trim() || "qwen-max";
  const next = {};

  for (const key of QWEN_USER_AUTH_OVERLAY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    const value = source[key];
    if (value && typeof value === "object") {
      next[key] = JSON.parse(JSON.stringify(value));
    }
  }

  if (next.env && typeof next.env === "object") {
    applyProviderBaseUrlOverrides(next.env, baseUrl);
  } else {
    next.env = applyProviderBaseUrlOverrides({}, baseUrl);
  }

  const security = {
    ...(next.security && typeof next.security === "object" ? next.security : {}),
  };
  const previousAuth =
    security.auth && typeof security.auth === "object" ? security.auth : {};
  security.auth = {
    ...previousAuth,
    selectedType:
      String(previousAuth.selectedType || "").trim() === "qwen-oauth"
        ? "openai"
        : String(previousAuth.selectedType || "openai").trim() || "openai",
    baseUrl,
  };
  next.security = security;

  const modelProviders = {
    ...(next.modelProviders && typeof next.modelProviders === "object"
      ? next.modelProviders
      : {}),
  };
  for (const [providerKey, models] of Object.entries(modelProviders)) {
    if (!Array.isArray(models)) continue;
    modelProviders[providerKey] = models.map((model) => ({
      ...(model && typeof model === "object" ? model : {}),
      baseUrl,
    }));
  }
  if (!Array.isArray(modelProviders.openai) || modelProviders.openai.length === 0) {
    modelProviders.openai = [
      {
        id: resolvedModelId,
        name: resolvedModelId,
        envKey: "OPENAI_API_KEY",
        baseUrl,
      },
    ];
  }
  next.modelProviders = modelProviders;

  if (!next.model || typeof next.model !== "object") {
    next.model = { name: resolvedModelId };
  } else if (!String(next.model.name || "").trim()) {
    next.model.name = resolvedModelId;
  }

  return next;
}

function buildLaunchContextPayload({ config, body = {} }) {
  const canonicalAgent = normalizeIdentifier(body.canonicalAgent);
  const forwardedProvider = normalizeForwardedProvider(
    canonicalAgent,
    body.forwardedProvider
  );
  if (!GOVERNED_TERMINAL_AGENTS.has(canonicalAgent)) {
    return {
      governed: false,
      launchArgs: [],
      launchEnv: {},
      metadata: {
        reason: "unsupported-agent",
      },
    };
  }

  if (!config.proxyEnabled) {
    return {
      governed: false,
      launchArgs: [],
      launchEnv: {},
      metadata: {
        reason: "proxy-disabled",
      },
    };
  }

  const baseUrl = buildGovernedProxyBaseUrl(
    config,
    canonicalAgent,
    forwardedProvider
  );
  const launchEnv = applyProviderBaseUrlOverrides(
    {
      REALTIMEX_AIGATEWAY_ENABLED: "true",
      REALTIMEX_AIGATEWAY_BASE_URL: baseUrl,
      REALTIMEX_AIGATEWAY_CANONICAL_AGENT: canonicalAgent,
      REALTIMEX_AIGATEWAY_FORWARDED_PROVIDER: forwardedProvider || "",
    },
    baseUrl
  );

  const overlays = {};
  if (canonicalAgent === "qwen") {
    overlays.qwen = {
      settings: buildQwenSettingsOverlay({
        baseUrl,
        modelId: body.modelId,
      }),
    };
  }

  launchEnv.REALTIMEX_TERMINAL_GOVERNANCE_CONTEXT = JSON.stringify({
    pluginId: metadata.plugin.manifestId,
    routing: {
      canonicalAgent,
      forwardedProvider,
    },
    proxy: {
      enabled: true,
      baseUrl,
      listenerBaseUrl: buildProxyBaseUrl(config),
    },
    overlays,
  });

  const launchArgs =
    canonicalAgent === "codex"
      ? [
          "--config",
          `chatgpt_base_url=${JSON.stringify(baseUrl)}`,
          "--config",
          `openai_base_url=${JSON.stringify(baseUrl)}`,
        ]
      : [];

  return {
    governed: true,
    launchArgs,
    launchEnv,
    metadata: {
      plugin: metadata.plugin.displayName,
      source: "plugin-launch-context",
    },
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

async function getLaunchContextPayload({ api, request }) {
  const config = readConfig(api);
  return buildLaunchContextPayload({
    config,
    body: request?.body || {},
  });
}

module.exports = {
  ensureGatewayProcess,
  stopGatewayProcess,
  getDashboardPayload,
  getLaunchContextPayload,
};
