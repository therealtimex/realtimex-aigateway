import { buildHostedExecutionPlan } from "../../../../gateway/buildHostedExecutionPlan.js";
import { createErrorResult, buildErrorBody } from "../utils/error.js";
import { handleHostedNonStreamingResponse } from "./chatCore/nonStreamingHandler.js";

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

  let plan;
  try {
    plan = await buildHostedExecutionPlan({
      body,
      execution,
      adapter,
      request,
    });
  } catch (error) {
    return createErrorResult(400, error.message);
  }

  const { provider, requestLogger, translatedRequest, providerEntry } = plan;

  try {
    const result = await providerEntry.runner({
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
