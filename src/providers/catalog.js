import { spawnSync } from "node:child_process";

const SUPPORTED_AGENTS = [
  {
    id: "gemini",
    canonical: "gemini",
    label: "Gemini",
    displayName: "Gemini Terminal",
    supported: true,
    supportsProviderForwarding: true,
    forwardableProviders: ["openrouter"],
    launchCommand: "gemini",
    terminalCommand: "gemini",
    modelFlag: "--model",
    models: [
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ],
    authHint: "Google Code Assist or Gemini auth",
    installHint: "Install the Gemini CLI and restart RealtimeX or refresh the plugin dashboard.",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "claude",
    canonical: "claude",
    label: "Claude",
    displayName: "Claude Code",
    supported: true,
    supportsProviderForwarding: true,
    forwardableProviders: ["openrouter"],
    launchCommand: "claude",
    terminalCommand: "claude",
    modelFlag: "--model",
    models: [
      { id: "claude-opus-4-1", label: "claude-opus-4-1" },
      { id: "claude-sonnet-4", label: "claude-sonnet-4" },
    ],
    authHint: "Anthropic account or routed provider auth",
    installHint: "Install Claude Code and restart RealtimeX or refresh the plugin dashboard.",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
  },
  {
    id: "codex",
    canonical: "codex",
    label: "Codex",
    displayName: "Codex CLI",
    supported: true,
    supportsProviderForwarding: true,
    forwardableProviders: ["openrouter"],
    launchCommand: "codex",
    terminalCommand: "codex",
    modelFlag: "--model",
    models: [
      { id: "gpt-5", label: "gpt-5" },
      { id: "gpt-5-mini", label: "gpt-5-mini" },
    ],
    authHint: "OpenAI or compatible provider auth",
    installHint: "Install Codex CLI and restart RealtimeX or refresh the plugin dashboard.",
    docsUrl: "https://developers.openai.com/codex/cli",
  },
  {
    id: "qwen",
    canonical: "qwen",
    label: "Qwen",
    displayName: "Qwen Code",
    supported: true,
    supportsProviderForwarding: true,
    forwardableProviders: ["openrouter"],
    launchCommand: "qwen",
    terminalCommand: "qwen",
    modelFlag: "--model",
    models: [
      { id: "qwen3-coder-plus", label: "qwen3-coder-plus" },
      { id: "qwen3-coder-480b", label: "qwen3-coder-480b" },
    ],
    authHint: "Qwen or forwarded OpenRouter auth",
    installHint: "Install Qwen Code and restart RealtimeX or refresh the plugin dashboard.",
    docsUrl: "https://github.com/QwenLM/qwen-code",
  },
  {
    id: "antigravity",
    canonical: "antigravity",
    label: "Antigravity",
    displayName: "Antigravity Terminal",
    supported: true,
    supportsProviderForwarding: false,
    forwardableProviders: [],
    launchCommand: "agy",
    terminalCommand: "agy",
    modelFlag: null,
    models: [
      { id: "gemini-native", label: "gemini-native" },
      { id: "google-code-assist", label: "google-code-assist" },
    ],
    authHint: "Google Code Assist auth",
    installHint: "Install Antigravity and restart RealtimeX or refresh the plugin dashboard.",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
];

function normalizeDetectorResult(result) {
  if (typeof result === "boolean") return result;
  if (!result || typeof result !== "object") return false;
  return Boolean(result.installed);
}

export function createDefaultCommandDetector({
  env = process.env,
  platform = process.platform,
} = {}) {
  const lookupCommand = platform === "win32" ? "where" : "which";

  return function isCommandAvailable(command) {
    if (!command) return false;

    try {
      const result = spawnSync(lookupCommand, [command], {
        env,
        stdio: "ignore",
      });
      return result.status === 0;
    } catch {
      return false;
    }
  };
}

function buildCatalogAgent(agent, isInstalled) {
  const docsLinked = Boolean(agent.docsUrl);
  const terminalCommand = agent.terminalCommand || agent.launchCommand || agent.id;
  const modelFlag = agent.modelFlag || null;

  return {
    id: agent.id,
    canonical: agent.canonical || agent.id,
    label: agent.label || agent.displayName || agent.id,
    displayName: agent.displayName || agent.label || agent.id,
    supported: true,
    installed: Boolean(isInstalled),
    supportsProviderForwarding: Boolean(agent.supportsProviderForwarding),
    forwardable: Boolean(agent.supportsProviderForwarding),
    forwardableProviders: Array.isArray(agent.forwardableProviders)
      ? [...agent.forwardableProviders]
      : [],
    launchCommand: agent.launchCommand,
    command: agent.launchCommand,
    terminalCommand,
    terminalModel: {
      enabled: Boolean(modelFlag),
      modelFlag,
    },
    modelFlag,
    models: Array.isArray(agent.models) ? [...agent.models] : [],
    authHint: agent.authHint,
    installHint: agent.installHint,
    docsUrl: agent.docsUrl,
    docsLinked,
    setup: {
      installHint: agent.installHint,
      authHint: agent.authHint,
      docsUrl: agent.docsUrl,
    },
  };
}

export function buildDefaultCatalog(options = {}) {
  const detectCommand =
    typeof options.commandDetector === "function"
      ? options.commandDetector
      : createDefaultCommandDetector(options);

  return SUPPORTED_AGENTS.map((agent) =>
    buildCatalogAgent(agent, normalizeDetectorResult(detectCommand(agent.terminalCommand)))
  );
}

export function summarizeCatalog(agents) {
  const normalizedAgents = Array.isArray(agents) ? agents : [];
  const supported = normalizedAgents.filter((agent) => agent.supported !== false).length;
  const installed = normalizedAgents.filter((agent) => agent.installed).length;
  const docsLinked = normalizedAgents.filter(
    (agent) => Boolean(agent.docsLinked || agent?.setup?.docsUrl || agent.docsUrl)
  ).length;
  const forwardable = normalizedAgents.filter(
    (agent) => Boolean(agent.supportsProviderForwarding ?? agent.forwardable)
  ).length;

  return {
    supported,
    installed,
    uninstalled: supported - installed,
    docsLinked,
    forwardable,
  };
}
