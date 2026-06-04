import { CODEX_DEFAULT_INSTRUCTIONS } from "../../config/codexInstructions.js";
import { normalizeResponsesInput } from "../helpers/responsesApiHelper.js";

const RESPONSES_API_ALLOWLIST = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "tool_choice",
  "stream",
  "store",
  "reasoning",
  "service_tier",
  "include",
  "prompt_cache_key",
  "client_metadata",
]);

const SERVER_ID_PATTERN = /^(rs|fc|resp|msg)_/;

function mapContentBlock(block) {
  if (!block || typeof block !== "object") {
    return null;
  }

  if (block.type === "text") {
    return { type: "input_text", text: block.text || "" };
  }

  if (block.type === "image_url") {
    const url = typeof block.image_url === "string" ? block.image_url : block.image_url?.url;
    return url ? { type: "input_image", image_url: url, detail: block.image_url?.detail || "auto" } : null;
  }

  if (block.type === "tool_result") {
    return null;
  }

  return null;
}

function mapMessageContent(content) {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ type: "input_text", text: "" }];
  }

  const mapped = content.map(mapContentBlock).filter(Boolean);
  return mapped.length > 0 ? mapped : [{ type: "input_text", text: "" }];
}

function convertToolChoice(toolChoice) {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === "string") {
    if (toolChoice === "required") {
      return "required";
    }
    if (toolChoice === "none") {
      return "none";
    }
    return "auto";
  }

  if (toolChoice.type === "function") {
    const name = toolChoice.function?.name || toolChoice.name;
    return name ? { type: "function", name } : "auto";
  }

  return "auto";
}

function normalizeCodexTools(body) {
  if (!Array.isArray(body.tools)) {
    return;
  }

  body.tools = body.tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") {
        return null;
      }

      if (tool.type === "function" && tool.function) {
        return {
          type: "function",
          name: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters || { type: "object", properties: {} },
        };
      }

      if (tool.type === "function" && tool.name) {
        return {
          type: "function",
          name: tool.name,
          description: tool.description || "",
          parameters: tool.parameters || { type: "object", properties: {} },
        };
      }

      return null;
    })
    .filter(Boolean);

  if (body.tools.length === 0) {
    delete body.tools;
  }
}

function buildInputFromMessages(messages) {
  const input = [];

  for (const message of messages || []) {
    if (!message || typeof message !== "object") {
      continue;
    }

    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id || "call_missing",
        output: typeof message.content === "string" ? message.content : JSON.stringify(message.content || ""),
      });
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const name = toolCall?.function?.name;
        if (!name) {
          continue;
        }

        input.push({
          type: "function_call",
          call_id: toolCall.id || `call_${Math.random().toString(36).slice(2, 10)}`,
          name,
          arguments: toolCall.function?.arguments || "{}",
        });
      }
      continue;
    }

    input.push({
      type: "message",
      role: message.role === "system" ? "developer" : message.role,
      content: mapMessageContent(message.content),
    });
  }

  return input;
}

function stripStoredItemReferences(body) {
  if (!Array.isArray(body.input)) {
    return;
  }

  body.input = body.input.filter((item) => {
    if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) {
      return false;
    }
    if (item && typeof item === "object") {
      if (item.type === "item_reference") {
        return false;
      }
      if (typeof item.id === "string" && SERVER_ID_PATTERN.test(item.id)) {
        delete item.id;
      }
    }
    return true;
  });
}

export function openaiToCodexRequest(model, body, stream = true) {
  const next = structuredClone(body);

  if (!next.input) {
    next.input = buildInputFromMessages(next.messages || []);
  }

  next.input = normalizeResponsesInput(next.input);
  if (!next.input || (Array.isArray(next.input) && next.input.length === 0)) {
    next.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
  }

  stripStoredItemReferences(next);
  normalizeCodexTools(next);

  next.model = model;
  next.stream = stream;
  next.store = false;
  next.tool_choice = convertToolChoice(next.tool_choice);

  if (!next.instructions || next.instructions.trim() === "") {
    next.instructions = CODEX_DEFAULT_INSTRUCTIONS;
  }

  if (next.reasoning_effort && !next.reasoning) {
    next.reasoning = {
      effort: next.reasoning_effort,
      summary: "auto",
    };
  }

  if (next.reasoning?.effort && next.reasoning.effort !== "none") {
    next.reasoning.summary ||= "auto";
    next.include = ["reasoning.encrypted_content"];
  }

  delete next.messages;
  delete next.temperature;
  delete next.top_p;
  delete next.frequency_penalty;
  delete next.presence_penalty;
  delete next.logprobs;
  delete next.top_logprobs;
  delete next.n;
  delete next.seed;
  delete next.max_tokens;
  delete next.max_completion_tokens;
  delete next.max_output_tokens;
  delete next.user;
  delete next.metadata;
  delete next.stream_options;
  delete next.reasoning_effort;
  delete next.previous_response_id;

  for (const key of Object.keys(next)) {
    if (!RESPONSES_API_ALLOWLIST.has(key)) {
      delete next[key];
    }
  }

  return next;
}
