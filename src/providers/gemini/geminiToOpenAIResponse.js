function extractGeminiText(responseJson) {
  const parts =
    responseJson?.candidates?.[0]?.content?.parts ??
    responseJson?.response?.candidates?.[0]?.content?.parts ??
    [];

  return parts
    .map((part) => part?.text ?? "")
    .filter(Boolean)
    .join("\n");
}

export function geminiToOpenAIResponse({ model, responseJson }) {
  const text = extractGeminiText(responseJson);
  const usage = responseJson?.usageMetadata ?? {};

  return {
    id: `chatcmpl-gateway-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: usage.promptTokenCount ?? 0,
      completion_tokens: usage.candidatesTokenCount ?? 0,
      total_tokens: usage.totalTokenCount ?? 0,
    },
  };
}
