import { buildHostedExecutionPlan } from "../../../../gateway/buildHostedExecutionPlan.js";
import { createErrorResult } from "../utils/error.js";
import { finalizeHostedSuccess, finalizeHostedError } from "../../../../gateway/finalizeHostedExecution.js";

export async function handleHostedChatCore({
  body,
  execution = {},
  adapter,
  fetchFn,
  log,
  connectionId = null,
  request = {},
  routing = null,
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
      routing,
    });
  } catch (error) {
    return createErrorResult(400, error.message);
  }

  const { provider, requestLogger, translatedRequest, providerEntry, baseUrl } = plan;

  try {
    const result = await providerEntry.runner({
      model,
      body,
      adapter,
      fetchFn,
      stream: body.stream === true,
      log,
      connectionId,
      baseUrl,
      translatedRequest,
      requestLogger,
    });

    return finalizeHostedSuccess({
      result,
      requestLogger,
    });
  } catch (error) {
    return finalizeHostedError({
      error,
      requestLogger,
      translatedRequest,
    });
  }
}
