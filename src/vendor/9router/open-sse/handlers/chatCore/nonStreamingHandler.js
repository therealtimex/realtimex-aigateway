export function createHostedJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function handleHostedNonStreamingResponse({ result, requestLogger }) {
  requestLogger?.logConvertedResponse?.(result.response);

  return {
    success: true,
    status: 200,
    response: createHostedJsonResponse(result.response, 200),
  };
}
