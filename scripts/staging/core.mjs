import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultStagingRoot = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging");
const requestedStagingRoot = process.env.STAGE3_STAGING_ROOT ? path.resolve(process.env.STAGE3_STAGING_ROOT) : defaultStagingRoot;
if (requestedStagingRoot !== defaultStagingRoot && (!isInside(path.join(ROOT, ".codex-tmp"), requestedStagingRoot) || !path.basename(requestedStagingRoot).startsWith("stage3-test-"))) {
  throw new Error("A staging-root override is permitted only for an isolated Stage 3 test directory.");
}
export const STAGING_ROOT = requestedStagingRoot;
export const DATABASE_PATH = path.join(STAGING_ROOT, "database", "staging.db");
export const STORAGE_ROOT = path.join(STAGING_ROOT, "storage");
export const RUNTIME_ROOT = path.join(STAGING_ROOT, "runtime");
export const CREDENTIALS_ROOT = path.join(STAGING_ROOT, "credentials");
export const FIXTURES_ROOT = path.join(STAGING_ROOT, "fixtures");
export const LOG_ROOT = path.join(STAGING_ROOT, "logs");
export const REPORT_ROOT = path.join(STAGING_ROOT, "reports");
export const ENV_PATH = path.join(RUNTIME_ROOT, "environment.json");
export const PID_PATH = path.join(RUNTIME_ROOT, "server.json");
export const CREDENTIAL_PATH = path.join(CREDENTIALS_ROOT, "synthetic-users.json");
export const PORT = 3188;
export const HOST = "127.0.0.1";
export const PREPARE_PHRASE = "APPROVE PRIVATE SYNTHETIC STAGING PREPARATION";
export const RESET_PHRASE = "RESET SYNTHETIC STAGING";
export const CLEANUP_PHRASE = "CLEANUP SYNTHETIC STAGING";
export const SEED_VERSION = "phase-7.3.6-stage4.2-synthetic-ui-v2";

