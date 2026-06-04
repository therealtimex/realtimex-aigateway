import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { PROVIDERS } from "../../vendor/9router/open-sse/config/providers.js";
import { openaiToCodexRequest } from "../../vendor/9router/open-sse/translator/request/openai-to-codex.js";
import { executeHostedJsonProvider } from "../shared/executeHostedJsonProvider.js";

function buildCodexHeaders(credentials, stream, connectionId) {
  const headers = {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
    ...PROVIDERS.codex.headers,
  };

  if (credentials?.accessToken) {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
  } else if (credentials?.apiKey) {
    headers.Authorization = `Bearer ${credentials.apiKey}`;
  }

  headers.session_id =
    credentials?.providerSpecificData?.workspaceId ||
    connectionId ||
    credentials?.connectionId ||
    "default";

  return headers;
}

function normalizeCodexContent(output) {
  const message = { role: "assistant" };
  let text = "";
  let reasoning = "";
  const toolCalls = [];

  for (const item of output || []) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.type === "output_text") {
          text += block.text || "";
        }
      }
    } else if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: {
          name: item.name || "unknown",
          arguments: item.arguments || "{}",
        },
      });
    } else if (item.type === "reasoning") {
      if (Array.isArray(item.summary)) {
        reasoning += item.summary.map((part) => part?.text || "").join("");
      } else if (typeof item.summary === "string") {
        reasoning += item.summary;
      }
    }
  }

  if (text) {
    message.content = text;
  }
  if (reasoning) {
    message.reasoning_content = reasoning;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  if (!message.content && !message.tool_calls) {
    message.content = "";
  }

  return {
    message,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
  };
}

function codexToOpenAIResponse({ model, responseJson }) {
  const { message, finishReason } = normalizeCodexContent(responseJson?.output);

  return {
    id: responseJson?.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: responseJson?.model || model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: responseJson?.usage?.input_tokens || 0,
      completion_tokens: responseJson?.usage?.output_tokens || 0,
      total_tokens:
        responseJson?.usage?.total_tokens ||
        ((responseJson?.usage?.input_tokens || 0) + (responseJson?.usage?.output_tokens || 0)),
    },
  };
}

export async function executeCodexChat({
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  stream = false,
  log,
  connectionId = null,
  baseUrl = PROVIDERS.codex.baseUrl,
  translatedRequest = null,
  requestLogger = null,
}) {
  return executeHostedJsonProvider({
    provider: "codex",
    model,
    body,
    adapter,
    fetchFn,
    log,
    connectionId,
    requestLogger,
    isCredentialsValid: (credentials) => !!(credentials?.accessToken || credentials?.apiKey),
    getRequestState: async ({ credentials }) => {
      const requestBody = translatedRequest ?? openaiToCodexRequest(model, body, stream);
      const headers = buildCodexHeaders(credentials, stream, connectionId);
      const url = baseUrl;
      requestLogger?.logTargetRequest?.(url, headers, requestBody);
      return { url, headers, requestBody };
    },
    normalizeResponse: async ({ responseJson }) => codexToOpenAIResponse({ model, responseJson }),
  });
}
