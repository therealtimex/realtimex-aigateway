import test from "node:test";
import assert from "node:assert/strict";

import { createHostAdapter } from "../src/adapters/createHostAdapter.js";

test("host adapter defaults are no-op and return null credentials", async () => {
  const adapter = createHostAdapter();

  assert.equal(await adapter.getProviderCredentials(), null);
  assert.equal(await adapter.refreshProviderCredentials(), null);
  await adapter.emitTrace({ stage: "dispatch" });
  await adapter.emitUsage({ provider: "gemini-cli" });
});
