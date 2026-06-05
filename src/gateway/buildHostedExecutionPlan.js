import { detectRequestFormat, translateRequest } from "../translator/index.js";
import { createRequestLogger } from "../vendor/9router/open-sse/utils/requestLogger.js";
import { resolveHostedProvider } from "../providers/shared/providerRegistry.js";
import { resolveExecutionRouting } from "./governedRouting.js";

export async function buildHostedExecutionPlan({
  body,
  execution = {},
  adapter,
  request = {},
  routing = null,
}) {
  const model = body?.model;
  if (!model) {
    throw new Error("Chat request is missing model");
  }

  const resolvedExecution = resolveExecutionRouting({
    execution,
    routing,
  });
  const provider = resolvedExecution.provider;
  const providerEntry = resolveHostedProvider(provider);
  const sourceFormat = detectRequestFormat(request.path ?? "/v1/chat/completions", body);
  const requestLogger = await createRequestLogger(sourceFormat, providerEntry.targetFormat, model, adapter);

  requestLogger.logClientRawRequest(request.path ?? "/v1/chat/completions", body, request.headers ?? {});
  requestLogger.logRawRequest(body, request.headers ?? {});

  const translatedRequest = translateRequest({
    sourceFormat,
    targetFormat: providerEntry.targetFormat,
    model,
    body,
    stream: body.stream === true,
    requestLogger,
  });

  return {
    model,
    provider,
    baseUrl: resolvedExecution.baseUrl,
    executionSource: resolvedExecution.source,
    providerEntry,
    requestLogger,
    translatedRequest,
    routing,
  };
}
