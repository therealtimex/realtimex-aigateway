import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { createGatewayServer } from "../src/server/createServer.js";
import { stagePluginRelease } from "../scripts/build-plugin-release.mjs";

const require = createRequire(import.meta.url);

function createPluginApi(overrides = {}) {
  return {
    getConfig() {
      return {
        AUTO_START_GATEWAY: true,
        AIGATEWAY_HOST: "127.0.0.1",
        AIGATEWAY_PORT: 4010,
        AIGATEWAY_PROXY_ENABLED: true,
        AIGATEWAY_PROXY_HOST: "127.0.0.1",
        AIGATEWAY_PROXY_PORT: 20128,
        AIGATEWAY_EXECUTION_PROVIDER: "gemini-cli",
        AIGATEWAY_EXECUTION_BASE_URL:
          "https://cloudcode-pa.googleapis.com/v1internal",
        ...overrides,
      };
    },
  };
}

async function getLaunchContextPayload(t, body, configOverrides = {}) {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-plugin-stage-"),
  );
  const build = stagePluginRelease({ outDir });
  const { getLaunchContextPayload: getLaunchContextPayloadFromRuntime } = require(
    path.join(build.stageDir, "runtime.js"),
  );

  t.after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  return getLaunchContextPayloadFromRuntime({
    api: createPluginApi(configOverrides),
    request: {
      body,
    },
  });
}

test("gateway server exposes /health and /dashboard", async (t) => {
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      localProxy: {
        enabled: true,
        status: "configured",
        baseUrl: "http://127.0.0.1:0",
        port: 0,
        source: "plugin",
        notes: ["Configured in plugin state."],
      },
    },
  });
  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const healthResponse = await fetch(
    `http://${address.host}:${address.port}/health`,
  );
  assert.equal(healthResponse.status, 200);

  const healthBody = await healthResponse.json();
  assert.equal(healthBody.status, "ok");
  assert.equal(healthBody.service, "realtimex-aigateway");
  assert.equal(healthBody.plugin.runtimeStatus, "listening");
  assert.equal(healthBody.localProxy.enabled, true);
  assert.match(healthBody.localProxy.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);

  const dashboardResponse = await fetch(
    `http://${address.host}:${address.port}/dashboard`,
  );
  assert.equal(dashboardResponse.status, 200);

  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.contract.route, "/dashboard");
  assert.equal(dashboardBody.plugin.slug, "realtimex-aigateway");
  assert.equal(dashboardBody.plugin.runtimeStatus, "listening");
  assert.equal(dashboardBody.localProxy.status, "listening");
});

test("gateway server returns 404 for unknown routes", async (t) => {
  const gateway = createGatewayServer();
  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(`http://${address.host}:${address.port}/nope`);
  assert.ok(response.status >= 400);

  const body = await response.json();
  assert.equal(body.error, "route-not-found");
});

test("gateway server records ingress on proxy listener for unsupported native CLI paths", async (t) => {
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      localProxy: {
        enabled: true,
        status: "configured",
        host: "127.0.0.1",
        baseUrl: "http://127.0.0.1:0",
        port: 0,
        source: "plugin",
        notes: [],
      },
    },
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const proxyAddress = gateway.proxyServer.address();
  const response = await fetch(
    `http://${proxyAddress.address}:${proxyAddress.port}/v1internal:loadCodeAssist`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "demo-project" }),
    },
  );

  assert.ok(response.status >= 400);

  const dashboardResponse = await fetch(
    `http://${address.host}:${address.port}/dashboard`,
  );
  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.analytics.summary.trackedRequests, 1);
  assert.equal(dashboardBody.analytics.summary.proxyIngressRequests, 1);
  assert.match(dashboardBody.localProxy.notes.join(" "), /Latest ingress: POST \/v1internal:loadCodeAssist/);
});

test("gateway server passes through native codex responses requests", async (t) => {
  let capturedRequest = null;
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      localProxy: {
        enabled: false,
        status: "disabled",
        baseUrl: null,
        port: 20128,
        source: "plugin",
        notes: [],
      },
    },
    fetchFn: async (url, options = {}) => {
      capturedRequest = { url, options };
      return {
        status: 200,
        headers: new Headers({
          "content-type": "application/json; charset=utf-8",
        }),
        async text() {
          return JSON.stringify({
            id: "resp_123",
            status: "completed",
          });
        },
      };
    },
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}/backend-api/codex/responses`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer codex-token",
        "content-type": "application/json",
        "user-agent": "codex-cli/1.0.18",
      },
      body: JSON.stringify({
        model: "gpt-5-codex",
        input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(capturedRequest.url, "https://chatgpt.com/backend-api/codex/responses");

  const dashboardResponse = await fetch(
    `http://${address.host}:${address.port}/dashboard`,
  );
  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.analytics.summary.trackedRequests, 1);
  assert.equal(dashboardBody.analytics.summary.upstreamDispatches, 1);
});

test("gateway server honors governed qwen launch-context routing for hosted chat without an injected adapter", async (t) => {
  const payload = await getLaunchContextPayload(t, {
    canonicalAgent: "qwen",
    forwardedProvider: "openrouter",
    modelId: "qwen3-coder-plus",
  });
  const governedBaseUrl = new URL(payload.launchEnv.OPENAI_BASE_URL);
  let capturedRequest = null;

  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      execution: {
        provider: "gemini-cli",
        baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
      },
      localProxy: {
        enabled: true,
        status: "configured",
        baseUrl: "http://127.0.0.1:0",
        port: 0,
        source: "plugin",
        notes: [],
      },
    },
    fetchFn: async (url, init) => {
      capturedRequest = {
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: "chatcmpl-qwen-governed",
            object: "chat.completion",
            created: 1,
            model: "qwen3-coder-plus",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Hi from governed Qwen",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 6,
              completion_tokens: 4,
              total_tokens: 10,
            },
          };
        },
      };
    },
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}${governedBaseUrl.pathname}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer qwen-token-123",
      },
      body: JSON.stringify({
        model: "qwen3-coder-plus",
        messages: [{ role: "user", content: "Hi from governed Qwen" }],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(capturedRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedRequest.headers["X-Title"], "Endpoint Proxy");
  assert.equal(capturedRequest.body.messages[0].role, "system");
});

