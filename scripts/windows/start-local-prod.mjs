import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  loadDotEnv,
  printEnvironmentSummary,
  repoRootFromScript,
  validateEnvironment
} from "./env-utils.mjs";

const root = repoRootFromScript(import.meta.url);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);

  if (!Number.isFinite(major) || major < 22) {
    throw new Error(`Node.js 22 LTS or newer is required. Current version: ${process.version}.`);
  }
}

try {
  process.chdir(root);
  assertNodeVersion();
  loadDotEnv(root);

  const summary = validateEnvironment();

  if (!summary.ok) {
    console.error("Cannot start Marketplace Pick & Pack:");
    for (const error of summary.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  if (summary.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn("");
  }

  process.env.DATABASE_URL = summary.databaseUrl;
  process.env.SESSION_COOKIE_SECURE = String(summary.sessionCookieSecure);

  if (summary.databaseKind === "postgres" && !process.env.SKIP_PRISMA_MIGRATE) {
    process.env.SKIP_PRISMA_MIGRATE = "true";
  }

  console.log("");
  console.log("Starting Marketplace Pick & Pack local production server...");
  printEnvironmentSummary(summary);
  console.log(`SKIP_PRISMA_MIGRATE=${process.env.SKIP_PRISMA_MIGRATE ?? "false"}`);
  console.log("");

  if (!existsSync("node_modules")) {
    console.log("node_modules not found. Installing dependencies...");
    run(npmCommand, ["install"]);
  }

  run(npmCommand, ["run", summary.buildScript]);
  run(npmCommand, ["start"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to start Marketplace Pick & Pack.");
  process.exit(1);
}
