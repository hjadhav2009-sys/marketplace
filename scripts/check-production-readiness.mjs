import { spawnSync } from "node:child_process";
import process from "node:process";
import { PrismaClient } from "@prisma/client";
import { loadDotEnv, printEnvironmentSummary, validateEnvironment } from "./windows/env-utils.mjs";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const autoApplyMigrations = process.env.AUTO_APPLY_MIGRATIONS === "true";
const isStartup = process.argv.includes("--startup");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    ...options
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function printCommandFailure(label, result) {
  console.error(`${label} failed.`);

  if (result.stdout.trim()) {
    console.error(result.stdout.trim());
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
}

async function pingDatabase() {
  const prisma = new PrismaClient();
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`Database connection: OK (${Date.now() - startedAt}ms)`);
  } finally {
    await prisma.$disconnect();
  }
}

function validatePrismaSchema(schema) {
  const result = run(npxCommand, ["prisma", "validate", "--schema", schema]);

  if (!result.ok) {
    printCommandFailure("Prisma schema validation", result);
    process.exit(result.status);
  }

  console.log(`Prisma schema validation: OK (${schema})`);
}

function checkMigrations(schema) {
  let result = run(npxCommand, ["prisma", "migrate", "status", "--schema", schema]);

  if (result.ok) {
    console.log("Database migrations: OK");
    return;
  }

  if (!autoApplyMigrations) {
    printCommandFailure("Database migration status", result);
    console.error("");
    console.error("Pending or failed migrations may exist.");
    console.error("Set AUTO_APPLY_MIGRATIONS=true to apply migrations automatically before start, or run the migration command manually.");
    process.exit(result.status);
  }

  console.warn("Database migrations need attention. AUTO_APPLY_MIGRATIONS=true, running migrate deploy...");
  result = run(npxCommand, ["prisma", "migrate", "deploy", "--schema", schema], { stdio: "inherit" });

  if (!result.ok) {
    process.exit(result.status);
  }

  result = run(npxCommand, ["prisma", "migrate", "status", "--schema", schema]);

  if (!result.ok) {
    printCommandFailure("Database migration status after deploy", result);
    process.exit(result.status);
  }

  console.log("Database migrations: applied and OK");
}

try {
  loadDotEnv(process.cwd());
  const summary = validateEnvironment();

  if (!summary.ok) {
    console.error("Production readiness check failed:");
    for (const error of summary.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  process.env.DATABASE_URL = summary.databaseUrl;
  process.env.SESSION_COOKIE_SECURE = String(summary.sessionCookieSecure);

  console.log(isStartup ? "Startup preflight" : "Production readiness check");
  printEnvironmentSummary(summary);

  if (summary.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  validatePrismaSchema(summary.schema);
  await pingDatabase();
  checkMigrations(summary.schema);

  console.log("Production readiness check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production readiness check failed.");
  process.exit(1);
}
