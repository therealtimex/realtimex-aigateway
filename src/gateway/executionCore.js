export function createExecutionCore() {
  return {
    kind: "execution-core",
    status: "scaffold",
    capabilities: [
      "request-planning",
      "provider-selection",
      "fallback-policy",
      "trace-emission",
    ],
  };
}
