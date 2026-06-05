import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultCatalog,
  summarizeCatalog,
} from "../src/providers/catalog.js";

test("buildDefaultCatalog returns host-compatible agent cards with detected install state", () => {
  const catalog = buildDefaultCatalog({
    commandDetector(command) {
      return command === "gemini" || command === "codex";
    },
  });

  assert.equal(catalog.length, 5);

  const gemini = catalog.find((agent) => agent.canonical === "gemini");
  const codex = catalog.find((agent) => agent.canonical === "codex");
  const claude = catalog.find((agent) => agent.canonical === "claude");

  assert.ok(gemini);
  assert.equal(gemini.installed, true);
  assert.equal(gemini.label, "Gemini");
  assert.equal(gemini.command, "gemini");
  assert.equal(gemini.terminalModel.modelFlag, "--model");
  assert.equal(gemini.setup.docsUrl, "https://github.com/google-gemini/gemini-cli");

  assert.ok(codex);
  assert.equal(codex.installed, true);
  assert.equal(codex.supportsProviderForwarding, false);
  assert.deepEqual(codex.forwardableProviders, []);

  assert.ok(claude);
  assert.equal(claude.installed, false);

  const qwen = catalog.find((agent) => agent.canonical === "qwen");
  assert.ok(qwen);
  assert.equal(qwen.supportsProviderForwarding, true);
  assert.deepEqual(qwen.forwardableProviders, ["openrouter"]);
});

test("summarizeCatalog reports supported and installed counts from detected catalog", () => {
  const catalog = buildDefaultCatalog({
    commandDetector(command) {
      return ["gemini", "qwen", "agy"].includes(command);
    },
  });

  const summary = summarizeCatalog(catalog);

  assert.deepEqual(summary, {
    supported: 5,
    installed: 3,
    uninstalled: 2,
    docsLinked: 5,
    forwardable: 1,
  });
});
