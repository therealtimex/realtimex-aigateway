export const VALID_OPENAI_CONTENT_TYPES = ["text", "image_url", "image", "input_audio", "audio_url"];

export function filterToOpenAIFormat(body) {
  if (!body.messages || !Array.isArray(body.messages)) {
    return body;
  }

  body.messages = body.messages.map((message) => {
    if (message.role === "developer") {
      message = { ...message, role: "system" };
    }

    if (message.role === "tool") {
      return message;
    }

    if (message.role === "assistant" && message.tool_calls) {
      return message;
    }

    if (typeof message.content === "string") {
      return message;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = [];

      for (const block of message.content) {
        if (block.type === "thinking" || block.type === "redacted_thinking") {
          continue;
        }

        if (VALID_OPENAI_CONTENT_TYPES.includes(block.type)) {
          const { signature, cache_control, ...cleanBlock } = block;
          filteredContent.push(cleanBlock);
        } else if (block.type === "tool_result") {
          const { signature, cache_control, ...cleanBlock } = block;
          filteredContent.push(cleanBlock);
        }
      }

      if (filteredContent.length === 0) {
        filteredContent.push({ type: "text", text: "" });
      }

      return { ...message, content: filteredContent };
    }

    return message;
  });

  body.messages = body.messages.filter((message) => {
    if (message.role === "tool") {
      return true;
    }

    if (message.role === "assistant" && message.tool_calls) {
      return true;
    }

    if (typeof message.content === "string") {
      return message.content.trim() !== "";
    }

    if (Array.isArray(message.content)) {
      return message.content.some(
        (block) => (block.type === "text" && block.text?.trim()) || block.type !== "text",
      );
    }

    return true;
  });

  if (Array.isArray(body.tools) && body.tools.length === 0) {
    delete body.tools;
  }

  if (Array.isArray(body.tools) && body.tools.length > 0) {
    body.tools = body.tools
      .map((tool) => {
        if (tool.type === "function" && tool.function) {
          return tool;
        }

        if (tool.name && (tool.input_schema || tool.description)) {
          return {
            type: "function",
            function: {
              name: tool.name,
              description: String(tool.description || ""),
              parameters: tool.input_schema || { type: "object", properties: {} },
            },
          };
        }

        if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
          return tool.functionDeclarations.map((declaration) => ({
            type: "function",
            function: {
              name: declaration.name,
              description: String(declaration.description || ""),
              parameters: declaration.parameters || { type: "object", properties: {} },
            },
          }));
        }

        return tool;
      })
      .flat();
  }

  if (body.tool_choice && typeof body.tool_choice === "object") {
    const choice = body.tool_choice;
    if (choice.type === "auto") {
      body.tool_choice = "auto";
    } else if (choice.type === "any") {
      body.tool_choice = "required";
    } else if (choice.type === "tool" && choice.name) {
      body.tool_choice = { type: "function", function: { name: choice.name } };
    }
  }

  return body;
}
