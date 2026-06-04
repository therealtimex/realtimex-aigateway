import {
  DEFAULT_SAFETY_SETTINGS,
  cleanJSONSchemaForAntigravity,
  convertOpenAIContentToParts,
  extractTextContent,
  tryParseJSON,
} from "../helpers/geminiHelper.js";

function sanitizeGeminiFunctionName(name) {
  if (!name) {
    return "_unknown";
  }

  let sanitized = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized.substring(0, 64);
}

function appendGenerationConfig(generationConfig, body) {
  if (body.temperature !== undefined) {
    generationConfig.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    generationConfig.topP = body.top_p;
  }
  if (body.top_k !== undefined) {
    generationConfig.topK = body.top_k;
  }
  if (body.max_tokens !== undefined) {
    generationConfig.maxOutputTokens = body.max_tokens;
  }
}

function appendThinkingConfig(generationConfig, body) {
  if (body.reasoning_effort) {
    const budgetMap = {
      low: 1024,
      medium: 8192,
      high: 32768,
    };
    generationConfig.thinkingConfig = {
      thinkingBudget: budgetMap[body.reasoning_effort] || 8192,
      include_thoughts: true,
    };
  }

  if (body.thinking?.type === "enabled" && body.thinking.budget_tokens) {
    generationConfig.thinkingConfig = {
      thinkingBudget: body.thinking.budget_tokens,
      include_thoughts: true,
    };
  }
}

function buildToolCallNameMap(messages) {
  const names = {};

  for (const message of messages ?? []) {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
      continue;
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function" && toolCall.id && toolCall.function?.name) {
        names[toolCall.id] = toolCall.function.name;
      }
    }
  }

  return names;
}

function buildToolResponseMap(messages) {
  const responses = {};

  for (const message of messages ?? []) {
    if (message.role === "tool" && message.tool_call_id) {
      responses[message.tool_call_id] = message.content;
    }
  }

  return responses;
}

function convertToolResponse(toolCallId, toolCallNames, toolResponses) {
  const rawResponse = toolResponses[toolCallId];
  if (!rawResponse) {
    return null;
  }

  let resolvedName = toolCallNames[toolCallId];
  if (!resolvedName) {
    const idParts = toolCallId.split("-");
    resolvedName = idParts.length > 2 ? idParts.slice(0, -2).join("-") : toolCallId;
  }

  let parsed = tryParseJSON(rawResponse);
  if (parsed === null) {
    parsed = { result: rawResponse };
  } else if (typeof parsed !== "object") {
    parsed = { result: parsed };
  }

  return {
    functionResponse: {
      id: toolCallId,
      name: sanitizeGeminiFunctionName(resolvedName),
      response: { result: parsed },
    },
  };
}

function convertMessages(body) {
  const contents = [];
  let systemInstruction = null;
  const toolCallNames = buildToolCallNameMap(body.messages);
  const toolResponses = buildToolResponseMap(body.messages);

  for (const message of body.messages ?? []) {
    if (message.role === "system" && (body.messages?.length ?? 0) > 1) {
      systemInstruction = {
        role: "user",
        parts: [{ text: extractTextContent(message.content) }],
      };
      continue;
    }

    if (message.role === "user" || (message.role === "system" && (body.messages?.length ?? 0) === 1)) {
      const parts = convertOpenAIContentToParts(message.content);
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
      continue;
    }

    if (message.role !== "assistant") {
      continue;
    }

    const parts = [];
    if (message.content) {
      const text = extractTextContent(message.content);
      if (text) {
        parts.push({ text });
      }
    }

    const toolCallIds = [];
    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }

        parts.push({
          functionCall: {
            id: toolCall.id,
            name: sanitizeGeminiFunctionName(toolCall.function.name),
            args: tryParseJSON(toolCall.function?.arguments || "{}"),
          },
        });
        toolCallIds.push(toolCall.id);
      }
    }

    if (parts.length > 0) {
      contents.push({ role: "model", parts });
    }

    const responseParts = toolCallIds
      .map((toolCallId) => convertToolResponse(toolCallId, toolCallNames, toolResponses))
      .filter(Boolean);
    if (responseParts.length > 0) {
      contents.push({ role: "user", parts: responseParts });
    }
  }

  return {
    contents,
    systemInstruction,
  };
}

function convertTools(body) {
  if (!Array.isArray(body.tools) || body.tools.length === 0) {
    return null;
  }

  const functionDeclarations = [];

  for (const tool of body.tools) {
    if (tool.name && tool.input_schema) {
      functionDeclarations.push({
        name: sanitizeGeminiFunctionName(tool.name),
        description: tool.description || "",
        parameters: cleanJSONSchemaForAntigravity(
          structuredClone(tool.input_schema || { type: "object", properties: {} }),
        ),
      });
      continue;
    }

    if (tool.type === "function" && tool.function) {
      functionDeclarations.push({
        name: sanitizeGeminiFunctionName(tool.function.name),
        description: tool.function.description || "",
        parameters: cleanJSONSchemaForAntigravity(
          structuredClone(tool.function.parameters || { type: "object", properties: {} }),
        ),
      });
    }
  }

  if (functionDeclarations.length === 0) {
    return null;
  }

  return [{ functionDeclarations }];
}

function openaiToGeminiBase(model, body) {
  const generationConfig = {};
  appendGenerationConfig(generationConfig, body);

  const result = {
    model,
    contents: [],
    generationConfig,
    safetySettings: DEFAULT_SAFETY_SETTINGS,
  };

  const convertedMessages = convertMessages(body);
  result.contents = convertedMessages.contents;
  if (convertedMessages.systemInstruction) {
    result.systemInstruction = convertedMessages.systemInstruction;
  }

  const tools = convertTools(body);
  if (tools) {
    result.tools = tools;
  }

  return result;
}

export function openaiToGeminiRequest(model, body) {
  return openaiToGeminiBase(model, body);
}

export function openaiToGeminiCLIRequest(model, body) {
  const request = openaiToGeminiBase(model, body);
  appendThinkingConfig(request.generationConfig, body);
  return request;
}
