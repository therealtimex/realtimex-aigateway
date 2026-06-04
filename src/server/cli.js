import { createGatewayServer } from "./createServer.js";
import { resolveServerConfig } from "./config.js";

const config = resolveServerConfig(process.env);
const gateway = createGatewayServer({ config });

try {
  const address = await gateway.start(config);
  process.stdout.write(
    `realtimex-aigateway listening on http://${address.host}:${address.port}\n`,
  );
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
}
