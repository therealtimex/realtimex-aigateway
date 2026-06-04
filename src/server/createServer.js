import http from "node:http";

import { createHostAdapter } from "../adapters/createHostAdapter.js";
import { handleHostedChatCore } from "../vendor/9router/open-sse/handlers/chatCore.js";
import { createTerminalGovernancePluginRuntime } from "../plugin/runtime.js";
import { resolveServerConfig } from "./config.js";

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function sendFetchResponse(response, webResponse) {
  const headers = Object.fromEntries(webResponse.headers.entries());
  const body = await webResponse.text();
  response.writeHead(webResponse.status, headers);
  response.end(body);
}

export function createGatewayRequestListener({
  runtime = createTerminalGovernancePluginRuntime(),
  adapter = createHostAdapter(),
  fetchFn = fetch,
  config = resolveServerConfig(process.env),
} = {}) {
  return async function gatewayRequestListener(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      const dashboard = runtime.getDashboard();

      return jsonResponse(response, 200, {
        status: "ok",
        service: "realtimex-aigateway",
        plugin: dashboard.plugin,
        localProxy: dashboard.localProxy,
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readJsonBody(request);
      const result = await handleHostedChatCore({
        body,
        adapter,
        fetchFn,
        execution: config.execution,
        request: {
          path: url.pathname,
          headers: request.headers,
        },
      });
      return sendFetchResponse(response, result.response);
    }

    const pluginResponse = runtime.handleRequest({
      method: request.method,
      path: url.pathname,
    });

    response.writeHead(pluginResponse.status, pluginResponse.headers);
    response.end(pluginResponse.body);
  };
}

export function createGatewayServer(options = {}) {
  const config = options.config ?? resolveServerConfig(process.env);
  const runtime =
    options.runtime ??
    createTerminalGovernancePluginRuntime({
      localProxy: config.localProxy,
    });
  const requestListener = createGatewayRequestListener({
    runtime,
    adapter: options.adapter,
    fetchFn: options.fetchFn,
    config,
  });
  const server = http.createServer(requestListener);

  return {
    config,
    runtime,
    server,
    async start({ host = config.host, port = config.port } = {}) {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });

      runtime.setRuntimeStatus("listening");

      const address = server.address();
      return {
        host: typeof address === "object" && address ? address.address : host,
        port: typeof address === "object" && address ? address.port : port,
      };
    },
    async stop() {
      if (!server.listening) {
        runtime.setRuntimeStatus("stopped");
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      runtime.setRuntimeStatus("stopped");
    },
  };
}
