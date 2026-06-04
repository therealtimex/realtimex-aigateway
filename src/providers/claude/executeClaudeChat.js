import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { normalizeUsage, hasValidUsage } from "../../vendor/9router/open-sse/utils/usageTracking.js";
import { PROVIDERS } from "../../vendor/9router/open-sse/config/providers.js";
import { openaiToClaudeRequest } from "../../vendor/9router/open-sse/translator/request/openai-to-claude.js";

function claudeToOpenAIResponse({ model, responseJson }) {
  let textContent = "";
  let reasoningContent = "";
  const toolCalls = [];

  for (const block of responseJson?.content ?? []) {
    if (block.type === "text") {
      textContent += block.text || "";
    } else if (block.type === "thinking") {
      reasoningContent += block.thinking || "";
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
      });
    }
  }

  const message = { role: "assistant" };
  if (textContent) {
    message.content = textContent;
  }
  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  if (!message.content && !message.tool_calls) {
    message.content = "";
  }

  let finishReason = responseJson?.stop_reason || "stop";
  if (finishReason === "end_turn") {
    finishReason = "stop";
  } else if (finishReason === "tool_use") {
    finishReason = "tool_calls";
  }

  return {
    id: `chatcmpl-${responseJson?.id || Date.now()}`,
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
        (responseJson?.usage?.input_tokens || 0) + (responseJson?.usage?.output_tokens || 0),
    },
  };
}

function buildClaudeHeaders(credentials, stream) {
  const headers = {
    "Content-Type": "application/json",
    ...PROVIDERS.claude.headers,
    Accept: stream ? "text/event-stream" : "application/json",
  };

  if (credentials?.apiKey) {
    headers["x-api-key"] = credentials.apiKey;
  } else if (credentials?.accessToken) {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
  }

  return headers;
}

export async function executeClaudeChat({
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  stream = false,
  log,
  connectionId = null,
  baseUrl = "https://api.anthropic.com/v1/messages",
  translatedRequest = null,
  requestLogger = null,
}) {
  const credentials = await adapter.getProviderCredentials({
    provider: "claude",
    model,
    body,
    connectionId,
  });

  if (!credentials?.apiKey && !credentials?.accessToken) {
    throw new Error("Missing Claude credentials");
  }

  const translatedBody = translatedRequest ?? openaiToClaudeRequest(model, body, stream);
  const url = baseUrl.includes("?beta=true") ? baseUrl : `${baseUrl}?beta=true`;
  const headers = buildClaudeHeaders(credentials, stream);

  await adapter.emitTrace({
    stage: "dispatch",
    provider: "claude",
    model,
    connectionId,
    url,
  });

  requestLogger?.logTargetRequest?.(url, headers, translatedBody);
  const response = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(translatedBody),
  });

  const responseJson = await response.json();
  requestLogger?.logProviderResponse?.(response.status, response.statusText ?? "", {}, responseJson);

  await adapter.emitTrace({
    stage: "provider-response",
    provider: "claude",
    model,
    connectionId,
    status: response.status,
    url,
  });

  if (!response.ok) {
    throw new Error(
      responseJson?.error?.message ??
        responseJson?.message ??
        `Claude upstream failed with status ${response.status}`,
    );
  }

  const normalized = claudeToOpenAIResponse({ model, responseJson });
  const normalizedUsage = normalizeUsage(normalized.usage);
  if (hasValidUsage(normalizedUsage)) {
    await adapter.emitUsage({
      provider: "claude",
      model,
      connectionId,
      usage: normalizedUsage,
    });
  }

  return {
    upstream: {
      provider: "claude",
      url,
      status: response.status,
    },
    response: normalized,
  };
}
