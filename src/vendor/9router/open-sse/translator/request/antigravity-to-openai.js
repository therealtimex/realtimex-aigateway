import { adjustMaxTokens } from "../helpers/maxTokensHelper.js";

export function antigravityToOpenAIRequest(model, body, stream) {
  const req = body.request || body;
  const result = {
    model,
    messages: [],
    stream,
  };

  if (req.generationConfig) {
    const config = req.generationConfig;
    if (config.maxOutputTokens) {
      result.max_tokens = adjustMaxTokens({
        max_tokens: config.maxOutputTokens,
        tools: req.tools,
      });
    }
    if (config.temperature !== undefined) {
      result.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      result.top_p = config.topP;
    }
    if (config.topK !== undefined) {
      result.top_k = config.topK;
    }

    if (config.thinkingConfig) {
      const budget = config.thinkingConfig.thinkingBudget || 0;
      if (budget > 0) {
        if (budget <= 2048) {
          result.reasoning_effort = "low";
        } else if (budget <= 16384) {
          result.reasoning_effort = "medium";
        } else {
          result.reasoning_effort = "high";
        }
      }
    }
  }

  if (req.systemInstruction) {
    const systemText = extractText(req.systemInstruction);
    if (systemText) {
      result.messages.push({ role: "system", content: systemText });
    }
  }

  if (req.contents && Array.isArray(req.contents)) {
    for (const content of req.contents) {
      const converted = convertContent(content);
      if (converted) {
        if (Array.isArray(converted)) {
          result.messages.push(...converted);
        } else {
          result.messages.push(converted);
        }
      }
    }
  }

  if (req.tools && Array.isArray(req.tools)) {
    result.tools = [];
    for (const tool of req.tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          result.tools.push({
            type: "function",
            function: {
              name: func.name,
              description: func.description || "",
              parameters: normalizeSchemaTypes(func.parameters) || {
                type: "object",
                properties: {},
              },
            },
          });
        }
      }
    }
  }

  return result;
}

function normalizeSchemaTypes(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const result = Array.isArray(schema) ? [...schema] : { ...schema };

  if (typeof result.type === "string") {
    result.type = result.type.toLowerCase();
  }

  delete result.enumDescriptions;

  if (result.properties) {
    const normalized = {};
    for (const [key, value] of Object.entries(result.properties)) {
      normalized[key] = normalizeSchemaTypes(value);
    }
    result.properties = normalized;
  }

  if (result.items) {
    result.items = normalizeSchemaTypes(result.items);
  }

  return result;
}

function convertContent(content) {
  const role = content.role === "model" ? "assistant" : content.role === "user" ? "user" : content.role;

  if (!content.parts || !Array.isArray(content.parts)) {
    return null;
  }

  const textParts = [];
  const toolCalls = [];
  const toolResults = [];
  let reasoningContent = "";

  for (const part of content.parts) {
    if (part.thought === true && part.text) {
      reasoningContent += part.text;
      continue;
    }

    if (part.thoughtSignature && part.text !== undefined) {
      textParts.push({ type: "text", text: part.text });
      continue;
    }

    if (part.text !== undefined) {
      textParts.push({ type: "text", text: part.text });
    }

    if (part.inlineData) {
      textParts.push({
        type: "image_url",
        image_url: {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        },
      });
    }

    if (part.functionCall) {
      toolCalls.push({
        id: part.functionCall.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        },
      });
    }

    if (part.functionResponse) {
      toolResults.push({
        role: "tool",
        tool_call_id: part.functionResponse.id || part.functionResponse.name,
        content: JSON.stringify(part.functionResponse.response?.result || part.functionResponse.response || {}),
      });
    }
  }

  if (toolResults.length > 0) {
    return toolResults;
  }

  if (toolCalls.length > 0) {
    const msg = { role: "assistant" };
    if (textParts.length > 0) {
      msg.content = textParts.length === 1 && textParts[0].type === "text" ? textParts[0].text : textParts;
    }
    if (reasoningContent) {
      msg.reasoning_content = reasoningContent;
    }
    msg.tool_calls = toolCalls;
    return msg;
  }

  if (textParts.length > 0 || reasoningContent) {
    const msg = { role };
    if (textParts.length > 0) {
      msg.content = textParts.length === 1 && textParts[0].type === "text" ? textParts[0].text : textParts;
    }
    if (reasoningContent) {
      msg.reasoning_content = reasoningContent;
    }
    return msg;
  }

  return null;
}

function extractText(instruction) {
  if (typeof instruction === "string") {
    return instruction;
  }
  if (instruction.parts && Array.isArray(instruction.parts)) {
    return instruction.parts.map((part) => part.text || "").join("");
  }
  return "";
}
