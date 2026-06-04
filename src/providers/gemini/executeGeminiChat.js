import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { geminiToOpenAIResponse } from "./geminiToOpenAIResponse.js";
import { openAIToGeminiCLIRequest } from "./openaiToGeminiRequest.js";
import { GeminiCLIExecutor } from "../../vendor/9router/open-sse/executors/gemini-cli.js";
import {
  resetProxyAwareFetchImplementation,
  setProxyAwareFetchImplementation,
} from "../../vendor/9router/open-sse/utils/proxyFetch.js";

const DEFAULT_GEMINI_BASE_URL = "https://cloudcode-pa.googleapis.com/v1internal";
const executor = new GeminiCLIExecutor();

async function tryRefreshCredentials({ adapter, credentials, log }) {
  if (!credentials?.refreshToken) {
    return null;
  }

  return adapter.refreshProviderCredentials({
    provider: "gemini-cli",
    credentials,
    log,
  });
}

export async function executeGeminiChat({
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  stream = false,
  log,
  connectionId = null,
  baseUrl = DEFAULT_GEMINI_BASE_URL,
}) {
  const credentials = await adapter.getProviderCredentials({
    provider: "gemini-cli",
    model,
    body,
    connectionId,
  });

  if (!credentials?.accessToken) {
    throw new Error("Missing Gemini credentials");
  }

  const translatedBody = openAIToGeminiCLIRequest(model, body);
  const requestBody = {
    project: credentials.projectId ?? body.project ?? "default-project",
    model,
    request: translatedBody,
  };
  const url = executor.buildUrl(model, stream, 0, {
    ...credentials,
    providerSpecificData: {
      baseUrl,
    },
  });

  await adapter.emitTrace({
    stage: "dispatch",
    provider: "gemini-cli",
    model,
    connectionId,
    url,
  });

  const executeRequest = async (activeCredentials) => {
    setProxyAwareFetchImplementation(fetchFn);
    try {
      return executor.execute({
        model,
        body: requestBody,
        stream,
        credentials: {
          ...activeCredentials,
          providerSpecificData: {
            baseUrl,
          },
        },
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

  await adapter.emitTrace({
    stage: "provider-response",
    provider: "gemini-cli",
    model,
    connectionId,
    status: response.status,
  });

  if (!response.ok) {
    throw new Error(
      responseJson?.error?.message ??
        responseJson?.message ??
        `Gemini upstream failed with status ${response.status}`,
    );
  }

  const normalized = geminiToOpenAIResponse({ model, responseJson });

  await adapter.emitUsage({
    provider: "gemini-cli",
    model,
    connectionId,
    usage: normalized.usage,
  });

  return {
    upstream: {
      provider: "gemini-cli",
      url: result.url,
      status: response.status,
    },
    credentials: {
      projectId: activeCredentials.projectId ?? null,
    },
    response: normalized,
  };
}
