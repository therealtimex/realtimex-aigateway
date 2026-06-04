const TOOL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function generateToolCallId(messageIndex = 0, toolCallIndex = 0, toolName = "") {
  const suffix = toolName ? `_${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
  return `call_msg${messageIndex}_tc${toolCallIndex}${suffix}`;
}

function sanitizeToolId(id) {
  if (!id || typeof id !== "string") {
    return null;
  }

  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

export function ensureToolCallIds(body) {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  for (let messageIndex = 0; messageIndex < body.messages.length; messageIndex += 1) {
    const message = body.messages[messageIndex];

    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (let toolCallIndex = 0; toolCallIndex < message.tool_calls.length; toolCallIndex += 1) {
        const toolCall = message.tool_calls[toolCallIndex];

        if (!toolCall.id || !TOOL_ID_PATTERN.test(toolCall.id)) {
          const sanitized = sanitizeToolId(toolCall.id);
          toolCall.id = sanitized || generateToolCallId(messageIndex, toolCallIndex, toolCall.function?.name);
        }

        if (!toolCall.type) {
          toolCall.type = "function";
        }

        if (toolCall.function?.arguments && typeof toolCall.function.arguments !== "string") {
          toolCall.function.arguments = JSON.stringify(toolCall.function.arguments);
        }
      }
    }

    if (message.role === "tool" && message.tool_call_id && !TOOL_ID_PATTERN.test(message.tool_call_id)) {
      const sanitized = sanitizeToolId(message.tool_call_id);
      message.tool_call_id = sanitized || generateToolCallId(messageIndex, 0);
    }

    if (Array.isArray(message.content)) {
      for (let blockIndex = 0; blockIndex < message.content.length; blockIndex += 1) {
        const block = message.content[blockIndex];
        if (block.type === "tool_use" && block.id && !TOOL_ID_PATTERN.test(block.id)) {
          const sanitized = sanitizeToolId(block.id);
          block.id = sanitized || generateToolCallId(messageIndex, blockIndex, block.name);
        }

        if (block.type === "tool_result" && block.tool_use_id && !TOOL_ID_PATTERN.test(block.tool_use_id)) {
          const sanitized = sanitizeToolId(block.tool_use_id);
          block.tool_use_id = sanitized || generateToolCallId(messageIndex, blockIndex);
        }
      }
    }
  }

  return body;
}

export function getToolCallIds(message) {
  if (message.role !== "assistant") {
    return [];
  }

  const ids = [];

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.id) {
        ids.push(toolCall.id);
      }
    }
  }

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === "tool_use" && block.id) {
        ids.push(block.id);
      }
    }
  }

  return ids;
}

export function hasToolResults(message, toolCallIds) {
  if (!message || toolCallIds.length === 0) {
    return false;
  }

  if (message.role === "tool" && message.tool_call_id) {
    return toolCallIds.includes(message.tool_call_id);
  }

  if (message.role === "user" && Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === "tool_result" && toolCallIds.includes(block.tool_use_id)) {
        return true;
      }
    }
  }

  return false;
}

export function fixMissingToolResponses(body) {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  const newMessages = [];

  for (let index = 0; index < body.messages.length; index += 1) {
    const message = body.messages[index];
    const nextMessage = body.messages[index + 1];

    newMessages.push(message);

    const toolCallIds = getToolCallIds(message);
    if (toolCallIds.length === 0) {
      continue;
    }

    if (nextMessage && !hasToolResults(nextMessage, toolCallIds)) {
      for (const toolCallId of toolCallIds) {
        newMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: "",
        });
      }
    }
  }

  body.messages = newMessages;
  return body;
}
