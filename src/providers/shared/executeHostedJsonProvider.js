import { createHostAdapter } from "../../adapters/createHostAdapter.js";
import { hasValidUsage, normalizeUsage } from "../../vendor/9router/open-sse/utils/usageTracking.js";

export async function executeHostedJsonProvider({
  provider,
  model,
  body,
  adapter = createHostAdapter(),
  fetchFn = fetch,
  log,
  connectionId = null,
  requestLogger = null,
  getCredentials,
  isCredentialsValid,
  getRequestState,
  shouldRefresh,
  refreshCredentials,
  normalizeResponse,
  getUsage,
  getUsageProvider,
  getUpstreamProvider,
}) {
  const credentials =
    (await getCredentials?.({ provider, model, body, connectionId, adapter })) ||
    (await adapter.getProviderCredentials({
      provider,
      model,
      body,
      connectionId,
    }));

  if (!isCredentialsValid(credentials)) {
    throw new Error(`Missing ${provider} credentials`);
  }

  let activeCredentials = credentials;
  let state = await getRequestState({
    credentials: activeCredentials,
    body,
    model,
    connectionId,
    requestLogger,
    stream: false,
  });

  await adapter.emitTrace({
    stage: "dispatch",
    provider: state.traceProvider || provider,
    model,
    connectionId,
    url: state.url,
  });

  let response = await fetchFn(state.url, {
    method: "POST",
    headers: state.headers,
    body: JSON.stringify(state.requestBody),
  });

  if (shouldRefresh?.({ response, credentials: activeCredentials })) {
    const refreshed = await refreshCredentials?.({
      adapter,
      credentials: activeCredentials,
      log,
      response,
      state,
    });

    if (refreshed && isCredentialsValid({ ...activeCredentials, ...refreshed })) {
      activeCredentials = {
        ...activeCredentials,
        ...refreshed,
      };
      state = await getRequestState({
        credentials: activeCredentials,
        body,
        model,
        connectionId,
        requestLogger,
        stream: false,
      });
      response = await fetchFn(state.url, {
        method: "POST",
        headers: state.headers,
        body: JSON.stringify(state.requestBody),
      });
    }
  }

  const responseJson = await response.json();
  requestLogger?.logProviderResponse?.(response.status, response.statusText ?? "", {}, responseJson);

  await adapter.emitTrace({
    stage: "provider-response",
    provider: state.traceProvider || provider,
    model,
    connectionId,
    status: response.status,
    url: state.url,
  });

  if (!response.ok) {
    throw new Error(
      responseJson?.error?.message ??
        responseJson?.message ??
        `${provider} upstream failed with status ${response.status}`,
    );
  }

  const normalized = await normalizeResponse({
    responseJson,
    model,
    body,
    credentials: activeCredentials,
    state,
  });

  const rawUsage = getUsage ? getUsage({ responseJson, normalized, state, credentials: activeCredentials }) : normalized?.usage;
  const normalizedUsage = normalizeUsage(rawUsage);
  if (hasValidUsage(normalizedUsage)) {
    await adapter.emitUsage({
      provider: getUsageProvider?.({ state, responseJson, normalized, credentials: activeCredentials }) || provider,
      model,
      connectionId,
      usage: normalizedUsage,
    });
  }

  return {
    upstream: {
      provider: getUpstreamProvider?.({ state, responseJson, normalized, credentials: activeCredentials }) || provider,
      url: state.url,
      status: response.status,
    },
    response: normalized,
  };
}
