import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { AntigravityExecutor } from "../../vendor/9router/open-sse/executors/antigravity.js";
import {
  hasValidUsage,
  normalizeUsage,
} from "../../vendor/9router/open-sse/utils/usageTracking.js";
import {
  resetProxyAwareFetchImplementation,
  setProxyAwareFetchImplementation,
} from "../../vendor/9router/open-sse/utils/proxyFetch.js";
import { openaiToAntigravityRequest } from "../../vendor/9router/open-sse/translator/request/openai-to-antigravity.js";
import { antigravityToOpenAIResponse } from "./antigravityToOpenAIResponse.js";

const executor = new AntigravityExecutor();

async function tryRefreshCredentials({ adapter, credentials, log }) {
  if (!credentials?.refreshToken) {
    return null;
  }

  return adapter.refreshProviderCredentials({
    provider: "antigravity",
    credentials,
    log,
  });
}

export async function executeAntigravityChat({
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  stream = false,
  log,
  connectionId = null,
  translatedRequest = null,
  requestLogger = null,
}) {
  const credentials = await adapter.getProviderCredentials({
    provider: "antigravity",
    model,
    body,
    connectionId,
  });

  if (!credentials?.accessToken) {
    throw new Error("Missing Antigravity credentials");
  }

  const translatedBody = translatedRequest ?? openaiToAntigravityRequest(model, body, stream, credentials);
  const url = executor.buildUrl(model, stream, 0);

  await adapter.emitTrace({
    stage: "dispatch",
    provider: "antigravity",
    model,
    connectionId,
    url,
  });

  const executeRequest = async (activeCredentials) => {
    requestLogger?.logTargetRequest?.(
      url,
      {
        Authorization: `Bearer ${activeCredentials.accessToken}`,
      },
      translatedBody,
    );

    setProxyAwareFetchImplementation(fetchFn);
    try {
      return await executor.execute({
        model,
        body: translatedBody,
        stream,
        credentials: activeCredentials,
        log,
      });
    } finally {
      resetProxyAwareFetchImplementation();
    }
  };

  let activeCredentials = credentials;
  let result = await executeRequest(activeCredentials);
  let response = result.response;

  if ((response.status === 401 || response.status === 403) && activeCredentials.refreshToken) {
    const refreshed = await tryRefreshCredentials({
      adapter,
      credentials: activeCredentials,
      log,
    });

    if (refreshed?.accessToken) {
      activeCredentials = {
        ...activeCredentials,
        ...refreshed,
      };
      result = await executeRequest(activeCredentials);
      response = result.response;
    }
  }

  const responseJson = await response.json();
  requestLogger?.logProviderResponse?.(response.status, response.statusText ?? "", {}, responseJson);

  await adapter.emitTrace({
    stage: "provider-response",
    provider: "antigravity",
    model,
    connectionId,
    status: response.status,
    url: result.url,
  });

  if (!response.ok) {
    throw new Error(
      responseJson?.error?.message ??
        responseJson?.message ??
        `Antigravity upstream failed with status ${response.status}`,
    );
  }

  const normalized = antigravityToOpenAIResponse({ model, responseJson });
  const normalizedUsage = normalizeUsage(normalized.usage);

  if (hasValidUsage(normalizedUsage)) {
    await adapter.emitUsage({
      provider: "antigravity",
      model,
      connectionId,
      usage: normalizedUsage,
    });
  }

  return {
    upstream: {
      provider: "antigravity",
      url: result.url,
      status: response.status,
    },
    response: normalized,
  };
}
