import { executeGeminiChat } from "../../../../providers/gemini/executeGeminiChat.js";
import { executeQwenChat } from "../../../../providers/qwen/executeQwenChat.js";
import { executeClaudeChat } from "../../../../providers/claude/executeClaudeChat.js";
import { FORMATS, detectRequestFormat, translateRequest } from "../../../../translator/index.js";
import { createErrorResult, buildErrorBody } from "../utils/error.js";
import { createRequestLogger } from "../utils/requestLogger.js";
import { handleHostedNonStreamingResponse } from "./chatCore/nonStreamingHandler.js";

function resolveTargetFormat(provider) {
  switch (provider) {
    case "gemini-cli":
      return FORMATS.GEMINI_CLI;
    case "gemini":
      return FORMATS.GEMINI;
    case "qwen":
      return FORMATS.OPENAI;
    case "claude":
      return FORMATS.CLAUDE;
    default:
      throw new Error(`Unsupported execution provider: ${provider}`);
  }
}

function resolveProviderRunner(provider) {
  switch (provider) {
    case "gemini-cli":
      return executeGeminiChat;
    case "qwen":
      return executeQwenChat;
    case "claude":
      return executeClaudeChat;
    default:
      throw new Error(`Unsupported execution provider: ${provider}`);
  }
}

export async function handleHostedChatCore({
  body,
  execution = {},
  adapter,
  fetchFn,
  log,
  connectionId = null,
  request = {},
}) {
  const model = body?.model;
  if (!model) {
    return createErrorResult(400, "Chat request is missing model");
  }

  const provider = execution.provider ?? "gemini-cli";
  let targetFormat;

  try {
    targetFormat = resolveTargetFormat(provider);
  } catch (error) {
    return createErrorResult(400, error.message);
  }

  const sourceFormat = detectRequestFormat(request.path ?? "/v1/chat/completions", body);
  const requestLogger = await createRequestLogger(sourceFormat, targetFormat, model, adapter);

  requestLogger.logClientRawRequest(request.path ?? "/v1/chat/completions", body, request.headers ?? {});
  requestLogger.logRawRequest(body, request.headers ?? {});

  let translatedRequest;
  try {
    translatedRequest = translateRequest({
      sourceFormat,
      targetFormat,
      model,
      body,
      stream: body.stream === true,
      requestLogger,
    });
  } catch (error) {
    requestLogger.logError(error, body);
    return createErrorResult(400, error.message);
  }

  let runProvider;
  try {
    runProvider = resolveProviderRunner(provider);
  } catch (error) {
    requestLogger.logError(error, translatedRequest);
    return createErrorResult(400, error.message);
  }

  try {
    const result = await runProvider({
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

    return handleHostedNonStreamingResponse({
      result,
      requestLogger,
    });
  } catch (error) {
    requestLogger.logError(error, translatedRequest);
    if (error?.payload?.error?.type === "invalid_request_error") {
      return {
        success: false,
        status: 400,
        error: error.payload.error.message,
        response: new Response(JSON.stringify(error.payload), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
      };
    }

    const status = error?.statusCode ?? 502;
    const payload = error?.payload ?? buildErrorBody(status, error?.message ?? String(error));
    return {
      success: false,
      status,
      error: payload?.error?.message ?? error?.message ?? String(error),
      response: new Response(JSON.stringify(payload), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }),
    };
  }
}
