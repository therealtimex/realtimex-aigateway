import { resolveGovernedNativeOrigin } from "../gateway/governedRouting.js";

function stripHopByHopHeaders(headers = {}) {
  const nextHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey || normalizedKey === "host" || normalizedKey === "content-length") {
      continue;
    }
    nextHeaders[key] = value;
  }

  return nextHeaders;
}

function buildNativeTargetUrl(origin, requestUrl) {
  const normalizedOrigin = String(origin || "").replace(/\/$/, "");
  const pathWithQuery = `${requestUrl.pathname}${requestUrl.search || ""}`;
  return `${normalizedOrigin}${pathWithQuery}`;
}

function resolveNativeProxyTarget({
  requestUrl,
  requestHeaders = {},
  parsedBody = null,
  routing = null,
}) {
  const pathname = requestUrl.pathname;
  const userAgent = String(requestHeaders["user-agent"] || "").trim().toLowerCase();
  const bodyUserAgent = String(parsedBody?.userAgent || "").trim().toLowerCase();
  const requestType = String(parsedBody?.requestType || "").trim().toLowerCase();
  const isAntigravity =
    userAgent.includes("antigravity") ||
    bodyUserAgent === "antigravity" ||
    requestType === "agent";
  const governedOrigin = resolveGovernedNativeOrigin(routing);

  if (governedOrigin) {
    if (routing.canonicalAgent === "codex") {
      if (pathname.startsWith("/backend-api/codex/") || pathname === "/v1/responses") {
        return {
          provider: "codex",
          origin: governedOrigin,
        };
      }
      return null;
    }

    if (routing.canonicalAgent === "claude") {
      if (pathname === "/v1/messages") {
        return {
          provider: "claude",
          origin: governedOrigin,
        };
      }
      return null;
    }

    if (routing.canonicalAgent === "gemini" && pathname.startsWith("/v1internal:") && !isAntigravity) {
      return {
        provider: "gemini-cli",
        origin: governedOrigin,
      };
    }
    if (routing.canonicalAgent === "gemini") {
      return null;
    }
  }

  if (pathname.startsWith("/backend-api/codex/") || pathname === "/v1/responses") {
    return {
      provider: "codex",
      origin: "https://chatgpt.com",
    };
  }

  if (pathname === "/v1/messages") {
    return {
      provider: "claude",
      origin: "https://api.anthropic.com",
    };
  }

  if (pathname.startsWith("/v1internal:") && !isAntigravity) {
    return {
      provider: "gemini-cli",
      origin: "https://cloudcode-pa.googleapis.com",
    };
  }

  return null;
}

export async function passThroughNativeRequest({
  requestUrl,
  requestHeaders = {},
  requestMethod = "POST",
  rawBody = "",
  parsedBody = null,
  requestId = null,
  fetchFn = fetch,
  adapter,
  routing = null,
}) {
  const target = resolveNativeProxyTarget({
    requestUrl,
    requestHeaders,
    parsedBody,
    routing,
  });
  if (!target) {
    return null;
  }

  const targetUrl = buildNativeTargetUrl(target.origin, requestUrl);

  await adapter.emitTrace?.({
    stage: "dispatch",
    requestId,
    provider: target.provider,
    url: targetUrl,
  });

  const upstreamResponse = await fetchFn(targetUrl, {
    method: requestMethod,
    headers: stripHopByHopHeaders(requestHeaders),
    body: rawBody ? rawBody : undefined,
  });

  await adapter.emitTrace?.({
    stage: "provider-response",
    requestId,
    provider: target.provider,
    status: upstreamResponse.status,
    url: targetUrl,
  });

  return upstreamResponse;
}
