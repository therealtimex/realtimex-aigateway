function adjustMaxTokens(body) {
  const value = Number(body?.max_tokens);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return 4096;
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  }

  return "";
}

function tryParseJSON(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getContentBlocksFromMessage(message) {
  const blocks = [];

  if (message.role === "tool") {
    blocks.push({
      type: "tool_result",
      tool_use_id: message.tool_call_id,
      content: message.content,
    });
    return blocks;
  }

  if (message.role === "user") {
    if (typeof message.content === "string") {
      if (message.content) {
        blocks.push({ type: "text", text: message.content });
      }
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "tool_result") {
          blocks.push({
            type: "tool_result",
            tool_use_id: part.tool_use_id,
            content: part.content,
            ...(part.is_error && { is_error: part.is_error }),
          });
        } else if (part.type === "image_url") {
          const url = part.image_url?.url;
          const match = url?.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            blocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: match[1],
                data: match[2],
              },
            });
          } else if (url?.startsWith("http://") || url?.startsWith("https://")) {
            blocks.push({
              type: "image",
              source: {
                type: "url",
                url,
              },
            });
          }
        }
      }
    }

    return blocks;
  }

  if (message.role === "assistant") {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "tool_use") {
          blocks.push({
            type: "tool_use",
            id: part.id,
            name: part.name,
            input: part.input,
          });
        }
      }
    } else if (message.content) {
      const text = typeof message.content === "string" ? message.content : extractTextContent(message.content);
      if (text) {
        blocks.push({ type: "text", text });
      }
    }

    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          blocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: tryParseJSON(toolCall.function.arguments),
          });
        }
      }
    }
  }

  return blocks;
}

function convertOpenAIToolChoice(choice) {
  if (!choice) {
    return { type: "auto" };
  }
  if (typeof choice === "object" && choice.type) {
    return choice;
  }
  if (choice === "auto" || choice === "none") {
    return { type: "auto" };
  }
  if (choice === "required") {
    return { type: "any" };
  }
  if (typeof choice === "object" && choice.function) {
    return { type: "tool", name: choice.function.name };
  }
  return { type: "auto" };
}

export function openaiToClaudeRequest(model, body, stream) {
  const result = {
    model,
    max_tokens: adjustMaxTokens(body),
    stream,
    messages: [],
  };

  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }

  const systemParts = [];
  const nonSystemMessages = [];

  for (const message of body.messages ?? []) {
    if (message.role === "system") {
      systemParts.push(typeof message.content === "string" ? message.content : extractTextContent(message.content));
    } else {
      nonSystemMessages.push(message);
    }
  }

  let currentRole;
  let currentParts = [];
  const flushCurrentMessage = () => {
    if (currentRole && currentParts.length > 0) {
      result.messages.push({
        role: currentRole,
        content: currentParts,
      });
      currentParts = [];
    }
  };

  for (const message of nonSystemMessages) {
    const newRole = message.role === "assistant" ? "assistant" : "user";
    const blocks = getContentBlocksFromMessage(message);
    const hasToolUse = blocks.some((block) => block.type === "tool_use");
    const hasToolResult = blocks.some((block) => block.type === "tool_result");

    if (hasToolResult) {
      const toolResultBlocks = blocks.filter((block) => block.type === "tool_result");
      const otherBlocks = blocks.filter((block) => block.type !== "tool_result");

      flushCurrentMessage();
      if (toolResultBlocks.length > 0) {
        result.messages.push({
          role: "user",
          content: toolResultBlocks,
        });
      }
      if (otherBlocks.length > 0) {
        currentRole = newRole;
        currentParts.push(...otherBlocks);
      }
      continue;
    }

    if (currentRole !== newRole) {
      flushCurrentMessage();
      currentRole = newRole;
    }

    currentParts.push(...blocks);
    if (hasToolUse) {
      flushCurrentMessage();
    }
  }

  flushCurrentMessage();

  if (systemParts.length > 0) {
    result.system = systemParts.join("\n");
  }

  if (body.response_format) {
    const responseFormat = body.response_format;
    if (responseFormat.type === "json_schema" && responseFormat.json_schema?.schema) {
      const schemaJson = JSON.stringify(responseFormat.json_schema.schema, null, 2);
      result.system = [result.system, `You must respond with valid JSON that strictly follows this JSON schema:\n\`\`\`json\n${schemaJson}\n\`\`\`\nRespond ONLY with the JSON object, no other text.`]
        .filter(Boolean)
        .join("\n\n");
    } else if (responseFormat.type === "json_object") {
      result.system = [result.system, "You must respond with valid JSON. Respond ONLY with a JSON object, no other text."]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (Array.isArray(body.tools) && body.tools.length > 0) {
    result.tools = body.tools.map((tool) => {
      const toolData = tool.type === "function" && tool.function ? tool.function : tool;
      return {
        name: toolData.name,
        description: toolData.description || "",
        input_schema: toolData.parameters || toolData.input_schema || { type: "object", properties: {}, required: [] },
      };
    });
  }

  if (body.tool_choice) {
    result.tool_choice = convertOpenAIToolChoice(body.tool_choice);
  }

  if (body.thinking) {
    result.thinking = {
      type: body.thinking.type || "enabled",
      ...(body.thinking.budget_tokens && { budget_tokens: body.thinking.budget_tokens }),
      ...(body.thinking.max_tokens && { max_tokens: body.thinking.max_tokens }),
    };
  }

  if (body.reasoning_effort && !result.thinking) {
    const effortToBudget = {
      low: 4096,
      medium: 8192,
      high: 16384,
      xhigh: 32768,
    };
    const budget = effortToBudget[body.reasoning_effort.toLowerCase()];
    if (budget) {
      result.thinking = { type: "enabled", budget_tokens: budget };
    }
  }

  return result;
}
