import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
export const START_LOCK_PATH = path.join(RUNTIME_ROOT, "start.lock.json");
export const CREDENTIAL_PATH = path.join(CREDENTIALS_ROOT, "synthetic-users.json");
export const SERVER_STDOUT_PATH = path.join(LOG_ROOT, "server.out.log");
export const SERVER_STDERR_PATH = path.join(LOG_ROOT, "server.err.log");
const requestedPort = process.env.STAGE3_STAGING_PORT ? Number(process.env.STAGE3_STAGING_PORT) : 3188;
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error("Invalid private staging port.");
if (requestedPort !== 3188 && requestedStagingRoot === defaultStagingRoot) throw new Error("A staging-port override is permitted only for an isolated Stage 3 test directory.");
export const PORT = requestedPort;
export const HOST = "127.0.0.1";
export const PREPARE_PHRASE = "APPROVE PRIVATE SYNTHETIC STAGING PREPARATION";
export const RESET_PHRASE = "RESET SYNTHETIC STAGING";
export const CLEANUP_PHRASE = "CLEANUP SYNTHETIC STAGING";
export const SEED_VERSION = "phase-7.3.6-stage4.6-reconciled-ui-v1";
const START_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 15_000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

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

export function buildEnvironment(config, runtimeIdentity = {}) {
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
    STAGING_UI_AUDIT: "true",
    STAGE3_RUNTIME_IDENTITY_TOKEN: config.runtimeIdentityToken,
    STAGE3_SOURCE_SHA: runtimeIdentity.sourceSha ?? config.sourceSha,
    STAGE3_BUILD_ID: runtimeIdentity.buildId ?? "",
    STAGE3_COMMAND_FINGERPRINT: runtimeIdentity.commandFingerprint ?? "",
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch { return null; }
}

export function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

export function processInfo(pid) {
  if (!pidExists(pid)) return null;
  if (process.platform === "win32") {
    const script = `try{$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop;if($p){[pscustomobject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;executablePath=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress}}catch{$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if($p){[pscustomobject]@{pid=[int]$p.Id;parentPid=0;executablePath=[string]$p.Path;commandLine=$null}|ConvertTo-Json -Compress}}`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    if (result.status !== 0 || !String(result.stdout).trim()) return null;
    try { return JSON.parse(String(result.stdout).trim()); }
    catch { return null; }
  }
  const result = spawnSync("ps", ["-o", "pid=,ppid=,command=", "-p", String(pid)], { encoding: "utf8", timeout: 10_000 });
  const line = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !line) return null;
  const match = line.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
  return match ? { pid: Number(match[1]), parentPid: Number(match[2]), executablePath: "", commandLine: match[3] } : null;
}

function expectedServerCommand() {
  const nextBin = require.resolve("next/dist/bin/next");
  const args = [nextBin, "start", "-H", HOST, "-p", String(PORT)];
  return {
    nextBin,
    args,
    commandLine: [process.execPath, ...args].join(" "),
    commandFingerprint: sha256([nextBin, "start", HOST, String(PORT)].join("\0"))
  };
}

function commandMatchesReceipt(info, receipt) {
  if (!info || info.pid !== receipt.pid) return false;
  const expected = expectedServerCommand();
  if (receipt.commandFingerprint !== expected.commandFingerprint) return false;
  if (!info.commandLine) {
    const executable = String(info.executablePath ?? "").replaceAll("\\", "/").toLowerCase();
    return executable === process.execPath.replaceAll("\\", "/").toLowerCase() && receipt.commandLine === expected.commandLine;
  }
  const command = String(info.commandLine ?? "").replaceAll("\\", "/").toLowerCase();
  const nextBin = expected.nextBin.replaceAll("\\", "/").toLowerCase();
  return command.includes(nextBin) && command.includes(" start ") && command.includes(` -h ${HOST}`) && command.includes(` -p ${PORT}`);
}

async function currentBuildIdentity() {
  const buildReceiptPath = path.join(REPORT_ROOT, "current-build.json");
  const buildIdPath = path.join(ROOT, ".next", "BUILD_ID");
  const buildReceipt = await readJsonIfExists(buildReceiptPath);
  if (!buildReceipt || !existsSync(buildIdPath)) return null;
  const sourceSha = git(["rev-parse", "HEAD"]);
  const buildId = String(await readFile(buildIdPath, "utf8")).trim();
  return {
    sourceSha,
    buildId,
    receiptMatches: buildReceipt.sourceSha === sourceSha && buildReceipt.buildId === buildId,
    buildReceipt
  };
}

