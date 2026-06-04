import { createHostAdapter } from "../adapters/createHostAdapter.js";
import { executeGeminiChat } from "../providers/gemini/executeGeminiChat.js";
import {
  createRequestLogger,
} from "../vendor/9router/open-sse/utils/requestLogger.js";
import { buildErrorBody } from "../vendor/9router/open-sse/utils/error.js";
import { detectRequestFormat, FORMATS, translateRequest } from "../translator/index.js";

function resolveTargetFormat(provider) {
  switch (provider) {
    case "gemini-cli":
      return FORMATS.GEMINI_CLI;
    case "gemini":
      return FORMATS.GEMINI;
    default:
      throw new Error(`Unsupported execution provider: ${provider}`);
  }
}

export async function executeHostedChat({
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  execution = {},
  log,
  connectionId = null,
  request = {},
}) {
  const model = body?.model;
  if (!model) {
    throw new Error("Chat request is missing model");
  }

  const provider = execution.provider ?? "gemini-cli";
  const targetFormat = resolveTargetFormat(provider);
  const sourceFormat = detectRequestFormat(request.path ?? "/v1/chat/completions", body);
  const requestLogger = await createRequestLogger(sourceFormat, targetFormat, model, adapter);

  requestLogger.logClientRawRequest(request.path ?? "/v1/chat/completions", body, request.headers ?? {});
  requestLogger.logRawRequest(body, request.headers ?? {});
  const translatedRequest = translateRequest({
    sourceFormat,
    targetFormat,
    model,
    body,
    stream: body.stream === true,
    requestLogger,
  });

  if (provider !== "gemini-cli") {
    const error = new Error(`Unsupported execution provider: ${provider}`);
    error.payload = buildErrorBody(400, error.message);
    throw error;
  }

  return executeGeminiChat({
    model,
    body,
    adapter,
    fetchFn,
    stream: body.stream === true,
    log,
    connectionId,
    baseUrl: execution.baseUrl,
    translatedRequest,
    requestLogger,
  });
}
