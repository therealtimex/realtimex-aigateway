import { PROVIDERS } from "../vendor/9router/open-sse/config/providers.js";

export const GOVERNED_ROUTE_PREFIX = "/_rtx/governed";

const NATIVE_PROVIDER_ORIGINS = {
  claude: "https://api.anthropic.com",
  codex: "https://chatgpt.com",
  gemini: "https://cloudcode-pa.googleapis.com",
};

const FORWARDED_PROVIDER_BASE_URLS = {
  openrouter: "https://openrouter.ai/api/v1",
};

const HOSTED_EXECUTION_BY_AGENT = {
  antigravity: {
    provider: "antigravity",
    baseUrl: null,
  },
  claude: {
    provider: "claude",
    baseUrl: PROVIDERS.claude.baseUrl,
  },
  codex: {
    provider: "codex",
    baseUrl: PROVIDERS.codex.baseUrl,
  },
  gemini: {
    provider: "gemini-cli",
    baseUrl: PROVIDERS["gemini-cli"].baseUrl,
  },
  qwen: {
    provider: "qwen",
    baseUrl: null,
  },
};

const FORWARDED_PROVIDERS_BY_AGENT = {
  qwen: new Set(["openrouter"]),
};

function normalizeSegment(value = "") {
  return decodeURIComponent(String(value || "").trim()).toLowerCase();
}

export function normalizeCanonicalAgent(value = "") {
  return normalizeSegment(value);
}

export function normalizeForwardedProvider(canonicalAgent = "", value = "") {
  const agent = normalizeCanonicalAgent(canonicalAgent);
  const provider = normalizeSegment(value);
  if (!provider) {
    return null;
  }

  const supportedProviders = FORWARDED_PROVIDERS_BY_AGENT[agent];
  if (!supportedProviders?.has(provider)) {
    return null;
  }

  return provider;
}

export function extractGovernedRouting(pathname = "") {
  const normalizedPathname = String(pathname || "").trim() || "/";
  const segments = normalizedPathname.split("/").filter(Boolean);

  if (segments[0] !== "_rtx" || segments[1] !== "governed") {
    return {
      governed: false,
      normalizedPath: normalizedPathname,
      routing: null,
    };
  }

  const canonicalAgent = normalizeCanonicalAgent(segments[2]);
  let forwardedProvider = null;
  let pathIndex = 3;

  if (segments[3] === "forward") {
    forwardedProvider = normalizeForwardedProvider(canonicalAgent, segments[4]);
    pathIndex = 5;
  }

  const normalizedPath = `/${segments.slice(pathIndex).join("/")}`.replace(/\/+$/, "") || "/";

  return {
    governed: true,
    normalizedPath,
    routing: {
      canonicalAgent,
      forwardedProvider,
      prefix: `/${segments.slice(0, pathIndex).join("/")}`,
    },
  };
}

export function resolveExecutionRouting({ execution = {}, routing = null } = {}) {
  if (!routing?.canonicalAgent) {
    return {
      provider: execution.provider ?? "gemini-cli",
      baseUrl: execution.baseUrl ?? PROVIDERS["gemini-cli"].baseUrl,
      source: "config",
    };
  }

  const hostedExecution = HOSTED_EXECUTION_BY_AGENT[routing.canonicalAgent];
  if (!hostedExecution) {
    return {
      provider: execution.provider ?? "gemini-cli",
      baseUrl: execution.baseUrl ?? PROVIDERS["gemini-cli"].baseUrl,
      source: "config",
    };
  }

  if (routing.forwardedProvider) {
    const forwardedBaseUrl = FORWARDED_PROVIDER_BASE_URLS[routing.forwardedProvider];
    if (forwardedBaseUrl) {
      return {
        provider: hostedExecution.provider,
        baseUrl: forwardedBaseUrl,
        source: "governed-forwarded-provider",
      };
    }
  }

  return {
    provider: hostedExecution.provider,
    baseUrl: hostedExecution.baseUrl,
    source: "governed-canonical-agent",
  };
}

export function resolveGovernedNativeOrigin(routing = null) {
  if (!routing?.canonicalAgent) {
    return null;
  }

  return NATIVE_PROVIDER_ORIGINS[routing.canonicalAgent] ?? null;
}
