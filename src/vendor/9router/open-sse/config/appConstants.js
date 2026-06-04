import { arch, platform } from "node:os";

export const GEMINI_CLI_VERSION = "0.34.0";
export const GEMINI_CLI_API_CLIENT = "google-genai-sdk/1.41.0 gl-node/v22.19.0";

function geminiCLIArch() {
  const a = arch();
  if (a === "ia32") {
    return "x86";
  }
  return a;
}

export function geminiCLIUserAgent(model = "unknown") {
  return `GeminiCLI/${GEMINI_CLI_VERSION}/${model || "unknown"} (${platform()}; ${geminiCLIArch()}; terminal)`;
}

export const GITHUB_COPILOT = {
  VSCODE_VERSION: "1.110.0",
  COPILOT_CHAT_VERSION: "0.38.0",
  USER_AGENT: "GitHubCopilotChat/0.38.0",
  API_VERSION: "2025-04-01",
};

export const REFRESH_LEAD_MS = {
  codex: 5 * 24 * 60 * 60 * 1000,
  claude: 4 * 60 * 60 * 1000,
  iflow: 24 * 60 * 60 * 1000,
  qwen: 20 * 60 * 1000,
  "kimi-coding": 5 * 60 * 1000,
  antigravity: 5 * 60 * 1000,
};

export const OAUTH_ENDPOINTS = {
  google: {
    token: "https://oauth2.googleapis.com/token",
    auth: "https://accounts.google.com/o/oauth2/auth",
  },
  openai: {
    token: "https://auth.openai.com/oauth/token",
    auth: "https://auth.openai.com/oauth/authorize",
  },
  anthropic: {
    token: "https://api.anthropic.com/v1/oauth/token",
    auth: "https://api.anthropic.com/v1/oauth/authorize",
  },
  qwen: {
    token: "https://qwen.ai/api/v1/oauth2/token",
    auth: "https://qwen.ai/api/v1/oauth2/device/code",
  },
  iflow: {
    token: "https://iflow.cn/oauth/token",
    auth: "https://iflow.cn/oauth",
  },
  github: {
    token: "https://github.com/login/oauth/access_token",
    auth: "https://github.com/login/oauth/authorize",
    deviceCode: "https://github.com/login/device/code",
  },
};
