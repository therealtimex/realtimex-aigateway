import { DEFAULT_ERROR_MESSAGES, ERROR_TYPES } from "../config/errorConfig.js";

export function buildErrorBody(statusCode, message) {
  const errorInfo =
    ERROR_TYPES[statusCode] ||
    (statusCode >= 500
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  return {
    error: {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code,
    },
  };
}

export function errorResponse(statusCode, message) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg =
          parsed.message ||
          DEFAULT_ERROR_MESSAGES[response.status] ||
          `Upstream error: ${response.status}`;
        return { statusCode: parsed.status || response.status, message: msg, resetsAtMs: parsed.resetsAtMs };
      }
    } catch {}
  }

  let message = "";
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
  } catch {
    message = bodyText;
  }

  const messageString = typeof message === "string" ? message : JSON.stringify(message);
  return {
    statusCode: response.status,
    message: messageString || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`,
  };
}

export function createErrorResult(statusCode, message, resetsAtMs) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, message),
  };
}

export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = error.message || "Unknown error";
  const causeCode = error.cause?.code;
  const causeMessage = error.cause?.message;
  const causeString =
    causeCode || causeMessage
      ? ` (cause: ${[causeCode, causeMessage].filter(Boolean).join(": ")})`
      : "";
  return `[${code}]: ${message}${causeString}`;
}
