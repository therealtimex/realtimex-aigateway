import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildDashboardContractDescriptor } from "../src/contracts/dashboardContract.js";
import {
  buildDefaultCatalog,
  summarizeCatalog,
} from "../src/providers/catalog.js";
import {
  buildPluginManifest,
  buildReleaseAssetBaseName,
  REALTIMEX_AIGATEWAY_PLUGIN_DISPLAY_NAME,
  REALTIMEX_AIGATEWAY_PLUGIN_ID,
  REALTIMEX_AIGATEWAY_PLUGIN_NAME,
} from "../src/plugin/packageDefinition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export function stagePluginRelease({
  rootDir = repoRoot,
  outDir = path.join(rootDir, "dist"),
} = {}) {
  const packageJson = JSON.parse(
    readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  const version = packageJson.version;
  const assetBaseName = buildReleaseAssetBaseName({ version });
  const stageDir = path.join(outDir, assetBaseName);
  const gatewayDir = path.join(stageDir, "gateway");

  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  mkdirSync(gatewayDir, { recursive: true });

  const manifest = buildPluginManifest({ version });
  const agents = buildDefaultCatalog();
  const metadata = {
    contract: buildDashboardContractDescriptor(),
    plugin: {
      manifestId: REALTIMEX_AIGATEWAY_PLUGIN_ID,
      slug: REALTIMEX_AIGATEWAY_PLUGIN_NAME,
      displayName: REALTIMEX_AIGATEWAY_PLUGIN_DISPLAY_NAME,
      installSource: "github-release",
      lifecycle: {
        enableSupported: true,
        disableSupported: true,
        reloadRequired: false,
        healthSource: "embedded-gateway-runtime",
      },
    },
    catalog: {
      agents,
      summary: summarizeCatalog(agents),
    },
  };

  writeFileSync(
    path.join(stageDir, "realtimex.plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(stageDir, "plugin-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  cpSync(path.join(rootDir, "plugin", "index.cjs"), path.join(stageDir, "index.js"));
  cpSync(
    path.join(rootDir, "plugin", "runtime.cjs"),
    path.join(stageDir, "runtime.js"),
  );

  writeFileSync(
    path.join(gatewayDir, "package.json"),
    `${JSON.stringify(
      {
        name: `${REALTIMEX_AIGATEWAY_PLUGIN_NAME}-embedded`,
        version,
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  cpSync(path.join(rootDir, "src"), path.join(gatewayDir, "src"), {
    recursive: true,
  });

  return {
    version,
    assetBaseName,
    stageDir,
    zipFile: path.join(outDir, `${assetBaseName}.zip`),
    checksumFile: path.join(outDir, `${assetBaseName}.sha256`),
  };
}

export function buildPluginRelease({
  rootDir = repoRoot,
  outDir = path.join(rootDir, "dist"),
} = {}) {
  const build = stagePluginRelease({ rootDir, outDir });

  rmSync(build.zipFile, { force: true });
  rmSync(build.checksumFile, { force: true });

  const zipResult = spawnSync("zip", ["-r", build.zipFile, "."], {
    cwd: build.stageDir,
    encoding: "utf8",
  });

  if (zipResult.error) {
    throw zipResult.error;
  }

  if (zipResult.status !== 0) {
    throw new Error(zipResult.stderr || "zip failed");
  }

  const hash = createHash("sha256")
    .update(readFileSync(build.zipFile))
    .digest("hex");

  writeFileSync(
    build.checksumFile,
    `${hash}  ${path.basename(build.zipFile)}\n`,
    "utf8",
  );

  return build;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const build = buildPluginRelease();
  process.stdout.write(
    `Built ${path.basename(build.zipFile)} and ${path.basename(build.checksumFile)}\n`,
  );
}

