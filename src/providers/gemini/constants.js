import { arch, platform } from "node:os";

const GEMINI_CLI_VERSION = "0.34.0";
const GEMINI_CLI_API_CLIENT = "google-genai-sdk/1.41.0 gl-node/v22.19.0";

function geminiCLIArch() {
  const value = arch();
  return value === "ia32" ? "x86" : value;
}

export function geminiCLIUserAgent(model = "unknown") {
  return `GeminiCLI/${GEMINI_CLI_VERSION}/${model || "unknown"} (${platform()}; ${geminiCLIArch()}; terminal)`;
}

export { GEMINI_CLI_API_CLIENT };
