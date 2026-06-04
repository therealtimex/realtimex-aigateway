import http from "node:http";
import { randomUUID } from "node:crypto";

import { createHostAdapter } from "../adapters/createHostAdapter.js";
import { handleHostedChatCore } from "../vendor/9router/open-sse/handlers/chatCore.js";
import { createTerminalGovernancePluginRuntime } from "../plugin/runtime.js";
import { resolveServerConfig } from "./config.js";
import { handleAntigravityIngress } from "../gateway/handleAntigravityIngress.js";
import { passThroughNativeRequest } from "./nativePassThrough.js";

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  let json = null;

  if (rawBody) {
    try {
      json = JSON.parse(rawBody);
    } catch {
      json = null;
    }
  }

  return {
    rawBody,
    json,
  };
}

async function sendFetchResponse(response, webResponse) {
  const headers = Object.fromEntries(webResponse.headers.entries());
  const body = await webResponse.text();
  response.writeHead(webResponse.status, headers);
  response.end(body);
  return {
    status: webResponse.status,
    headers,
    body,
  };
}

async function sendPluginResponse(response, pluginResponse) {
  response.writeHead(pluginResponse.status, pluginResponse.headers);
  response.end(pluginResponse.body);
  return {
    status: pluginResponse.status,
  };
}

function createInstrumentedAdapter(baseAdapter, runtime) {
  const adapter = baseAdapter ?? createHostAdapter();

  return createHostAdapter({
    async getProviderCredentials(...args) {
      return adapter.getProviderCredentials?.(...args) ?? null;
    },
    async refreshProviderCredentials(...args) {
      return adapter.refreshProviderCredentials?.(...args) ?? null;
    },
    async emitTrace(event) {
      await adapter.emitTrace?.(event);
      runtime.recordTrace(event);
    },
    async emitUsage(event) {
      await adapter.emitUsage?.(event);
      runtime.recordUsage(event);
    },
    onLifecycleEvent(event) {
      adapter.onLifecycleEvent?.(event);
      runtime.recordLifecycle(event);
    },
  });
}

function isAntigravityRequest({ headers = {}, body = null } = {}) {
  const userAgent = String(headers["user-agent"] || "")
    .trim()
    .toLowerCase();
  const bodyUserAgent = String(body?.userAgent || "")
    .trim()
    .toLowerCase();
  const requestType = String(body?.requestType || "")
    .trim()
    .toLowerCase();

  return (
    userAgent.includes("antigravity") ||
    bodyUserAgent === "antigravity" ||
    requestType === "agent"
  );
}

export function createGatewayRequestListener({
  runtime = createTerminalGovernancePluginRuntime(),
  adapter = createHostAdapter(),
  fetchFn = fetch,
  config = resolveServerConfig(process.env),
} = {}) {
  return async function gatewayRequestListener(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestId = randomUUID();

    if (request.method === "GET" && url.pathname === "/health") {
      const dashboard = runtime.getDashboard();

      return jsonResponse(response, 200, {
        status: "ok",
        service: "realtimex-aigateway",
        plugin: dashboard.plugin,
        localProxy: dashboard.localProxy,
      });
    }

    if (request.method === "POST") {
      runtime.recordIngress({
        requestId,
        method: request.method,
        path: `${url.pathname}${url.search || ""}`,
      });
      const body = await readRequestBody(request);

      const nativePassThroughResponse = await passThroughNativeRequest({
        requestUrl: url,
        requestHeaders: request.headers,
        requestMethod: request.method,
        rawBody: body.rawBody,
        parsedBody: body.json,
        requestId,
        fetchFn,
        adapter,
      });

      if (nativePassThroughResponse) {
        const delivered = await sendFetchResponse(response, nativePassThroughResponse);
        runtime.recordDelivery({
          requestId,
          method: request.method,
          path: `${url.pathname}${url.search || ""}`,
          status: delivered.status,
        });
        return;
      }

      if (url.pathname === "/v1/chat/completions") {
        const result = await handleHostedChatCore({
          body: body.json || {},
          adapter,
          fetchFn,
          execution: config.execution,
          connectionId: requestId,
          request: {
            path: url.pathname,
            headers: request.headers,
          },
        });
        const delivered = await sendFetchResponse(response, result.response);
        runtime.recordDelivery({
          requestId,
          method: request.method,
          path: url.pathname,
          status: delivered.status,
        });
        return;
      }

      if (
        (url.pathname === "/v1internal:generateContent" ||
          url.pathname === "/v1internal:streamGenerateContent") &&
        isAntigravityRequest({
          headers: request.headers,
          body: body.json,
        })
      ) {
        const result = await handleAntigravityIngress({
          body: body.json || {},
          adapter,
          fetchFn,
          execution: config.execution,
          connectionId: requestId,
          request: {
            path: url.pathname,
            headers: request.headers,
          },
          stream: url.pathname === "/v1internal:streamGenerateContent",
        });
        const delivered = await sendFetchResponse(response, result.response);
        runtime.recordDelivery({
          requestId,
          method: request.method,
          path: `${url.pathname}${url.search || ""}`,
          status: delivered.status,
        });
        return;
      }
    }

    const pluginResponse = runtime.handleRequest({
      method: request.method,
      path: url.pathname,
    });
    const delivered = await sendPluginResponse(response, pluginResponse);
    if (request.method === "POST") {
      runtime.recordDelivery({
        requestId,
        method: request.method,
        path: `${url.pathname}${url.search || ""}`,
        status: delivered.status,
      });
    }
  };
}

export function createGatewayServer(options = {}) {
  const config = options.config ?? resolveServerConfig(process.env);
  const runtime =
    options.runtime ??
    createTerminalGovernancePluginRuntime({
      localProxy: config.localProxy,
    });
  const adapter = createInstrumentedAdapter(options.adapter, runtime);
  const requestListener = createGatewayRequestListener({
    runtime,
    adapter,
    fetchFn: options.fetchFn,
    config,
  });
  const server = http.createServer(requestListener);
  const proxyServer = config.localProxy?.enabled
    ? http.createServer(requestListener)
    : null;

  async function listenServer(targetServer, { host, port }) {
    await new Promise((resolve, reject) => {
      targetServer.once("error", reject);
      targetServer.listen(port, host, () => {
        targetServer.off("error", reject);
        resolve();
      });
    });

    const address = targetServer.address();
    return {
      host: typeof address === "object" && address ? address.address : host,
      port: typeof address === "object" && address ? address.port : port,
    };
  }

  async function closeServer(targetServer) {
    if (!targetServer || !targetServer.listening) {
      return;
    }

    await new Promise((resolve, reject) => {
      targetServer.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return {
    config,
    runtime,
    server,
    proxyServer,
    async start({ host = config.host, port = config.port } = {}) {
      const primaryAddress = await listenServer(server, { host, port });

      if (proxyServer) {
        const proxyAddress = await listenServer(proxyServer, {
          host: config.localProxy.host || "127.0.0.1",
          port: config.localProxy.port,
        });
        runtime.setLocalProxyState({
          enabled: true,
          status: "listening",
          baseUrl: `http://${proxyAddress.host}:${proxyAddress.port}`,
          port: proxyAddress.port,
        });
      }

      runtime.setRuntimeStatus("listening");

      return {
        host: primaryAddress.host,
        port: primaryAddress.port,
      };
    },
    async stop() {
      await closeServer(proxyServer);
      await closeServer(server);
      runtime.setLocalProxyState({
        status: config.localProxy?.enabled ? "stopped" : "disabled",
      });
      runtime.setRuntimeStatus("stopped");
    },
  };
}
