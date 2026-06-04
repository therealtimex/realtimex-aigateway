function extractTextContent(content) {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text") {
          return part.text ?? "";
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function openAIToGeminiCLIRequest(model, body) {
  const contents = [];
  let systemInstruction = null;

  for (const message of body.messages ?? []) {
    if (message.role === "system") {
      const text = extractTextContent(message.content);
      if (text) {
        systemInstruction = {
          role: "user",
          parts: [{ text }],
        };
      }
      continue;
    }

    const text = extractTextContent(message.content);
    if (!text) {
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }

  const request = {
    model,
    contents,
    generationConfig: {},
  };

  if (systemInstruction) {
    request.systemInstruction = systemInstruction;
  }

  if (body.temperature !== undefined) {
    request.generationConfig.temperature = body.temperature;
  }

  if (body.top_p !== undefined) {
    request.generationConfig.topP = body.top_p;
  }

  if (body.max_tokens !== undefined) {
    request.generationConfig.maxOutputTokens = body.max_tokens;
  }

  return request;
}
