function parseToolArguments(argumentsText) {
  if (!argumentsText) {
    return {};
  }

  if (typeof argumentsText === "object") {
    return argumentsText;
  }

  try {
    return JSON.parse(argumentsText);
  } catch {
    return {};
  }
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part?.type === "text") {
        return part.text || "";
      }
      return "";
    })
    .filter(Boolean)
    .join("");
}

function mapFinishReason(finishReason, toolCalls) {
  const normalized = String(finishReason || "stop").toLowerCase();
  const reasonMap = {
    stop: "STOP",
    length: "MAX_TOKENS",
    tool_calls: "STOP",
    content_filter: "SAFETY",
  };

  if (normalized === "stop" && toolCalls.length > 0) {
    return "STOP";
  }

  return reasonMap[normalized] || "STOP";
}

export function openAIResponseToAntigravityResult(openAIResponse) {
  const choice = openAIResponse?.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const parts = [];

  if (message.reasoning_content) {
    parts.push({ thought: true, text: message.reasoning_content });
  }

  const textContent = extractTextContent(message.content);
  if (textContent) {
    parts.push({ text: textContent });
  }

  for (const toolCall of toolCalls) {
    parts.push({
      functionCall: {
        name: toolCall.function?.name || "tool",
        args: parseToolArguments(toolCall.function?.arguments),
      },
    });
  }

  if (parts.length === 0) {
    parts.push({ text: "" });
  }

  const usage = openAIResponse?.usage || {};
  const result = {
    response: {
      candidates: [
        {
          content: {
            role: "model",
            parts,
          },
          finishReason: mapFinishReason(choice.finish_reason, toolCalls),
        },
      ],
      modelVersion: openAIResponse?.model || "",
      responseId: openAIResponse?.id || `resp_${Date.now()}`,
    },
  };

  if (usage) {
    result.response.usageMetadata = {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
      ...(usage.completion_tokens_details?.reasoning_tokens
        ? {
            thoughtsTokenCount: usage.completion_tokens_details.reasoning_tokens,
          }
        : {}),
      ...(usage.prompt_tokens_details?.cached_tokens
        ? {
            cachedContentTokenCount: usage.prompt_tokens_details.cached_tokens,
          }
        : {}),
    };
  }

  return result;
}
