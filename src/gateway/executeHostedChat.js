import { createHostAdapter } from "../adapters/createHostAdapter.js";
import { handleHostedChatCore } from "../vendor/9router/open-sse/handlers/chatCore.js";

export async function executeHostedChat({
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  execution = {},
  log,
  connectionId = null,
  request = {},
}) {
  const result = await handleHostedChatCore({
    body,
    adapter,
    fetchFn,
    execution,
    log,
    connectionId,
    request,
  });

  if (!result.success) {
    const payload = await result.response.json();
    const error = new Error(result.error || payload?.error?.message || "Hosted chat failed");
    error.payload = payload;
    error.statusCode = result.status;
    throw error;
  }

  const payload = await result.response.json();
  return {
    response: payload,
  };
}
