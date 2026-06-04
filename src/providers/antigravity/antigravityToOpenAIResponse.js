function mapFinishReason(finishReason, toolCalls) {
  const normalized = String(finishReason || "stop").toLowerCase();
  if (normalized === "stop" && toolCalls.length > 0) {
    return "tool_calls";
  }
  if (normalized === "max_tokens") {
    return "length";
  }
  if (normalized === "safety") {
    return "content_filter";
  }
  return normalized;
}

export function antigravityToOpenAIResponse({ model, responseJson }) {
  const response = responseJson?.response || responseJson;
  const candidate = response?.candidates?.[0];
  const content = candidate?.content;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const usage = response?.usageMetadata || responseJson?.usageMetadata || {};

  let textContent = "";
  let reasoningContent = "";
  const toolCalls = [];

  for (const part of parts) {
    if (part.thought === true && part.text) {
      reasoningContent += part.text;
      continue;
    }

    if (part.text !== undefined) {
      textContent += part.text;
    }

    if (part.functionCall) {
      toolCalls.push({
        id: `call_${part.functionCall.name}_${Date.now()}_${toolCalls.length}`,
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
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

  return {
    id: `chatcmpl-${response?.responseId || Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: response?.modelVersion || model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapFinishReason(candidate?.finishReason, toolCalls),
      },
    ],
    usage: {
      prompt_tokens: usage.promptTokenCount ?? 0,
      completion_tokens: usage.candidatesTokenCount ?? 0,
      total_tokens: usage.totalTokenCount ?? 0,
      ...(usage.thoughtsTokenCount
        ? {
            completion_tokens_details: {
              reasoning_tokens: usage.thoughtsTokenCount,
            },
          }
        : {}),
    },
  };
}
