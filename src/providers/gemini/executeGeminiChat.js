import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import {
  GEMINI_CLI_API_CLIENT,
  geminiCLIUserAgent,
} from "./constants.js";
import { geminiToOpenAIResponse } from "./geminiToOpenAIResponse.js";
import { openAIToGeminiCLIRequest } from "./openaiToGeminiRequest.js";

const DEFAULT_GEMINI_BASE_URL = "https://cloudcode-pa.googleapis.com/v1internal";

function buildGeminiUrl({ baseUrl = DEFAULT_GEMINI_BASE_URL, stream = false }) {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `${baseUrl}:${action}`;
}

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
  const url = buildGeminiUrl({ baseUrl, stream });

  await adapter.emitTrace({
    stage: "dispatch",
    provider: "gemini-cli",
    model,
    connectionId,
    url,
  });

  const executeRequest = async (activeCredentials) =>
    fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeCredentials.accessToken}`,
        "User-Agent": geminiCLIUserAgent(model),
        "X-Goog-Api-Client": GEMINI_CLI_API_CLIENT,
        Accept: stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(requestBody),
    });

  let activeCredentials = credentials;
  let response = await executeRequest(activeCredentials);

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
      response = await executeRequest(activeCredentials);
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
      url,
      status: response.status,
    },
    credentials: {
      projectId: activeCredentials.projectId ?? null,
    },
    response: normalized,
  };
}
