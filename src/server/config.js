export function resolveServerConfig(env = process.env) {
  const port = Number.parseInt(env.AIGATEWAY_PORT ?? "4010", 10);

  return {
    host: env.AIGATEWAY_HOST ?? "127.0.0.1",
    port: Number.isFinite(port) ? port : 4010,
  };
}
