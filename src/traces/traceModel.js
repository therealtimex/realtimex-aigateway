export const TRACE_STAGES = Object.freeze([
  "ingress",
  "plan",
  "dispatch",
  "provider-response",
  "delivery",
]);

export function createTraceEnvelope({ traceId = "", stage = "" } = {}) {
  return {
    traceId,
    stage,
    recordedAt: new Date().toISOString(),
  };
}