async function rotateLog(filePath) {
  if (!existsSync(filePath)) return;
  const info = await stat(filePath);
  if (info.size < MAX_LOG_BYTES) return;
  const rotated = `${filePath}.1`;
  await rm(rotated, { force: true });
  await rename(filePath, rotated);
}

async function tailLog(filePath, maxLines = 80) {
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

async function acquireStartLock() {
  await mkdir(RUNTIME_ROOT, { recursive: true });
  const lock = { pid: process.pid, startedAt: new Date().toISOString(), token: randomBytes(16).toString("hex") };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(START_LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx" });
      return lock;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readJsonIfExists(START_LOCK_PATH);
      if (existing?.pid && pidExists(existing.pid)) throw new Error("STAGING_START_ALREADY_IN_PROGRESS");
      if (existing?.pid && !pidExists(existing.pid)) await rm(START_LOCK_PATH, { force: true });
      else throw new Error("STAGING_START_ALREADY_IN_PROGRESS");
    }
  }
  throw new Error("STAGING_START_ALREADY_IN_PROGRESS");
}

async function releaseStartLock(lock) {
  const current = await readJsonIfExists(START_LOCK_PATH);
  if (current?.token === lock.token && current.pid === lock.pid) await rm(START_LOCK_PATH, { force: true });
}

async function fetchWithTimeout(url, timeoutMs = 5_000) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return { status: response.status, response };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeHealth(receipt, timeoutMs = 5_000) {
  const config = await loadPrivateConfig();
  const [login, identityResponse] = await Promise.all([
    fetchWithTimeout(`http://${HOST}:${PORT}/login`, timeoutMs),
    fetchWithTimeout(`http://${HOST}:${PORT}/api/staging/identity`, timeoutMs)
  ]);
  let identity = null;
  if (identityResponse.response) {
    try { identity = await identityResponse.response.json(); }
    catch { identity = null; }
  }
  const identityTokenMatches = identityResponse.status === 200
    && identity?.environment === "PRIVATE_SYNTHETIC_STAGING"
    && identity?.pid === receipt.pid
    && identity?.tokenSha256 === sha256(config.runtimeIdentityToken);
  const identityMatches = identityTokenMatches
    && identity?.sourceSha === receipt.sourceSha
    && identity?.buildId === receipt.buildId
    && identity?.commandFingerprint === receipt.commandFingerprint;
  return {
    healthy: login.status === 200 && identityMatches,
    loginStatus: login.status,
    identityStatus: identityResponse.status,
    identity,
    identityTokenMatches,
    identityMatches
  };
}

async function waitForPortClosed(timeoutMs = STOP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await portOwner()) return true;
    await delay(250);
  }
  return !await portOwner();
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
  const lifecycle = await status();
  return {
    environment: "PRIVATE_SYNTHETIC_STAGING",
    branch,
    sourceSha,
    host: HOST,
    port: PORT,
    portOpen: lifecycle.portOpen,
    lifecycle,
    processReceipt: lifecycle.receipt ? {
      pid: lifecycle.receipt.pid,
      launcherPid: lifecycle.receipt.launcherPid ?? null,
      sourceSha: lifecycle.receipt.sourceSha,
      buildId: lifecycle.receipt.buildId,
      startedAt: lifecycle.receipt.startedAt
    } : null,
    database: inspectDatabase(),
    credentialsPresent: existsSync(CREDENTIAL_PATH),
    seedVersion: SEED_VERSION,
    productionPathsReferenced: false
  };
}

async function verifiedRecordedProcess(receipt, { allowLegacyIdentity = false } = {}) {
  if (!Number.isInteger(receipt.pid) || receipt.pid <= 0 || receipt.port !== PORT || receipt.host !== HOST) return false;
  const info = processInfo(receipt.pid);
  const legacyCommandVerified = allowLegacyIdentity
    && !receipt.commandLine
    && receipt.commandFingerprint === expectedServerCommand().commandFingerprint
    && String(info?.executablePath ?? "").replaceAll("\\", "/").toLowerCase() === process.execPath.replaceAll("\\", "/").toLowerCase();
  if (!commandMatchesReceipt(info, receipt) && !legacyCommandVerified) return false;
  const health = await probeHealth(receipt);
  return health.identityMatches || (allowLegacyIdentity && health.identityTokenMatches && health.identity?.sourceSha == null && health.identity?.buildId == null);
}

