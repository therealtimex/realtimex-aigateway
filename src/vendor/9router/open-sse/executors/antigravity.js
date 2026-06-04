import crypto from "node:crypto";

import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import {
  OAUTH_ENDPOINTS,
  ANTIGRAVITY_HEADERS,
  INTERNAL_REQUEST_HEADER,
} from "../config/appConstants.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { deriveSessionId } from "../utils/sessionManager.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { cleanJSONSchemaForAntigravity } from "../translator/helpers/geminiHelper.js";

function sanitizeFunctionName(name) {
  if (!name) {
    return "_unknown";
  }
  let value = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(value)) {
    value = `_${value}`;
  }
  return value.substring(0, 64);
}

const MAX_RETRY_AFTER_MS = 10000;
const MAX_ANTIGRAVITY_OUTPUT_TOKENS = 16384;

export class AntigravityExecutor extends BaseExecutor {
  constructor() {
    super("antigravity", PROVIDERS.antigravity);
  }

  buildUrl(model, stream, urlIndex = 0) {
    const baseUrls = this.getBaseUrls();
    const baseUrl = baseUrls[urlIndex] || baseUrls[0];
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${baseUrl}/v1internal:${action}`;
  }

  buildHeaders(credentials, stream = true, sessionId = null) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.accessToken}`,
      "User-Agent": this.config.headers?.["User-Agent"] || ANTIGRAVITY_HEADERS["User-Agent"],
      [INTERNAL_REQUEST_HEADER.name]: INTERNAL_REQUEST_HEADER.value,
      ...(sessionId && { "X-Machine-Session-Id": sessionId }),
      Accept: stream ? "text/event-stream" : "application/json",
    };
  }

  transformRequest(model, body) {
    const projectId = body.project || this.generateProjectId();
    const contents = body.request?.contents?.map((content) => {
      let role = content.role;
      if (content.parts?.some((part) => part.functionResponse)) {
        role = "user";
      }
      const parts = content.parts?.filter((part) => {
        if (part.thought && !part.functionCall) {
          return false;
        }
        if (part.thoughtSignature && !part.functionCall && !part.text) {
          return false;
        }
        return true;
      });
      if (role !== content.role || parts?.length !== content.parts?.length) {
        return { ...content, role, parts };
      }
      return content;
    });

    let tools = body.request?.tools;
    if (tools && tools.length > 0) {
      const declarations = tools.flatMap((group) =>
        (group.functionDeclarations || []).map((func) => ({
          ...func,
          name: sanitizeFunctionName(func.name),
          parameters: func.parameters
            ? cleanJSONSchemaForAntigravity(structuredClone(func.parameters))
            : {
                type: "object",
                properties: { reason: { type: "string", description: "Brief explanation" } },
                required: ["reason"],
              },
        })),
      );
      tools = declarations.length > 0 ? [{ functionDeclarations: declarations }] : [];
    }

    const { tools: _tools, toolConfig: _toolConfig, ...requestWithoutTools } = body.request || {};
    const generationConfig = { ...(requestWithoutTools.generationConfig || {}) };
    if (generationConfig.maxOutputTokens > MAX_ANTIGRAVITY_OUTPUT_TOKENS) {
      generationConfig.maxOutputTokens = MAX_ANTIGRAVITY_OUTPUT_TOKENS;
    }

    return {
      ...body,
      project: projectId,
      model,
      userAgent: "antigravity",
      requestType: "agent",
      requestId: `agent-${crypto.randomUUID()}`,
      request: {
        ...requestWithoutTools,
        generationConfig,
        ...(contents && { contents }),
        ...(tools && { tools }),
        sessionId:
          body.request?.sessionId || deriveSessionId(body.email || body.connectionId),
        safetySettings: undefined,
        ...(tools?.length > 0 && {
          toolConfig: { functionCallingConfig: { mode: "VALIDATED" } },
        }),
      },
    };
  }

  async refreshCredentials(credentials, log, proxyOptions = null) {
    if (!credentials.refreshToken) {
      return null;
    }

    try {
      const response = await proxyAwareFetch(
        OAUTH_ENDPOINTS.google.token,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: credentials.refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
          }),
        },
        proxyOptions,
      );

      if (!response.ok) {
        return null;
      }

      const tokens = await response.json();
      log?.info?.("TOKEN", "Antigravity refreshed");

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || credentials.refreshToken,
        expiresIn: tokens.expires_in,
        projectId: credentials.projectId,
      };
    } catch (error) {
      log?.error?.("TOKEN", `Antigravity refresh error: ${error.message}`);
      return null;
    }
  }

  generateProjectId() {
    const adjectives = ["useful", "bright", "swift", "calm", "bold"];
    const nouns = ["fuze", "wave", "spark", "flow", "core"];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}-${noun}-${crypto.randomUUID().slice(0, 5)}`;
  }

  parseRetryHeaders(headers) {
    if (!headers?.get) {
      return null;
    }

    const retryAfter = headers.get("retry-after");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }

      const date = new Date(retryAfter);
      if (!Number.isNaN(date.getTime())) {
        const diff = date.getTime() - Date.now();
        return diff > 0 ? diff : null;
      }
    }

    const resetAfter = headers.get("x-ratelimit-reset-after");
    if (resetAfter) {
      const seconds = parseInt(resetAfter, 10);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }

    const resetTimestamp = headers.get("x-ratelimit-reset");
    if (resetTimestamp) {
      const ts = parseInt(resetTimestamp, 10) * 1000;
      const diff = ts - Date.now();
      return diff > 0 ? diff : null;
    }

    return null;
  }

  parseRetryFromErrorMessage(errorMessage) {
    if (!errorMessage || typeof errorMessage !== "string") {
      return null;
    }

    const match = errorMessage.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
    if (!match) {
      return null;
    }

    let totalMs = 0;
    if (match[1]) {
      totalMs += parseInt(match[1], 10) * 3600 * 1000;
    }
    if (match[2]) {
      totalMs += parseInt(match[2], 10) * 60 * 1000;
    }
    if (match[3]) {
      totalMs += parseInt(match[3], 10) * 1000;
    }

    return totalMs > 0 ? totalMs : null;
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const fallbackCount = this.getFallbackCount();
    let lastError = null;
    let lastStatus = 0;
    const MAX_AUTO_RETRIES = 3;
    const MAX_RETRY_AFTER_RETRIES = 3;
    const retryAttemptsByUrl = {};
    const retryAfterAttemptsByUrl = {};

    for (let urlIndex = 0; urlIndex < fallbackCount; urlIndex++) {
      const url = this.buildUrl(model, stream, urlIndex);
      const transformedBody = this.transformRequest(model, body);
      const sessionId = transformedBody.request?.sessionId;
      const headers = this.buildHeaders(credentials, stream, sessionId);

      if (!retryAttemptsByUrl[urlIndex]) {
        retryAttemptsByUrl[urlIndex] = 0;
      }
      if (!retryAfterAttemptsByUrl[urlIndex]) {
        retryAfterAttemptsByUrl[urlIndex] = 0;
      }

      try {
        const response = await proxyAwareFetch(
          url,
          {
            method: "POST",
            headers,
            body: JSON.stringify(transformedBody),
            signal,
          },
          proxyOptions,
        );

        if (response.status === HTTP_STATUS.RATE_LIMITED || response.status === HTTP_STATUS.SERVICE_UNAVAILABLE) {
          let retryMs = this.parseRetryHeaders(response.headers);

          if (!retryMs) {
            try {
              const errorBody = await response.clone().text();
              const errorJson = JSON.parse(errorBody);
              const errorMessage = errorJson?.error?.message || errorJson?.message || "";
              retryMs = this.parseRetryFromErrorMessage(errorMessage);
            } catch {}
          }

          if (
            retryMs &&
            retryMs <= MAX_RETRY_AFTER_MS &&
            retryAfterAttemptsByUrl[urlIndex] < MAX_RETRY_AFTER_RETRIES
          ) {
            retryAfterAttemptsByUrl[urlIndex] += 1;
            await new Promise((resolve) => setTimeout(resolve, retryMs));
            urlIndex -= 1;
            continue;
          }

          if (
            response.status === HTTP_STATUS.RATE_LIMITED &&
            (!retryMs || retryMs === 0) &&
            retryAttemptsByUrl[urlIndex] < MAX_AUTO_RETRIES
          ) {
            retryAttemptsByUrl[urlIndex] += 1;
            const backoffMs = Math.min(1000 * 2 ** retryAttemptsByUrl[urlIndex], MAX_RETRY_AFTER_MS);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            urlIndex -= 1;
            continue;
          }

          lastStatus = response.status;
          if (urlIndex + 1 < fallbackCount) {
            continue;
          }
        }

        if (this.shouldRetry(response.status, urlIndex)) {
          lastStatus = response.status;
          continue;
        }

        return { response, url, headers, transformedBody };
      } catch (error) {
        lastError = error;
        if (urlIndex + 1 < fallbackCount) {
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error(`All ${fallbackCount} URLs failed with status ${lastStatus}`);
  }
}

export default AntigravityExecutor;
