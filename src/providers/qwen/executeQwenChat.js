import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { normalizeUsage, hasValidUsage } from "../../vendor/9router/open-sse/utils/usageTracking.js";
import { PROVIDERS } from "../../vendor/9router/open-sse/config/providers.js";

const QWEN_USER_AGENT = "QwenCode/0.12.3 (linux; x64)";
const QWEN_STAINLESS = {
  os: "Linux",
  arch: "x64",
  lang: "js",
  runtime: "node",
  runtimeVersion: "v18.19.1",
  packageVersion: "5.11.0",
  retryCount: "1",
};
const QWEN_DEFAULT_SYSTEM_MESSAGE = {
  role: "system",
  content: [{ type: "text", text: "", cache_control: { type: "ephemeral" } }],
};

function ensureQwenSystemMessage(body) {
  if (!body || typeof body !== "object") {
    return body;
  }

  const next = { ...body };
  if (Array.isArray(next.messages)) {
    next.messages = [QWEN_DEFAULT_SYSTEM_MESSAGE, ...next.messages];
  } else {
    next.messages = [QWEN_DEFAULT_SYSTEM_MESSAGE];
  }

  return next;
}

function isQwenThinkingActive(body) {
  const thinking = body?.thinking;
  if (thinking === true || body?.enable_thinking === true) {
    return true;
  }

  return (
    typeof thinking === "object" &&
    thinking !== null &&
    !Array.isArray(thinking) &&
    thinking.type === "enabled"
  );
}

function sanitizeQwenThinkingToolChoice(body) {
  if (!isQwenThinkingActive(body)) {
    return body;
  }

  const toolChoice = body.tool_choice;
  const incompatible = toolChoice === "required" || (typeof toolChoice === "object" && toolChoice !== null);
  if (!incompatible) {
    return body;
  }

  return { ...body, tool_choice: "auto" };
}

function transformQwenRequest(body) {
  return ensureQwenSystemMessage(sanitizeQwenThinkingToolChoice(body));
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return null;
  }

  if (/\/chat\/completions\/?$/.test(baseUrl)) {
    return baseUrl.replace(/\/$/, "");
  }

  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function resolveQwenUrl(credentials, baseUrl) {
  const forwardedBaseUrl = credentials?.providerSpecificData?.baseUrl || baseUrl;
  if (forwardedBaseUrl) {
    return normalizeBaseUrl(forwardedBaseUrl);
  }

  const resourceUrl = credentials?.providerSpecificData?.resourceUrl;
  const host = resourceUrl
    ? resourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "portal.qwen.ai";
  return `https://${host}/v1/chat/completions`;
}

function buildQwenHeaders(credentials, stream, url) {
  const token = credentials?.apiKey || credentials?.accessToken || "";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "User-Agent": QWEN_USER_AGENT,
    "X-DashScope-AuthType": "qwen-oauth",
    "X-DashScope-CacheControl": "enable",
    "X-DashScope-UserAgent": QWEN_USER_AGENT,
    "X-Stainless-Arch": QWEN_STAINLESS.arch,
    "X-Stainless-Lang": QWEN_STAINLESS.lang,
    "X-Stainless-Os": QWEN_STAINLESS.os,
    "X-Stainless-Package-Version": QWEN_STAINLESS.packageVersion,
    "X-Stainless-Retry-Count": QWEN_STAINLESS.retryCount,
    "X-Stainless-Runtime": QWEN_STAINLESS.runtime,
    "X-Stainless-Runtime-Version": QWEN_STAINLESS.runtimeVersion,
    Connection: "keep-alive",
    "Accept-Language": "*",
    "Sec-Fetch-Mode": "cors",
    Accept: stream ? "text/event-stream" : "application/json",
  };

  if (url.includes("openrouter.ai")) {
    Object.assign(headers, PROVIDERS.openrouter.headers);
  }

  return headers;
}

async function refreshQwenCredentials(credentials, log) {
  if (!credentials?.refreshToken) {
    return null;
  }

  try {
    const response = await fetch("https://chat.qwen.ai/api/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
        client_id: PROVIDERS.qwen.clientId,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const tokens = await response.json();
    log?.info?.("TOKEN", "qwen refreshed");
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || credentials.refreshToken,
      expiresIn: tokens.expires_in,
      providerSpecificData: {
        ...(credentials.providerSpecificData || {}),
        ...(tokens.resource_url ? { resourceUrl: tokens.resource_url } : {}),
      },
    };
  } catch (error) {
    log?.error?.("TOKEN", `qwen refresh error: ${error.message}`);
    return null;
  }
}

export async function executeQwenChat({
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  stream = false,
  log,
  connectionId = null,
  baseUrl = null,
  translatedRequest = null,
  requestLogger = null,
}) {
  const credentials = await adapter.getProviderCredentials({
    provider: "qwen",
    model,
    body,
    connectionId,
  });

  if (!credentials?.accessToken && !credentials?.apiKey) {
    throw new Error("Missing Qwen credentials");
  }

  const translatedBody = transformQwenRequest(translatedRequest ?? body);
  let activeCredentials = credentials;
  let url = resolveQwenUrl(activeCredentials, baseUrl);
  let headers = buildQwenHeaders(activeCredentials, stream, url);

  const executeRequest = async (currentCredentials) => {
    url = resolveQwenUrl(currentCredentials, baseUrl);
    headers = buildQwenHeaders(currentCredentials, stream, url);
    requestLogger?.logTargetRequest?.(url, headers, translatedBody);
    return fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...translatedBody,
        model,
        stream,
      }),
    });
  };

  await adapter.emitTrace({
    stage: "dispatch",
    provider: "qwen",
    model,
    connectionId,
    url,
  });

  let response = await executeRequest(activeCredentials);
  if ((response.status === 401 || response.status === 403) && activeCredentials.refreshToken) {
    const refreshed = await adapter.refreshProviderCredentials({
      provider: "qwen",
      credentials: activeCredentials,
      log,
    });

    const fallbackRefresh = refreshed?.accessToken ? refreshed : await refreshQwenCredentials(activeCredentials, log);
    if (fallbackRefresh?.accessToken || fallbackRefresh?.apiKey) {
      activeCredentials = {
        ...activeCredentials,
        ...fallbackRefresh,
      };
      response = await executeRequest(activeCredentials);
    }
  }

  const responseJson = await response.json();
  requestLogger?.logProviderResponse?.(response.status, response.statusText ?? "", {}, responseJson);

  await adapter.emitTrace({
    stage: "provider-response",
    provider: "qwen",
    model,
    connectionId,
    status: response.status,
    url,
  });

  if (!response.ok) {
    throw new Error(
      responseJson?.error?.message ??
        responseJson?.message ??
        `Qwen upstream failed with status ${response.status}`,
    );
  }

  const normalizedUsage = normalizeUsage(responseJson?.usage);
  if (hasValidUsage(normalizedUsage)) {
    await adapter.emitUsage({
      provider: url.includes("openrouter.ai") ? "openrouter" : "qwen",
      model,
      connectionId,
      usage: normalizedUsage,
    });
  }

  return {
    upstream: {
      provider: url.includes("openrouter.ai") ? "openrouter" : "qwen",
      url,
      status: response.status,
    },
    response: responseJson,
  };
}
