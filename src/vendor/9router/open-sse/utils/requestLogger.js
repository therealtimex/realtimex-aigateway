function createNoOpLogger() {
  return {
    sessionPath: null,
    logClientRawRequest() {},
    logRawRequest() {},
    logOpenAIRequest() {},
    logTargetRequest() {},
    logProviderResponse() {},
    appendProviderChunk() {},
    appendOpenAIChunk() {},
    logConvertedResponse() {},
    appendConvertedChunk() {},
    logError() {},
  };
}

function sanitizeHeaders(headers = {}) {
  const result = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "authorization") {
      result[key] = typeof value === "string" ? `${value.slice(0, 12)}...` : value;
      continue;
    }
    result[key] = value;
  }

  return result;
}

function emit(adapter, stage, payload) {
  adapter?.onLifecycleEvent?.({
    type: "request-log",
    stage,
    ...payload,
  });
}

export async function createRequestLogger(sourceFormat, targetFormat, model, adapter = null) {
  if (!adapter?.onLifecycleEvent) {
    return createNoOpLogger();
  }

  const basePayload = {
    sourceFormat,
    targetFormat,
    model,
  };

  return {
    sessionPath: null,
    logClientRawRequest(endpoint, body, headers = {}) {
      emit(adapter, "client-raw-request", {
        ...basePayload,
        endpoint,
        headers: sanitizeHeaders(headers),
        body,
      });
    },
    logRawRequest(body, headers = {}) {
      emit(adapter, "source-request", {
        ...basePayload,
        headers: sanitizeHeaders(headers),
        body,
      });
    },
    logOpenAIRequest(body) {
      emit(adapter, "openai-request", {
        ...basePayload,
        body,
      });
    },
    logTargetRequest(url, headers, body) {
      emit(adapter, "target-request", {
        ...basePayload,
        url,
        headers: sanitizeHeaders(headers),
        body,
      });
    },
    logProviderResponse(status, statusText, headers, body) {
      emit(adapter, "provider-response", {
        ...basePayload,
        status,
        statusText,
        headers,
        body,
      });
    },
    appendProviderChunk(chunk) {
      emit(adapter, "provider-chunk", {
        ...basePayload,
        chunk,
      });
    },
    appendOpenAIChunk(chunk) {
      emit(adapter, "openai-chunk", {
        ...basePayload,
        chunk,
      });
    },
    logConvertedResponse(body) {
      emit(adapter, "client-response", {
        ...basePayload,
        body,
      });
    },
    appendConvertedChunk(chunk) {
      emit(adapter, "client-chunk", {
        ...basePayload,
        chunk,
      });
    },
    logError(error, requestBody = null) {
      emit(adapter, "error", {
        ...basePayload,
        error: error?.message || String(error),
        stack: error?.stack,
        requestBody,
      });
    },
  };
}
