import { createHostAdapter } from "../adapters/createHostAdapter.js";
import { executeGeminiChat } from "../providers/gemini/executeGeminiChat.js";

export async function executeHostedChat({
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  execution = {},
  log,
  connectionId = null,
}) {
  const model = body?.model;
  if (!model) {
    throw new Error("Chat request is missing model");
  }

  const provider = execution.provider ?? "gemini-cli";

  if (provider !== "gemini-cli") {
    throw new Error(`Unsupported execution provider: ${provider}`);
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
  });
}