export async function status() {
  const receipt = await readJsonIfExists(PID_PATH);
  const portOpen = await portOwner();
  const build = await currentBuildIdentity();
  const base = {
    environment: "PRIVATE_SYNTHETIC_STAGING",
    state: "STOPPED",
    pid: receipt?.pid ?? null,
    port: PORT,
    portOpen,
    sourceSha: build?.sourceSha ?? git(["rev-parse", "HEAD"]),
    buildId: build?.buildId ?? null,
    loginStatus: null,
    identityStatus: null,
    logPaths: receipt?.logPaths ?? { stdout: SERVER_STDOUT_PATH, stderr: SERVER_STDERR_PATH },
    receipt
  };
  if (!receipt) return { ...base, state: portOpen ? "MISMATCHED" : "STOPPED" };
  const alive = pidExists(receipt.pid);
  const info = alive ? processInfo(receipt.pid) : null;
  if (!alive && !portOpen) return { ...base, state: "STALE", processAlive: false, commandVerified: false };
  const commandVerified = commandMatchesReceipt(info, receipt);
  const health = portOpen ? await probeHealth(receipt) : { healthy: false, loginStatus: null, identityStatus: null, identityMatches: false };
  const exactBuild = Boolean(build?.receiptMatches && receipt.sourceSha === build.sourceSha && receipt.buildId === build.buildId);
  const state = alive && portOpen && commandVerified && health.healthy && exactBuild ? "RUNNING" : "MISMATCHED";
  return {
    ...base,
    state,
    processAlive: alive,
    commandVerified,
    exactBuild,
    loginStatus: health.loginStatus,
    identityStatus: health.identityStatus,
    identity: health.identity ?? null,
    process: info ? { pid: info.pid, parentPid: info.parentPid, executablePath: info.executablePath, commandLine: info.commandLine } : null
  };
}

export async function health() {
  const startedAt = Date.now();
  const result = await Promise.race([
    status(),
    delay(HEALTH_TIMEOUT_MS).then(() => { throw new Error("Staging health inspection exceeded 15 seconds."); })
  ]);
  return { ...result, healthy: result.state === "RUNNING", durationMs: Date.now() - startedAt };
}

