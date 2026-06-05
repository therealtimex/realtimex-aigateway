function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function readHeader(headers = {}, name = "") {
  return headers[String(name || "").trim().toLowerCase()];
}

function readBearerToken(headers = {}) {
  const authorization = String(readHeader(headers, "authorization") || "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() || null : null;
}

function readApiKey(headers = {}) {
  const direct =
    readHeader(headers, "x-api-key") ??
    readHeader(headers, "api-key") ??
    readHeader(headers, "x-goog-api-key");
  const normalized = String(direct || "").trim();
  return normalized || null;
}

function resolveCredentialsFromRequest({ provider = "", headers = {}, body = {} } = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const bearerToken = readBearerToken(normalizedHeaders);
  const apiKey = readApiKey(normalizedHeaders);

  if (provider === "qwen") {
    const token = apiKey || bearerToken;
    if (!token) return null;
    return { apiKey: token };
  }

  if (provider === "codex") {
    const token = bearerToken || apiKey;
    if (!token) return null;
    return { accessToken: token };
  }

  if (provider === "claude") {
    if (apiKey) {
      return { apiKey };
    }
    if (bearerToken) {
      return { accessToken: bearerToken };
    }
    return null;
  }

  if (provider === "gemini-cli" || provider === "gemini") {
    if (!bearerToken) return null;
    return {
      accessToken: bearerToken,
      projectId:
        String(readHeader(normalizedHeaders, "x-goog-user-project") || "").trim() ||
        String(readHeader(normalizedHeaders, "x-project-id") || "").trim() ||
        String(body?.project || "").trim() ||
        null,
    };
  }

  if (provider === "antigravity") {
    if (!bearerToken) return null;
    return {
      accessToken: bearerToken,
      projectId:
        String(readHeader(normalizedHeaders, "x-goog-user-project") || "").trim() ||
        String(readHeader(normalizedHeaders, "x-project-id") || "").trim() ||
        String(body?.project || body?.request?.project || "").trim() ||
        null,
    };
  }

  return null;
}

export function createRequestScopedCredentialBridge({ getRequestContext } = {}) {
  return {
    async getProviderCredentials({ provider, body, connectionId } = {}) {
      const requestContext =
        typeof getRequestContext === "function" ? getRequestContext(connectionId) : null;
      if (!requestContext) {
        return null;
      }

      return resolveCredentialsFromRequest({
        provider,
        headers: requestContext.headers,
        body: body ?? requestContext.body,
      });
    },
    async refreshProviderCredentials() {
      return null;
    },
  };
}

export { resolveCredentialsFromRequest };
