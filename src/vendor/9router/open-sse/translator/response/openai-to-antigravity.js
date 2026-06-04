export function openaiToAntigravityResponse(chunk, state) {
  if (!chunk) {
    return null;
  }

  const choice = chunk.choices?.[0];
  if (!choice) {
    if (chunk.usage) {
      state._usage = chunk.usage;
    }
    return null;
  }

  const delta = choice.delta || {};
  const finishReason = choice.finish_reason;

  if (!state._toolCallAccum) {
    state._toolCallAccum = {};
  }
  if (!state._responseId) {
    state._responseId = chunk.id || `resp_${Date.now()}`;
  }
  if (!state._modelVersion) {
    state._modelVersion = chunk.model || "";
  }

  const parts = [];

  if (delta.reasoning_content) {
    parts.push({ thought: true, text: delta.reasoning_content });
  }

  if (delta.content) {
    parts.push({ text: delta.content });
  }

  if (delta.tool_calls) {
    for (const toolCall of delta.tool_calls) {
      const idx = toolCall.index ?? 0;
      if (!state._toolCallAccum[idx]) {
        state._toolCallAccum[idx] = { id: "", name: "", arguments: "" };
      }
      const accum = state._toolCallAccum[idx];
      if (toolCall.id) {
        accum.id = toolCall.id;
      }
      if (toolCall.function?.name) {
        accum.name += toolCall.function.name;
      }
      if (toolCall.function?.arguments) {
        accum.arguments += toolCall.function.arguments;
      }
    }
    if (parts.length === 0 && !finishReason) {
      return null;
    }
  }

  if (finishReason) {
    const indices = Object.keys(state._toolCallAccum);
    for (const idx of indices) {
      const accum = state._toolCallAccum[idx];
      let args = {};
      try {
        args = JSON.parse(accum.arguments);
      } catch {}
      const originalName = state.toolNameMap?.get(accum.name) || accum.name;
      parts.push({
        functionCall: {
          name: originalName,
          args,
        },
      });
    }
  }

  if (parts.length === 0 && !finishReason) {
    return null;
  }

  if (parts.length === 0 && finishReason) {
    parts.push({ text: "" });
  }

  const candidate = {
    content: {
      role: "model",
      parts,
    },
  };

  if (finishReason) {
    const reasonMap = {
      stop: "STOP",
      length: "MAX_TOKENS",
      tool_calls: "STOP",
      content_filter: "SAFETY",
    };
    candidate.finishReason = reasonMap[finishReason] || "STOP";
  }

  const response = {
    candidates: [candidate],
    modelVersion: state._modelVersion,
    responseId: state._responseId,
  };

  const usage = chunk.usage || state._usage;
  if (usage) {
    response.usageMetadata = {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
    };
    if (usage.completion_tokens_details?.reasoning_tokens) {
      response.usageMetadata.thoughtsTokenCount = usage.completion_tokens_details.reasoning_tokens;
    }
    if (usage.prompt_tokens_details?.cached_tokens) {
      response.usageMetadata.cachedContentTokenCount = usage.prompt_tokens_details.cached_tokens;
    }
  }

  return { response };
}
