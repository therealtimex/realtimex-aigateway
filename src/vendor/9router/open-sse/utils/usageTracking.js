import { FORMATS } from "../translator/formats.js";

export const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
};

const BUFFER_TOKENS = 2000;

export function addBufferToUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return usage;
  }

  const result = { ...usage };

  if (result.input_tokens !== undefined) {
    result.input_tokens += BUFFER_TOKENS;
  }

  if (result.prompt_tokens !== undefined) {
    result.prompt_tokens += BUFFER_TOKENS;
  }

  if (result.total_tokens !== undefined) {
    result.total_tokens += BUFFER_TOKENS;
  } else if (result.prompt_tokens !== undefined && result.completion_tokens !== undefined) {
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }

  return result;
}

export function filterUsageForFormat(usage, targetFormat) {
  if (!usage || typeof usage !== "object") {
    return usage;
  }

  const pickFields = (fields) => {
    const filtered = {};
    for (const field of fields) {
      if (usage[field] !== undefined) {
        filtered[field] = usage[field];
      }
    }
    return filtered;
  };

  const formatFields = {
    [FORMATS.CLAUDE]: [
      "input_tokens",
      "output_tokens",
      "cache_read_input_tokens",
      "cache_creation_input_tokens",
      "estimated",
    ],
    [FORMATS.GEMINI]: [
      "promptTokenCount",
      "candidatesTokenCount",
      "totalTokenCount",
      "cachedContentTokenCount",
      "thoughtsTokenCount",
      "estimated",
    ],
    default: [
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "cached_tokens",
      "reasoning_tokens",
      "prompt_tokens_details",
      "completion_tokens_details",
      "estimated",
    ],
  };

  let fields = formatFields[targetFormat];
  if (targetFormat === FORMATS.GEMINI_CLI || targetFormat === FORMATS.ANTIGRAVITY) {
    fields = formatFields[FORMATS.GEMINI];
  } else if (!fields) {
    fields = formatFields.default;
  }

  return pickFields(fields);
}

export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return null;
  }

  const normalized = {};
  const assignNumber = (key, value) => {
    if (value === undefined || value === null) {
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      normalized[key] = numeric;
    }
  };

  assignNumber("prompt_tokens", usage.prompt_tokens);
  assignNumber("completion_tokens", usage.completion_tokens);
  assignNumber("total_tokens", usage.total_tokens);
  assignNumber("cache_read_input_tokens", usage.cache_read_input_tokens);
  assignNumber("cache_creation_input_tokens", usage.cache_creation_input_tokens);
  assignNumber("cached_tokens", usage.cached_tokens);
  assignNumber("reasoning_tokens", usage.reasoning_tokens);

  if (usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object") {
    normalized.prompt_tokens_details = usage.prompt_tokens_details;
  }
  if (usage.completion_tokens_details && typeof usage.completion_tokens_details === "object") {
    normalized.completion_tokens_details = usage.completion_tokens_details;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function hasValidUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return false;
  }

  const tokenFields = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "input_tokens",
    "output_tokens",
    "promptTokenCount",
    "candidatesTokenCount",
  ];

  return tokenFields.some((field) => typeof usage[field] === "number" && usage[field] > 0);
}

export function extractUsage(chunk) {
  if (!chunk || typeof chunk !== "object") {
    return null;
  }

  if (chunk.type === "message_delta" && chunk.usage && typeof chunk.usage === "object") {
    return normalizeUsage({
      prompt_tokens: chunk.usage.input_tokens || 0,
      completion_tokens: chunk.usage.output_tokens || 0,
      cache_read_input_tokens: chunk.usage.cache_read_input_tokens,
      cache_creation_input_tokens: chunk.usage.cache_creation_input_tokens,
    });
  }

  if (chunk.usage && typeof chunk.usage === "object" && chunk.usage.prompt_tokens !== undefined) {
    return normalizeUsage({
      prompt_tokens: chunk.usage.prompt_tokens,
      completion_tokens: chunk.usage.completion_tokens || 0,
      cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens || chunk.usage.prompt_cache_hit_tokens,
      reasoning_tokens: chunk.usage.completion_tokens_details?.reasoning_tokens,
      prompt_tokens_details: chunk.usage.prompt_tokens_details,
      completion_tokens_details: chunk.usage.completion_tokens_details,
    });
  }

  const usageMetadata = chunk.usageMetadata || chunk.response?.usageMetadata;
  if (usageMetadata && typeof usageMetadata === "object") {
    return normalizeUsage({
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount,
      cached_tokens: usageMetadata.cachedContentTokenCount,
      reasoning_tokens: usageMetadata.thoughtsTokenCount,
    });
  }

  if (chunk.done === true && typeof chunk.prompt_eval_count === "number") {
    return normalizeUsage({
      prompt_tokens: chunk.prompt_eval_count || 0,
      completion_tokens: chunk.eval_count || 0,
      total_tokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
    });
  }

  return null;
}

export function estimateInputTokens(body) {
  if (!body || typeof body !== "object") {
    return 0;
  }

  try {
    return Math.ceil(JSON.stringify(body).length / 4);
  } catch {
    return 0;
  }
}

export function estimateOutputTokens(contentLength) {
  if (!contentLength || contentLength <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(contentLength / 4));
}

export function formatUsage(inputTokens, outputTokens, targetFormat) {
  if (targetFormat === FORMATS.CLAUDE) {
    return addBufferToUsage({
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated: true,
    });
  }

  return addBufferToUsage({
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated: true,
  });
}

export function estimateUsage(body, contentLength, targetFormat = FORMATS.OPENAI) {
  return formatUsage(estimateInputTokens(body), estimateOutputTokens(contentLength), targetFormat);
}

export function logUsage(provider, usage, model = null, connectionId = null) {
  if (!usage || typeof usage !== "object") {
    return;
  }

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const accountPrefix = connectionId ? `${connectionId.slice(0, 8)}...` : "unknown";
  const upperProvider = provider?.toUpperCase() || "UNKNOWN";
  const estimatedSuffix = usage.estimated ? " estimated" : "";
  console.log(
    `${COLORS.green}[USAGE] ${upperProvider} | in=${inputTokens} | out=${outputTokens} | account=${accountPrefix}${estimatedSuffix}${COLORS.reset}`,
  );
  if (model) {
    console.log(`${COLORS.green}[USAGE] model=${model}${COLORS.reset}`);
  }
}
