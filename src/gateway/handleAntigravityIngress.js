import { FORMATS, translateRequest } from "../translator/index.js";
import { handleHostedChatCore } from "../vendor/9router/open-sse/handlers/chatCore.js";
import { createHostedJsonResponse } from "../vendor/9router/open-sse/handlers/chatCore/nonStreamingHandler.js";
import { buildErrorBody } from "../vendor/9router/open-sse/utils/error.js";
import { openAIResponseToAntigravityResult } from "../providers/antigravity/openaiToAntigravityResult.js";

function createSseResponse(payload, status = 200) {
  return new Response(`data: ${JSON.stringify(payload)}\r\n\r\n`, {
    status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleAntigravityIngress({
  body,
  adapter,
  fetchFn,
  execution = {},
  request = {},
  stream = false,
}) {
  const model = body?.model;
  if (!model) {
    const payload = buildErrorBody(400, "Antigravity request is missing model");
    return {
      success: false,
      status: 400,
      response: stream ? createSseResponse(payload, 200) : createHostedJsonResponse(payload, 400),
    };
  }

  const hostedBody = translateRequest({
    sourceFormat: FORMATS.ANTIGRAVITY,
    targetFormat: FORMATS.OPENAI,
    model,
    body,
    stream: false,
  });

  const hostedResult = await handleHostedChatCore({
    body: hostedBody,
    adapter,
    fetchFn,
    execution,
    request: {
      path: "/v1/chat/completions",
      headers: request.headers ?? {},
    },
  });

  if (!hostedResult.success) {
    if (stream) {
      const payload = await hostedResult.response.json();
      return {
        success: false,
        status: hostedResult.status,
        response: createSseResponse(payload, 200),
      };
    }

    return hostedResult;
  }

  const openAIResponse = await hostedResult.response.json();
  const antigravityPayload = openAIResponseToAntigravityResult(openAIResponse);

  return {
    success: true,
    status: 200,
    response: stream
      ? createSseResponse(antigravityPayload, 200)
      : createHostedJsonResponse(antigravityPayload, 200),
  };
}