async function stopStartedChild(receipt, { allowLegacy = false } = {}) {
  const info = processInfo(receipt.pid);
  const legacyCommandVerified = allowLegacy
    && !receipt.commandLine
    && receipt.commandFingerprint === expectedServerCommand().commandFingerprint
    && String(info?.executablePath ?? "").replaceAll("\\", "/").toLowerCase() === process.execPath.replaceAll("\\", "/").toLowerCase();
  if (!commandMatchesReceipt(info, receipt) && !legacyCommandVerified) return false;
  try { process.kill(receipt.pid, "SIGTERM"); } catch {}
  if (process.platform === "win32" && pidExists(receipt.pid)) {
    spawnSync("taskkill.exe", ["/PID", String(receipt.pid), "/T"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  }
  await waitForPortClosed();
  return !pidExists(receipt.pid) && !await portOwner();
}

export async function start() {
  if (!existsSync(ENV_PATH) || !existsSync(DATABASE_PATH) || !existsSync(CREDENTIAL_PATH)) throw new Error("Prepare synthetic staging before start.");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("A reviewed production build is required before staging start.");
  const lock = await acquireStartLock();
  let startedReceipt = null;
  try {
    const current = await status();
    if (current.state === "RUNNING") {
      return {
        status: "STAGING_ALREADY_RUNNING",
        alreadyRunning: true,
        pid: current.pid,
        host: HOST,
        port: PORT,
        sourceSha: current.receipt.sourceSha,
        buildId: current.receipt.buildId,
        loginStatus: current.loginStatus,
        identityStatus: current.identityStatus
      };
    }
    if (current.state === "MISMATCHED") throw new Error("STAGING_SERVER_MISMATCHED: Port or receipt belongs to a different process/build; use staging:status and staging:stop only when ownership is verified.");
    if (current.state === "STALE") {
      if (pidExists(current.receipt.pid) || await portOwner()) throw new Error("STAGING_STALE_RECEIPT_NOT_SAFE_TO_REMOVE");
      await rm(PID_PATH, { force: true });
    }
    const build = await currentBuildIdentity();
    if (!build?.receiptMatches) throw new Error("The staging production build does not match the current source HEAD. Run staging:build again.");
    const config = await loadPrivateConfig();
    const command = expectedServerCommand();
    const env = buildEnvironment(config, { sourceSha: build.sourceSha, buildId: build.buildId, commandFingerprint: command.commandFingerprint });
    await rotateLog(SERVER_STDOUT_PATH);
    await rotateLog(SERVER_STDERR_PATH);
    const stdout = openSync(SERVER_STDOUT_PATH, "a");
    const stderr = openSync(SERVER_STDERR_PATH, "a");
    let child;
    try {
      const spawnArgs = requestedStagingRoot !== defaultStagingRoot && process.env.STAGE3_TEST_FAIL_CHILD_START === "true"
        ? [path.join(STAGING_ROOT, "runtime", "missing-staging-entrypoint.mjs")]
        : command.args;
      child = spawn(process.execPath, spawnArgs, { cwd: ROOT, env, detached: true, stdio: ["ignore", stdout, stderr], windowsHide: true });
    } finally {
      closeSync(stdout);
      closeSync(stderr);
    }
    child.unref();
    startedReceipt = {
      launcherPid: process.pid,
      pid: child.pid,
      serverPid: child.pid,
      host: HOST,
      port: PORT,
      sourceSha: build.sourceSha,
      buildId: build.buildId,
      commandLine: command.commandLine,
      commandFingerprint: command.commandFingerprint,
      databasePath: DATABASE_PATH,
      storagePath: STORAGE_ROOT,
      logPaths: { stdout: SERVER_STDOUT_PATH, stderr: SERVER_STDERR_PATH },
      startedAt: new Date().toISOString()
    };
    await writeFile(PID_PATH, `${JSON.stringify(startedReceipt, null, 2)}\n`, { flag: "wx" });
    const deadline = Date.now() + START_TIMEOUT_MS;
    let lastHealth = null;
    while (Date.now() < deadline) {
      if (!pidExists(child.pid)) throw new Error("Staging server child exited before becoming healthy.");
      if (await portOwner()) {
        lastHealth = await probeHealth(startedReceipt);
        if (lastHealth.healthy) return {
          status: "RUNNING",
          alreadyRunning: false,
          pid: child.pid,
          host: HOST,
          port: PORT,
          sourceSha: build.sourceSha,
          buildId: build.buildId,
          loginStatus: lastHealth.loginStatus,
          identityStatus: lastHealth.identityStatus,
          logPaths: startedReceipt.logPaths,
          startedAt: startedReceipt.startedAt
        };
      }
      await delay(500);
    }
    throw new Error(`Private staging server did not become healthy within ${START_TIMEOUT_MS / 1000} seconds.`);
  } catch (error) {
    if (startedReceipt) {
      await stopStartedChild(startedReceipt);
      const currentReceipt = await readJsonIfExists(PID_PATH);
      if (currentReceipt?.pid === startedReceipt.pid && currentReceipt?.startedAt === startedReceipt.startedAt) await rm(PID_PATH, { force: true });
    }
    const logs = {
      stdout: await tailLog(SERVER_STDOUT_PATH),
      stderr: await tailLog(SERVER_STDERR_PATH)
    };
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nSTAGING_START_LOG_TAIL=${JSON.stringify(logs)}`);
  } finally {
    await releaseStartLock(lock);
  }
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
  const receipt = await readJsonIfExists(PID_PATH);
  if (!receipt) throw new Error("The staging process receipt is unreadable; refusing to stop any process.");
  const portOpen = await portOwner();
  const alive = pidExists(receipt.pid);
  if (!portOpen && !alive) {
    await rm(PID_PATH, { force: true });
    return { stopped: true, pid: receipt.pid, alreadyExited: true };
  }
  if (!await verifiedRecordedProcess(receipt, { allowLegacyIdentity: true })) {
    if (!await portOwner() && !pidExists(receipt.pid)) {
      await rm(PID_PATH, { force: true });
      return { stopped: true, pid: receipt.pid, alreadyExited: true };
    }
    throw new Error("Recorded PID is not the verified Stage 3 server; refusing to kill it.");
  }
  const stopped = await stopStartedChild(receipt, { allowLegacy: true });
  if (!stopped) throw new Error("Verified staging process did not stop cleanly.");
  await rm(PID_PATH, { force: true });
  return { stopped: true, pid: receipt.pid };
}

export async function restart() {
  const before = await status();
  let stopResult = null;
  if (before.receipt) stopResult = await stop();
  else if (before.portOpen) throw new Error(`Port ${PORT} is occupied without a verified staging receipt; refusing to restart.`);
  const startResult = await start();
  const after = await health();
  if (!after.healthy) throw new Error("Staging restart completed without a healthy exact-build server.");
  return { before: before.state, stop: stopResult, start: startResult, after: after.state };
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
