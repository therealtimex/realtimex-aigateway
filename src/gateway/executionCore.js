export function createExecutionCore() {
  return {
    kind: "execution-core",
    status: "hosted-chat-ready",
    capabilities: [
      "request-planning",
      "provider-selection",
      "fallback-policy",
      "trace-emission",
      "hosted-chat-gemini",
    ],
  };
}