export function isInside(parent, candidate, allowEqual = false) {
  const root = path.resolve(parent);
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  return (allowEqual && relative === "") || (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertStagingPath(candidate, allowRoot = false) {
  if (!isInside(STAGING_ROOT, candidate, allowRoot)) throw new Error("Staging path escaped the private Stage 3 root.");
  const resolved = path.resolve(candidate);
  for (const forbidden of [path.join(ROOT, "prisma", "dev.db"), path.join(ROOT, "storage"), path.join(ROOT, "backups")]) {
    if (resolved === path.resolve(forbidden) || isInside(forbidden, resolved, true)) throw new Error("Staging path overlaps a protected repository data root.");
  }
  return resolved;
}

export function databaseUrl() {
  return `file:${DATABASE_PATH.replace(/\\/g, "/")}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function git(command) {
  const result = spawnSync("git", command, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`Git inspection failed: ${String(result.stderr).trim()}`);
  return String(result.stdout).trim();
}

export function buildEnvironment(config) {
  const inherited = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "NODE_OPTIONS"]) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  const env = {
    ...inherited,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl(),
    SESSION_SECRET: config.sessionSecret,
    SESSION_COOKIE_SECURE: "false",
    SESSION_COOKIE_NAME: "mpp_stage3_session",
    ACCOUNT_COOKIE_NAME: "mpp_stage3_account",
    NEXT_PUBLIC_APP_URL: `http://${HOST}:${PORT}`,
    NEXT_PUBLIC_STAGING_BANNER: "PRIVATE SYNTHETIC STAGING",
    STAGE3_SYNTHETIC_STAGING: "true",
    STAGE3_RUNTIME_IDENTITY_TOKEN: config.runtimeIdentityToken,
    PORT: String(PORT),
    HOSTNAME: HOST,
    IMPORT_JOB_STORAGE_ROOT: path.join(STORAGE_ROOT, "import-jobs"),
    MARKING_LIBRARY_ROOT: path.join(STORAGE_ROOT, "marking-library"),
    CONSIGNMENT_IMPORT_ROOT: path.join(STORAGE_ROOT, "consignment-imports"),
    PRODUCT_IMAGE_STORAGE_ROOT: path.join(STORAGE_ROOT, "images"),
    DATA_QUARANTINE_ROOT: path.join(STORAGE_ROOT, "data-quarantine"),
    SKIP_PRISMA_MIGRATE: "true"
  };
  assertIsolatedEnvironment(env);
  return env;
}

export function assertIsolatedEnvironment(env) {
  if (env.DATABASE_URL !== databaseUrl()) throw new Error("Staging DATABASE_URL is not the private synthetic database.");
  if (String(env.SESSION_SECRET ?? "").length < 48) throw new Error("Staging session secret is missing or too short.");
  if (env.PORT !== String(PORT) || env.HOSTNAME !== HOST) throw new Error("Staging network boundary is invalid.");
  for (const key of ["IMPORT_JOB_STORAGE_ROOT", "MARKING_LIBRARY_ROOT", "CONSIGNMENT_IMPORT_ROOT", "PRODUCT_IMAGE_STORAGE_ROOT", "DATA_QUARANTINE_ROOT"]) {
    assertStagingPath(String(env[key]));
  }
  const serialized = JSON.stringify(Object.fromEntries(Object.entries(env).filter(([key]) => !["PATH", "Path", "PATHEXT", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "TEMP", "TMP", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC"].includes(key))));
  if (/cloudflare|tailscale|pack\.personalizedgiftday\.com/i.test(serialized)) throw new Error("A public tunnel or production domain leaked into staging configuration.");
}

export async function loadPrivateConfig() {
  const config = JSON.parse(await readFile(ENV_PATH, "utf8"));
  if (config.environment !== "PRIVATE_SYNTHETIC_STAGING" || config.port !== PORT || config.host !== HOST) throw new Error("Invalid private staging environment receipt.");
  return config;
}

export async function writePrivateConfig() {
  await mkdir(RUNTIME_ROOT, { recursive: true });
  const config = {
    environment: "PRIVATE_SYNTHETIC_STAGING",
    host: HOST,
    port: PORT,
    databasePath: DATABASE_PATH,
    storageRoot: STORAGE_ROOT,
    sessionSecret: randomBytes(48).toString("base64url"),
    runtimeIdentityToken: randomBytes(32).toString("base64url"),
    seedVersion: SEED_VERSION,
    sourceSha: git(["rev-parse", "HEAD"]),
    createdAt: new Date().toISOString()
  };
  assertIsolatedEnvironment(buildEnvironment(config));
  await writeFile(ENV_PATH, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  return config;
}

export async function portOwner() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export function run(command, args, options = {}) {
  const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const finalArgs = executable === "cmd.exe" ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(executable, finalArgs, { cwd: ROOT, env: options.env ?? process.env, encoding: "utf8", windowsHide: true, timeout: options.timeout ?? 300_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error).slice(-2000)}`);
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

export async function createDirectories() {
  for (const target of [path.dirname(DATABASE_PATH), STORAGE_ROOT, path.join(STORAGE_ROOT, "import-jobs"), path.join(STORAGE_ROOT, "marking-library"), path.join(STORAGE_ROOT, "consignment-imports"), path.join(STORAGE_ROOT, "images"), path.join(STORAGE_ROOT, "data-quarantine"), path.join(STORAGE_ROOT, "uploads"), path.join(STAGING_ROOT, "sessions"), LOG_ROOT, REPORT_ROOT, CREDENTIALS_ROOT, FIXTURES_ROOT, RUNTIME_ROOT]) {
    assertStagingPath(target);
    await mkdir(target, { recursive: true });
  }
}

export async function prepare({ confirmation }) {
  if (confirmation !== PREPARE_PHRASE) throw new Error(`Preparation requires exact confirmation: ${PREPARE_PHRASE}`);
  if (existsSync(STAGING_ROOT)) throw new Error("Staging root already exists. Inspect it or use the confirmed synthetic reset command.");
  await createDirectories();
  const ignored = spawnSync("git", ["check-ignore", "-q", STAGING_ROOT], { cwd: ROOT, windowsHide: true }).status === 0;
  if (!ignored) throw new Error("Private Stage 3 root is not ignored by Git.");
  const config = await writePrivateConfig();
  const env = buildEnvironment(config);
  run("npx.cmd", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], { env, timeout: 300_000 });
  run("npx.cmd", ["tsx", "scripts/staging/seed.ts"], { env: { ...env, STAGING_CREDENTIAL_PATH: CREDENTIAL_PATH, STAGING_FIXTURES_ROOT: FIXTURES_ROOT }, timeout: 300_000 });
  return inspect();
}

export function inspectDatabase() {
  if (!existsSync(DATABASE_PATH)) return { exists: false, migrationCount: 0, counts: {} };
  assertStagingPath(DATABASE_PATH);
  const db = new DatabaseSync(DATABASE_PATH, { readOnly: true });
  try {
    const migrationCount = Number(db.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL').get().count);
    const counts = {};
    for (const table of ["Account", "User", "MarketplaceListing", "Order", "ConsignmentBatch", "ConsignmentLine", "WorkTask", "WorkGroupProjection", "ImportJob", "UploadBatch", "ImportRowIssue", "ConsignmentImportIssue", "ProblemOrder", "ScanLog", "DataDeletionJob", "AuditLog"]) {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count);
    }
    return { exists: true, migrationCount, counts, integrity: db.prepare("PRAGMA integrity_check").get().integrity_check };
  } finally { db.close(); }
}

export async function inspect() {
  const branch = git(["branch", "--show-current"]);
  const sourceSha = git(["rev-parse", "HEAD"]);
  const processReceipt = existsSync(PID_PATH) ? JSON.parse(readFileSync(PID_PATH, "utf8")) : null;
  return {
    environment: "PRIVATE_SYNTHETIC_STAGING",
    branch,
    sourceSha,
    host: HOST,
    port: PORT,
    portOpen: await portOwner(),
    processReceipt: processReceipt ? { pid: processReceipt.pid, sourceSha: processReceipt.sourceSha, startedAt: processReceipt.startedAt } : null,
    database: inspectDatabase(),
    credentialsPresent: existsSync(CREDENTIAL_PATH),
    seedVersion: SEED_VERSION,
    productionPathsReferenced: false
  };
}

async function verifiedRecordedProcess(receipt) {
  if (!Number.isInteger(receipt.pid) || receipt.pid <= 0 || receipt.port !== PORT || receipt.host !== HOST) return false;
  const config = await loadPrivateConfig();
  const nextBin = require.resolve("next/dist/bin/next");
  const expectedFingerprint = sha256([nextBin, "start", HOST, String(PORT)].join("\0"));
  if (receipt.commandFingerprint !== expectedFingerprint) return false;
  try {
    const response = await fetch(`http://${HOST}:${PORT}/api/staging/identity`, { cache: "no-store" });
    const identity = await response.json();
    return response.status === 200 && identity.pid === receipt.pid && identity.tokenSha256 === sha256(config.runtimeIdentityToken);
  } catch { return false; }
}

export async function start() {
  if (!existsSync(ENV_PATH) || !existsSync(DATABASE_PATH) || !existsSync(CREDENTIAL_PATH)) throw new Error("Prepare synthetic staging before start.");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("A reviewed production build is required before staging start.");
  const buildReceiptPath = path.join(REPORT_ROOT, "current-build.json");
  if (!existsSync(buildReceiptPath)) throw new Error("A current staging build receipt is required before staging start.");
  if (await portOwner()) throw new Error("Port 3188 is already in use; refusing to stop or replace an unrelated process.");
  const config = await loadPrivateConfig();
  const buildReceipt = JSON.parse(await readFile(buildReceiptPath, "utf8"));
  const sourceSha = git(["rev-parse", "HEAD"]);
  const buildId = String(await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim();
  if (buildReceipt.sourceSha !== sourceSha || buildReceipt.buildId !== buildId) {
    throw new Error("The staging production build does not match the current source HEAD. Run staging:build again.");
  }
  const env = buildEnvironment(config);
  const nextBin = require.resolve("next/dist/bin/next");
  const logHandle = await import("node:fs").then(({ openSync }) => openSync(path.join(LOG_ROOT, "server.log"), "a"));
  const child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], { cwd: ROOT, env, detached: true, stdio: ["ignore", logHandle, logHandle], windowsHide: true });
  child.unref();
  const receipt = { pid: child.pid, host: HOST, port: PORT, sourceSha, buildId, commandFingerprint: sha256([nextBin, "start", HOST, String(PORT)].join("\0")), startedAt: new Date().toISOString() };
  await writeFile(PID_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await portOwner()) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Private staging server did not become ready.");
}

export async function build() {
  if (!existsSync(ENV_PATH) || !existsSync(DATABASE_PATH)) throw new Error("Prepare synthetic staging before build.");
  const config = await loadPrivateConfig();
  const env = buildEnvironment(config);
  const startedAt = Date.now();
  run("npm.cmd", ["run", "build"], { env, timeout: 900_000 });
  const buildId = String(await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim();
  const appPaths = JSON.parse(await readFile(path.join(ROOT, ".next", "server", "app-paths-manifest.json"), "utf8"));
  const receipt = { sourceSha: git(["rev-parse", "HEAD"]), buildId, routeCount: Object.keys(appPaths).length, routeCountSource: ".next/server/app-paths-manifest.json", durationMs: Date.now() - startedAt, database: "SYNTHETIC_ONLY", createdAt: new Date().toISOString() };
  await writeFile(path.join(REPORT_ROOT, "current-build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export async function stop() {
  if (!existsSync(PID_PATH)) return { stopped: false, reason: "NO_RECORDED_STAGING_PROCESS" };
  const receipt = JSON.parse(await readFile(PID_PATH, "utf8"));
  if (!await portOwner()) {
    await rm(PID_PATH, { force: true });
    return { stopped: true, pid: receipt.pid, alreadyExited: true };
  }
  if (!await verifiedRecordedProcess(receipt)) {
    if (!await portOwner()) {
      await rm(PID_PATH, { force: true });
      return { stopped: true, pid: receipt.pid, alreadyExited: true };
    }
    throw new Error("Recorded PID is not the verified Stage 3 server; refusing to kill it.");
  }
  process.kill(receipt.pid, "SIGTERM");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && await portOwner()) await new Promise((resolve) => setTimeout(resolve, 250));
  if (await portOwner()) throw new Error("Verified staging process did not stop cleanly.");
  await rm(PID_PATH, { force: true });
  return { stopped: true, pid: receipt.pid };
}

export async function reset({ confirmation }) {
  if (confirmation !== RESET_PHRASE) throw new Error(`Reset requires exact confirmation: ${RESET_PHRASE}`);
  if (await portOwner()) throw new Error("Stop staging before reset.");
  if (existsSync(PID_PATH)) throw new Error("A stale process receipt requires inspection before reset.");
  assertStagingPath(STAGING_ROOT, true);
  await rm(STAGING_ROOT, { recursive: true, force: false });
  return prepare({ confirmation: PREPARE_PHRASE });
}

export async function cleanup({ confirmation }) {
  if (confirmation !== CLEANUP_PHRASE) throw new Error(`Cleanup requires exact confirmation: ${CLEANUP_PHRASE}`);
  if (existsSync(PID_PATH)) await stop();
  if (!existsSync(STAGING_ROOT)) return { cleaned: false };
  assertStagingPath(STAGING_ROOT, true);
  await rm(STAGING_ROOT, { recursive: true, force: false });
  return { cleaned: true };
}

export async function smoke() {
  if (!await portOwner()) throw new Error("Private staging server is not running.");
  const config = await loadPrivateConfig();
  const credentials = JSON.parse(await readFile(CREDENTIAL_PATH, "utf8"));
  const db = new DatabaseSync(DATABASE_PATH);
  const sessions = [];
  try {
    for (const entry of credentials.users.filter((user) => user.active && ["OWNER", "PICKER", "MARKER", "ASSEMBLER", "PACKER", "VIEW_ALL", "IMPORT_MANAGER"].includes(user.scenario))) {
      const user = db.prepare('SELECT "id", "accountId" FROM "User" WHERE "username" = ?').get(entry.username);
      const sessionId = `stage3-smoke-${sha256(`${entry.username}-${Date.now()}`).slice(0, 20)}`;
      db.prepare('INSERT INTO "UserDeviceSession" ("id","userId","ipAddress","userAgent","firstSeenAt","lastSeenAt","active") VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)').run(sessionId, user.id, HOST, "stage3-synthetic-smoke");
      const payload = Buffer.from(JSON.stringify({ userId: user.id, sessionId })).toString("base64url");
      const signature = (await import("node:crypto")).createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
      sessions.push({ scenario: entry.scenario, cookie: `mpp_stage3_session=${payload}.${signature}; mpp_stage3_account=${user.accountId}` });
    }
  } finally { db.close(); }
  const publicResponse = await fetch(`http://${HOST}:${PORT}/login`, { redirect: "manual" });
  const publicBody = await publicResponse.text();
  if (publicResponse.status !== 200 || !publicBody.includes("PRIVATE SYNTHETIC STAGING")) throw new Error("Login page or synthetic staging banner smoke failed.");
  const routeMap = {
    OWNER: ["/dashboard", "/owner/users", "/owner/product-inventory", "/owner/imports", "/owner/catalog/missing", "/owner/consignments", "/owner/data-management", "/work", "/work/problems"],
    PICKER: ["/work/pick", "/work/scan"], MARKER: ["/work/mark"], ASSEMBLER: ["/work/assemble"], PACKER: ["/work/pack"], VIEW_ALL: ["/work"], IMPORT_MANAGER: ["/owner/consignments"]
  };
  const routeResults = [];
  for (const session of sessions) for (const route of routeMap[session.scenario] ?? []) {
    const response = await fetch(`http://${HOST}:${PORT}${route}`, { headers: { cookie: session.cookie }, redirect: "manual" });
    const body = await response.text();
    const location = response.headers.get("location");
    if (response.status !== 200 || body.includes(DATABASE_PATH) || body.includes(config.sessionSecret)) throw new Error(`Protected route smoke failed for ${session.scenario} ${route}: status ${response.status}, location ${location ?? "none"}.`);
    routeResults.push({ scenario: session.scenario, route, status: response.status });
  }
  const picker = sessions.find((session) => session.scenario === "PICKER");
  const denied = await fetch(`http://${HOST}:${PORT}/owner/users`, { headers: { cookie: picker.cookie }, redirect: "manual" });
  if (denied.status === 200 || denied.status >= 500) throw new Error("Worker authorization denial smoke failed.");
  const foreignSession = await fetch(`http://${HOST}:${PORT}/owner/users`, { headers: { cookie: "mpp_stage3_session=production-like.invalid; mpp_stage3_account=production-like; mpp_session=production-like.invalid; mpp_account=production-like" }, redirect: "manual" });
  if (foreignSession.status === 200 || foreignSession.status >= 500) throw new Error("Foreign/production-like session was not rejected.");
  const disabled = credentials.users.find((user) => !user.active);
  const disabledRow = new DatabaseSync(DATABASE_PATH, { readOnly: true });
  try { if (!disabled || Number(disabledRow.prepare('SELECT "active" FROM "User" WHERE "username" = ?').get(disabled.username).active) !== 0) throw new Error("Disabled synthetic user is not disabled."); }
  finally { disabledRow.close(); }
  const result = { loginStatus: 200, stagingBannerVisible: true, routeResults, routeCount: routeResults.length, workerDeniedStatus: denied.status, foreignSessionRejectedStatus: foreignSession.status, disabledUserRejectedByState: true, isolatedCookieNames: true, boundHost: HOST, port: PORT, syntheticOnly: true, createdAt: new Date().toISOString() };
  await writeFile(path.join(REPORT_ROOT, "smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
