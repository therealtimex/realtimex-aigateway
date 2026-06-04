import { executeGeminiChat } from "../gemini/executeGeminiChat.js";
import { executeQwenChat } from "../qwen/executeQwenChat.js";
import { executeClaudeChat } from "../claude/executeClaudeChat.js";
import { executeCodexChat } from "../codex/executeCodexChat.js";
import { FORMATS } from "../../translator/index.js";

const PROVIDER_REGISTRY = {
  "gemini-cli": {
    targetFormat: FORMATS.GEMINI_CLI,
    runner: executeGeminiChat,
  },
  gemini: {
    targetFormat: FORMATS.GEMINI,
    runner: executeGeminiChat,
  },
  qwen: {
    targetFormat: FORMATS.OPENAI,
    runner: executeQwenChat,
  },
  claude: {
    targetFormat: FORMATS.CLAUDE,
    runner: executeClaudeChat,
  },
  codex: {
    targetFormat: FORMATS.OPENAI_RESPONSES,
    runner: executeCodexChat,
  },
};

export function resolveHostedProvider(provider = "gemini-cli") {
  const entry = PROVIDER_REGISTRY[provider];
  if (!entry) {
    throw new Error(`Unsupported execution provider: ${provider}`);
  }
  return entry;
}

export function listHostedProviders() {
  return Object.keys(PROVIDER_REGISTRY);
}
