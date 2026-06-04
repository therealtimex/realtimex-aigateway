import http from "node:http";

import { createTerminalGovernancePluginRuntime } from "../plugin/runtime.js";
import { resolveServerConfig } from "./config.js";

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function createGatewayRequestListener(runtime = createTerminalGovernancePluginRuntime()) {
  return function gatewayRequestListener(request, response) {
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
  const requestListener = createGatewayRequestListener(runtime);
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
