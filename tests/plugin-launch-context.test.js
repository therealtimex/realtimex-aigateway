import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

import { stagePluginRelease } from "../scripts/build-plugin-release.mjs";

const require = createRequire(import.meta.url);

function createApi(overrides = {}) {
  return {
    getConfig() {
      return {
        AUTO_START_GATEWAY: true,
        AIGATEWAY_HOST: "127.0.0.1",
        AIGATEWAY_PORT: 4010,
        AIGATEWAY_PROXY_ENABLED: false,
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

test("launch context returns unguided payload for unsupported agents", async (t) => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-plugin-stage-"),
  );
  const build = stagePluginRelease({ outDir });
  t.after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });
  const { getLaunchContextPayload } = require(
    path.join(build.stageDir, "runtime.js"),
  );
  const payload = await getLaunchContextPayload({
    api: createApi({
      AIGATEWAY_PROXY_ENABLED: true,
    }),
    request: {
      body: {
        canonicalAgent: "cursor",
      },
    },
  });

  assert.equal(payload.governed, false);
  assert.equal(payload.metadata.reason, "unsupported-agent");
  assert.deepEqual(payload.launchArgs, []);
  assert.deepEqual(payload.launchEnv, {});
});

test("launch context returns codex proxy launch args and env when proxy is enabled", async (t) => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-plugin-stage-"),
  );
  const build = stagePluginRelease({ outDir });
  t.after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });
  const { getLaunchContextPayload } = require(
    path.join(build.stageDir, "runtime.js"),
  );
  const payload = await getLaunchContextPayload({
    api: createApi({
      AIGATEWAY_PROXY_ENABLED: true,
    }),
    request: {
      body: {
        canonicalAgent: "codex",
        forwardedProvider: "openrouter",
      },
    },
  });

  assert.equal(payload.governed, true);
  assert.deepEqual(payload.launchArgs, [
    "--config",
    'chatgpt_base_url="http://127.0.0.1:20128"',
    "--config",
    'openai_base_url="http://127.0.0.1:20128"',
  ]);
  assert.equal(payload.launchEnv.REALTIMEX_AIGATEWAY_ENABLED, "true");
  assert.equal(payload.launchEnv.OPENAI_BASE_URL, "http://127.0.0.1:20128");

  const context = JSON.parse(
    payload.launchEnv.REALTIMEX_TERMINAL_GOVERNANCE_CONTEXT,
  );
  assert.equal(context.routing.canonicalAgent, "codex");
  assert.equal(context.routing.forwardedProvider, "openrouter");
  assert.equal(context.proxy.baseUrl, "http://127.0.0.1:20128");
});

test("launch context embeds qwen settings overlay in governance context", async (t) => {
  const outDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-plugin-stage-"),
  );
  const build = stagePluginRelease({ outDir });
  const { getLaunchContextPayload } = require(
    path.join(build.stageDir, "runtime.js"),
  );
  const homeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "realtimex-aigateway-qwen-home-"),
  );
  const qwenSettingsPath = path.join(homeDir, ".qwen", "settings.json");
  fs.mkdirSync(path.dirname(qwenSettingsPath), { recursive: true });
  fs.writeFileSync(
    qwenSettingsPath,
    JSON.stringify({
      security: {
        auth: {
          selectedType: "qwen-oauth",
        },
      },
      modelProviders: {
        openai: [
          {
            id: "openrouter/auto",
            name: "OpenRouter",
            envKey: "OPENROUTER_API_KEY",
            baseUrl: "https://openrouter.ai/api/v1",
          },
        ],
      },
      env: {
        OPENROUTER_API_KEY: "sk-or-test",
      },
    }),
    "utf8",
  );

  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;
  t.after(() => {
    process.env.HOME = previousHome;
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  const payload = await getLaunchContextPayload({
    api: createApi({
      AIGATEWAY_PROXY_ENABLED: true,
    }),
    request: {
      body: {
        canonicalAgent: "qwen",
        modelId: "qwen3-coder-plus",
      },
    },
  });

  const context = JSON.parse(
    payload.launchEnv.REALTIMEX_TERMINAL_GOVERNANCE_CONTEXT,
  );
  const overlay = context.overlays.qwen.settings;

  assert.equal(payload.governed, true);
  assert.equal(overlay.security.auth.selectedType, "openai");
  assert.equal(overlay.security.auth.baseUrl, "http://127.0.0.1:20128");
  assert.equal(
    overlay.modelProviders.openai[0].baseUrl,
    "http://127.0.0.1:20128",
  );
  assert.equal(overlay.env.OPENAI_BASE_URL, "http://127.0.0.1:20128");
  assert.equal(overlay.env.OPENROUTER_API_KEY, "sk-or-test");
});