test("gateway server honors governed codex launch-context routing for native passthrough", async (t) => {
  const payload = await getLaunchContextPayload(t, {
    canonicalAgent: "codex",
    forwardedProvider: "openrouter",
  });
  const governedBaseUrl = new URL(payload.launchEnv.OPENAI_BASE_URL);
  let capturedRequest = null;

  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      execution: {
        provider: "gemini-cli",
        baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
      },
      localProxy: {
        enabled: true,
        status: "configured",
        baseUrl: "http://127.0.0.1:0",
        port: 0,
        source: "plugin",
        notes: [],
      },
    },
    fetchFn: async (url) => {
      capturedRequest = { url };
      return {
        status: 200,
        headers: new Headers({
          "content-type": "application/json; charset=utf-8",
        }),
        async text() {
          return JSON.stringify({
            id: "resp_811",
            status: "completed",
          });
        },
      };
    },
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}${governedBaseUrl.pathname}/backend-api/codex/responses`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer codex-token",
        "content-type": "application/json",
        "user-agent": "codex-cli/1.0.18",
      },
      body: JSON.stringify({
        model: "gpt-5-codex",
        input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    capturedRequest.url,
    "https://chatgpt.com/backend-api/codex/responses",
  );
  assert.equal(governedBaseUrl.pathname, "/_rtx/governed/codex");
});

test("gateway server executes hosted gemini chat via injected adapter and fetch", async (t) => {
  const traces = [];
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [{ text: "Gateway Gemini reply" }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      };
    },
  });

  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      execution: {
        provider: "gemini-cli",
        baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
      },
      localProxy: {
        enabled: false,
        status: "disabled",
        baseUrl: null,
        port: 20128,
        source: "plugin",
        notes: [],
      },
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "token-abc",
          projectId: "project-456",
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace(event) {
        traces.push(event);
      },
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn,
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages: [{ role: "user", content: "Hi" }],
      }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object, "chat.completion");
  assert.equal(body.choices[0].message.content, "Gateway Gemini reply");
  assert.equal(traces.length, 2);

  const dashboardResponse = await fetch(
    `http://${address.host}:${address.port}/dashboard`,
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.analytics.ready, true);
  assert.equal(dashboardBody.analytics.summary.trackedRequests, 1);
  assert.equal(dashboardBody.analytics.summary.proxyIngressRequests, 1);
  assert.equal(dashboardBody.analytics.summary.upstreamDispatches, 1);
  assert.match(dashboardBody.analytics.notes[0], /Observed 1 request/);
});

test("gateway server accepts antigravity generateContent ingress and returns antigravity JSON", async (t) => {
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      execution: {
        provider: "claude",
        baseUrl: "https://api.anthropic.com/v1/messages",
      },
      localProxy: {
        enabled: false,
        status: "disabled",
        baseUrl: null,
        port: 20128,
        source: "plugin",
        notes: [],
      },
    },
    adapter: {
      async getProviderCredentials() {
        return {
          apiKey: "claude-key-xyz",
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "msg_antigravity_1",
          model: "claude-sonnet-4",
          content: [{ type: "text", text: "Hello from Claude via AGY ingress" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 9,
            output_tokens: 6,
          },
        };
      },
    }),
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}/v1internal:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4",
        userAgent: "antigravity",
        requestType: "agent",
        request: {
          contents: [{ role: "user", parts: [{ text: "Hi from AGY ingress" }] }],
        },
      }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.response.candidates[0].content.parts[0].text, "Hello from Claude via AGY ingress");
  assert.equal(body.response.modelVersion, "claude-sonnet-4");
  assert.equal(body.response.usageMetadata.totalTokenCount, 15);
});

test("gateway server accepts antigravity stream ingress and returns SSE payload", async (t) => {
  const gateway = createGatewayServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      execution: {
        provider: "gemini-cli",
        baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
      },
      localProxy: {
        enabled: false,
        status: "disabled",
        baseUrl: null,
        port: 20128,
        source: "plugin",
        notes: [],
      },
    },
    adapter: {
      async getProviderCredentials() {
        return {
          accessToken: "token-abc",
          projectId: "project-456",
        };
      },
      async refreshProviderCredentials() {
        return null;
      },
      async emitTrace() {},
      async emitUsage() {},
      onLifecycleEvent() {},
    },
    fetchFn: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini via AGY stream ingress" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        };
      },
    }),
  });

  const address = await gateway.start({ host: "127.0.0.1", port: 0 });

  t.after(async () => {
    await gateway.stop();
  });

  const response = await fetch(
    `http://${address.host}:${address.port}/v1internal:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        userAgent: "antigravity",
        requestType: "agent",
        request: {
          contents: [{ role: "user", parts: [{ text: "Hi from AGY stream ingress" }] }],
        },
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const body = await response.text();
  assert.match(body, /^data: /);
  assert.match(body, /Hello from Gemini via AGY stream ingress/);
});
