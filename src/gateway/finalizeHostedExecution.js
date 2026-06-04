import { buildErrorBody } from "../vendor/9router/open-sse/utils/error.js";
import { createHostedJsonResponse } from "../vendor/9router/open-sse/handlers/chatCore/nonStreamingHandler.js";

export function finalizeHostedSuccess({ result, requestLogger }) {
  requestLogger?.logConvertedResponse?.(result.response);

  return {
    success: true,
    status: 200,
    response: createHostedJsonResponse(result.response, 200),
  };
}

export function finalizeHostedError({ error, requestLogger, translatedRequest }) {
  requestLogger?.logError(error, translatedRequest);

  if (error?.payload?.error?.type === "invalid_request_error") {
    return {
      success: false,
      status: 400,
      error: error.payload.error.message,
      response: createHostedJsonResponse(error.payload, 400),
    };
  }

  const status = error?.statusCode ?? 502;
  const payload = error?.payload ?? buildErrorBody(status, error?.message ?? String(error));
  return {
    success: false,
    status,
    error: payload?.error?.message ?? error?.message ?? String(error),
    response: createHostedJsonResponse(payload, status),
  };
}
