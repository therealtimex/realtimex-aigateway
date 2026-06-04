import { platform, arch } from "node:os";

const env = process.env;

function mapStainlessOs() {
  switch (platform()) {
    case "darwin":
      return "MacOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    case "freebsd":
      return "FreeBSD";
    default:
      return `Other::${platform()}`;
  }
}

function mapStainlessArch() {
  switch (arch()) {
    case "x64":
      return "x64";
    case "arm64":
      return "arm64";
    case "ia32":
      return "x86";
    default:
      return `other::${arch()}`;
  }
}

const CLAUDE_API_HEADERS = {
  "Anthropic-Version": "2023-06-01",
  "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
};

const CLAUDE_CLI_SPOOF_HEADERS = {
  "Anthropic-Version": "2023-06-01",
  "Anthropic-Beta":
    "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24,structured-outputs-2025-12-15,fast-mode-2026-02-01,redact-thinking-2026-02-12,token-efficient-tools-2026-03-28",
  "Anthropic-Dangerous-Direct-Browser-Access": "true",
  "User-Agent": "claude-cli/2.1.92 (external, sdk-cli)",
  "X-App": "cli",
  "X-Stainless-Helper-Method": "stream",
  "X-Stainless-Retry-Count": "0",
  "X-Stainless-Runtime-Version": "v24.14.0",
  "X-Stainless-Package-Version": "0.80.0",
  "X-Stainless-Runtime": "node",
  "X-Stainless-Lang": "js",
  "X-Stainless-Arch": mapStainlessArch(),
  "X-Stainless-Os": mapStainlessOs(),
  "X-Stainless-Timeout": "600",
};

const KIMI_CODING_BASE_URL = "https://api.kimi.com/coding/v1/messages";

export const PROVIDERS = {
  claude: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: "claude",
    headers: { ...CLAUDE_CLI_SPOOF_HEADERS },
    clientId: env.AIGATEWAY_ANTHROPIC_CLIENT_ID || "",
    tokenUrl: "https://api.anthropic.com/v1/oauth/token",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: "gemini",
    clientId: env.AIGATEWAY_GOOGLE_CLIENT_ID || "",
    clientSecret: env.AIGATEWAY_GOOGLE_CLIENT_SECRET || "",
  },
  "gemini-cli": {
    baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    format: "gemini-cli",
    clientId: env.AIGATEWAY_GOOGLE_CLIENT_ID || "",
    clientSecret: env.AIGATEWAY_GOOGLE_CLIENT_SECRET || "",
  },
  codex: {
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    format: "openai-responses",
    headers: {
      originator: "codex-cli",
      "User-Agent": "codex-cli/1.0.18 (macOS; arm64)",
    },
    clientId: env.AIGATEWAY_OPENAI_CLIENT_ID || "",
    tokenUrl: "https://auth.openai.com/oauth/token",
  },
  qwen: {
    baseUrl: "https://portal.qwen.ai/v1/chat/completions",
    format: "openai",
    clientId: env.AIGATEWAY_QWEN_CLIENT_ID || "",
    tokenUrl: "https://chat.qwen.ai/api/v1/oauth2/token",
    authUrl: "https://chat.qwen.ai/api/v1/oauth2/device/code",
  },
  iflow: {
    baseUrl: "https://apis.iflow.cn/v1/chat/completions",
    format: "openai",
    headers: { "User-Agent": "iFlow-Cli" },
    clientId: env.AIGATEWAY_IFLOW_CLIENT_ID || "",
    clientSecret: env.AIGATEWAY_IFLOW_CLIENT_SECRET || "",
    tokenUrl: "https://iflow.cn/oauth/token",
    authUrl: "https://iflow.cn/oauth",
  },
  antigravity: {
    baseUrls: [
      "https://daily-cloudcode-pa.googleapis.com",
      "https://daily-cloudcode-pa.sandbox.googleapis.com",
    ],
    format: "antigravity",
    headers: { "User-Agent": `antigravity/1.107.0 ${platform()}/${arch()}` },
    clientId: env.AIGATEWAY_ANTIGRAVITY_CLIENT_ID || "",
    clientSecret: env.AIGATEWAY_ANTIGRAVITY_CLIENT_SECRET || "",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    format: "openai",
    headers: {
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy",
    },
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    format: "openai",
  },
  github: {
    baseUrl: "https://api.githubcopilot.com/chat/completions",
    responsesUrl: "https://api.githubcopilot.com/responses",
    format: "openai",
    headers: {
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.110.0",
      "editor-plugin-version": "copilot-chat/0.38.0",
      "user-agent": "GitHubCopilotChat/0.38.0",
      "openai-intent": "conversation-panel",
      "x-github-api-version": "2025-04-01",
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    clientId: env.AIGATEWAY_GITHUB_CLIENT_ID || "",
  },
  cursor: {
    baseUrl: "https://api2.cursor.sh",
    chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    format: "cursor",
    headers: {
      "connect-accept-encoding": "gzip",
      "connect-protocol-version": "1",
      "Content-Type": "application/connect+proto",
      "User-Agent": "connect-es/1.6.1",
    },
    clientVersion: "3.1.0",
  },
  kimi: {
    baseUrl: KIMI_CODING_BASE_URL,
    format: "claude",
    headers: { ...CLAUDE_API_HEADERS },
  },
};
