import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const CLOUDFLARE_WORKER_URL = "https://pack.personalizedgiftday.com";

export function repoRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

export function loadDotEnv(root = process.cwd()) {
  const envPath = path.join(root, ".env");

  if (!existsSync(envPath)) {
    throw new Error(`.env was not found in ${root}. Create it from .env.local.production.example or .env.example.`);
  }

  const result = dotenv.config({ path: envPath, quiet: true });

  if (result.error) {
    throw result.error;
  }

  return envPath;
}

export function normalizeDatabaseUrl(value) {
  let normalized = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");

  if (normalized.startsWith("DATABASE_URL=")) {
    normalized = normalized.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  }

  return normalized;
}

export function databaseKind(databaseUrl) {
  if (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")) {
    return "postgres";
  }

  if (databaseUrl.startsWith("file:")) {
    return "sqlite";
  }

  return "invalid";
}

export function maskDatabaseUrl(databaseUrl) {
  const normalized = normalizeDatabaseUrl(databaseUrl);

  try {
    const url = new URL(normalized);
    const user = url.username ? `${url.username.slice(0, 3)}***` : "";
    const host = url.hostname ? `${url.hostname.slice(0, 6)}***` : "";
    return `${url.protocol}//${user}${user ? "@" : ""}${host}${url.port ? `:${url.port}` : ""}${url.pathname ? "/..." : ""}`;
  } catch {
    if (normalized.startsWith("file:")) {
      return "file:...";
    }

    return "<invalid>";
  }
}

export function detectedLanIp() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(entry.address)
      ) {
        return entry.address;
      }
    }
  }

  return null;
}

export function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const rawDatabaseUrl = env.DATABASE_URL;
  const databaseUrl = normalizeDatabaseUrl(rawDatabaseUrl);
  const kind = databaseKind(databaseUrl);
  const sessionSecret = String(env.SESSION_SECRET ?? "").trim();
  const appUrl = String(env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim();

  if (!rawDatabaseUrl) {
    errors.push("DATABASE_URL is missing.");
  } else if (rawDatabaseUrl !== databaseUrl) {
    warnings.push("DATABASE_URL had a duplicated DATABASE_URL= prefix; using the corrected value for this process.");
  }

  if (kind === "invalid") {
    errors.push("DATABASE_URL must start with postgresql://, postgres://, or file:.");
  }

  if (!sessionSecret) {
    errors.push("SESSION_SECRET is missing.");
  } else if (sessionSecret.length < 24) {
    warnings.push("SESSION_SECRET should be at least 32 random characters for production.");
  }

  const isPostgres = kind === "postgres";
  const schema = isPostgres ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma";
  const buildScript = isPostgres ? "build:prod" : "build";
  const localHttpMode = appUrl.startsWith("http://") || !appUrl;
  const sessionCookieSecure = env.SESSION_COOKIE_SECURE ?? (localHttpMode ? "false" : "true");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    databaseUrl,
    databaseKind: kind,
    maskedDatabaseUrl: maskDatabaseUrl(databaseUrl),
    schema,
    buildScript,
    sessionCookieSecure,
    appUrl,
    localHttpMode
  };
}

export function printEnvironmentSummary(summary) {
  console.log(`Database: ${summary.maskedDatabaseUrl}`);
  console.log(`Database type: ${summary.databaseKind}`);
  console.log(`Selected schema: ${summary.schema}`);
  console.log(`Build command: npm run ${summary.buildScript}`);
  console.log(`SESSION_COOKIE_SECURE=${summary.sessionCookieSecure}`);
  console.log("Local URL: http://localhost:3000");
  const lanIp = detectedLanIp();
  console.log(`Mobile local URL: ${lanIp ? `http://${lanIp}:3000` : "not detected"}`);
  console.log(`Cloudflare worker URL: ${CLOUDFLARE_WORKER_URL}`);
}
