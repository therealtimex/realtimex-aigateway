const SUPPORTED_AGENTS = [
  {
    id: "gemini",
    displayName: "Gemini Terminal",
    supported: true,
    installed: false,
    forwardable: true,
    launchCommand: "gemini",
    modelFlag: "--model",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    authHint: "Google Code Assist or Gemini auth",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "claude",
    displayName: "Claude Code",
    supported: true,
    installed: false,
    forwardable: true,
    launchCommand: "claude",
    modelFlag: "--model",
    models: ["claude-opus-4-1", "claude-sonnet-4"],
    authHint: "Anthropic account or routed provider auth",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
  },
  {
    id: "codex",
    displayName: "Codex CLI",
    supported: true,
    installed: false,
    forwardable: true,
    launchCommand: "codex",
    modelFlag: "--model",
    models: ["gpt-5", "gpt-5-mini"],
    authHint: "OpenAI or compatible provider auth",
    docsUrl: "https://developers.openai.com/codex/cli",
  },
  {
    id: "qwen",
    displayName: "Qwen Code",
    supported: true,
    installed: false,
    forwardable: true,
    launchCommand: "qwen",
    modelFlag: "--model",
    models: ["qwen3-coder-plus", "qwen3-coder-480b"],
    authHint: "Qwen or forwarded OpenRouter auth",
    docsUrl: "https://github.com/QwenLM/qwen-code",
  },
  {
    id: "antigravity",
    displayName: "Antigravity Terminal",
    supported: true,
    installed: false,
    forwardable: false,
    launchCommand: "agy",
    modelFlag: null,
    models: ["gemini-native", "google-code-assist"],
    authHint: "Google Code Assist auth",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
];

export function buildDefaultCatalog() {
  return SUPPORTED_AGENTS.map((agent) => ({
    ...agent,
    installHint: `Install ${agent.launchCommand} and reconnect the plugin host to refresh installation status.`,
    docsLinked: Boolean(agent.docsUrl),
  }));
}

export function summarizeCatalog(agents) {
  const supported = agents.filter((agent) => agent.supported).length;
  const installed = agents.filter((agent) => agent.installed).length;
  const docsLinked = agents.filter((agent) => agent.docsLinked).length;
  const forwardable = agents.filter((agent) => agent.forwardable).length;

  return {
    supported,
    installed,
    uninstalled: supported - installed,
    docsLinked,
    forwardable,
  };
}
