import { FORMATS, detectFormatByEndpoint } from "../vendor/9router/open-sse/translator/formats.js";
import { filterToOpenAIFormat } from "../vendor/9router/open-sse/translator/helpers/openaiHelper.js";
import {
  ensureToolCallIds,
  fixMissingToolResponses,
} from "../vendor/9router/open-sse/translator/helpers/toolCallHelper.js";
import {
  openaiToGeminiCLIRequest,
  openaiToGeminiRequest,
} from "../vendor/9router/open-sse/translator/request/openai-to-gemini.js";

const requestRegistry = new Map();

function registerRequest(from, to, translator) {
  requestRegistry.set(`${from}:${to}`, translator);
}

registerRequest(FORMATS.OPENAI, FORMATS.GEMINI, openaiToGeminiRequest);
registerRequest(FORMATS.OPENAI, FORMATS.GEMINI_CLI, openaiToGeminiCLIRequest);

function normalizeThinkingConfig(body) {
  if (!body?.thinking || !Array.isArray(body.messages) || body.messages.length === 0) {
    return;
  }

  const lastMessage = body.messages[body.messages.length - 1];
  if (lastMessage?.role !== "user") {
    delete body.thinking;
    delete body.reasoning_effort;
  }
}

export function detectRequestFormat(pathname, body) {
  const endpointDetected = detectFormatByEndpoint(pathname, body);
  if (endpointDetected) {
    return endpointDetected;
  }

  if (body?.request?.contents && body?.userAgent === "antigravity") {
    return FORMATS.ANTIGRAVITY;
  }

  if (Array.isArray(body?.contents)) {
    return FORMATS.GEMINI;
  }

  if (body?.input && (Array.isArray(body.input) || typeof body.input === "string") && !body.messages) {
    return FORMATS.OPENAI_RESPONSES;
  }

  return FORMATS.OPENAI;
}

export function translateRequest({
  sourceFormat,
  targetFormat,
  model,
  body,
  stream = true,
  requestLogger = null,
}) {
  const result = structuredClone(body);

  normalizeThinkingConfig(result);
  ensureToolCallIds(result);
  fixMissingToolResponses(result);

  let translated = result;

  if (sourceFormat !== targetFormat) {
    if (sourceFormat !== FORMATS.OPENAI) {
      throw new Error(`Unsupported source format: ${sourceFormat}`);
    }

    const translator = requestRegistry.get(`${FORMATS.OPENAI}:${targetFormat}`);
    if (!translator) {
      throw new Error(`No request translator registered for ${sourceFormat} -> ${targetFormat}`);
    }

    requestLogger?.logOpenAIRequest?.(translated);
    translated = translator(model, translated, stream);
  } else if (targetFormat === FORMATS.OPENAI) {
    translated = filterToOpenAIFormat(translated);
  }

  return translated;
}

export function needsTranslation(sourceFormat, targetFormat) {
  return sourceFormat !== targetFormat;
}

export function initState(sourceFormat = FORMATS.OPENAI) {
  return {
    sourceFormat,
    messageId: null,
    model: null,
    usage: null,
    finishReason: null,
    finishReasonSent: false,
    contentBlockIndex: -1,
    toolCalls: new Map(),
  };
}

export { FORMATS };
