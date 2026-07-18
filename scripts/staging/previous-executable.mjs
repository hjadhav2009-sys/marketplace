import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ROOT, STAGING_ROOT, assertStagingPath, git, isInside, sha256 } from "./core.mjs";

const SOURCE_SHA = "2981db0187c02e9c02174d1f12d0a5c4509359de";
const WORKTREE = path.join(STAGING_ROOT, "rollback-worktree", SOURCE_SHA);
const ARTIFACT_ROOT = path.join(ROOT, "backups", "release-artifacts", SOURCE_SHA);
const SMOKE_DB = path.join(STAGING_ROOT, "database", "previous-main-smoke.db");
const PORT = 3189;

function safeEnv(overrides) {
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "NODE_OPTIONS"]) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...overrides };
}

function command(command, args, options = {}) {
  if (command === "git") args = ["-c", `safe.directory=${ROOT.replace(/\\/g, "/")}`, ...args];
  const isCmd = process.platform === "win32" && command.endsWith(".cmd");
  const result = spawnSync(isCmd ? "cmd.exe" : command, isCmd ? ["/d", "/s", "/c", command, ...args] : args, { cwd: options.cwd ?? ROOT, env: options.env ?? safeEnv({}), encoding: "utf8", windowsHide: true, timeout: options.timeout ?? 600_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error).slice(-3000)}`);
  return result;
}

async function portOpen() {
  return new Promise((resolve) => { const socket = net.createConnection({ host: "127.0.0.1", port: PORT }); const done = (value) => { socket.destroy(); resolve(value); }; socket.setTimeout(500, () => done(false)); socket.once("connect", () => done(true)); socket.once("error", () => done(false)); });
}

async function hashFiles(root) {
  const rows = [];
  async function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name); const relative = path.relative(root, absolute).replace(/\\/g, "/");
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && relative !== "PreviousExecutableArtifactManifestV1.json") rows.push({ path: relative, size: statSync(absolute).size, sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex") });
      else throw new Error("Rollback artifact contains an unsupported filesystem entry.");
    }
  }
  await walk(root);
  return { files: rows, aggregateSha256: sha256(rows.map((row) => `${row.path}\0${row.size}\0${row.sha256}`).join("\n")) };
}

if (git(["rev-parse", SOURCE_SHA]) !== SOURCE_SHA) throw new Error("Previous-main rollback SHA is unavailable locally.");
if (existsSync(ARTIFACT_ROOT)) {
  if (existsSync(path.join(ARTIFACT_ROOT, "PreviousExecutableArtifactManifestV1.json")) || readdirSync(ARTIFACT_ROOT).length) throw new Error("Rollback artifact already exists; refusing to overwrite retained evidence.");
  await rm(ARTIFACT_ROOT, { recursive: true, force: false });
}
if (await portOpen()) throw new Error("Rollback smoke port 3189 is already in use.");
assertStagingPath(WORKTREE);
assertStagingPath(SMOKE_DB);
if (!isInside(path.join(ROOT, "backups", "release-artifacts"), ARTIFACT_ROOT)) throw new Error("Rollback artifact target escaped the reviewed executable-artifact root.");
await mkdir(path.dirname(WORKTREE), { recursive: true });
await mkdir(path.dirname(ARTIFACT_ROOT), { recursive: true });
await mkdir(ARTIFACT_ROOT, { recursive: false });

let worktreeAdded = false;
let child;
let serverLog = "";
try {
  command("git", ["worktree", "add", "--detach", WORKTREE, SOURCE_SHA], { timeout: 120_000 }); worktreeAdded = true;
  command("npm.cmd", ["ci", "--ignore-scripts"], { cwd: WORKTREE, timeout: 900_000 });
  if (existsSync(path.join(WORKTREE, "mobile-app", "package-lock.json"))) command("npm.cmd", ["ci", "--ignore-scripts"], { cwd: path.join(WORKTREE, "mobile-app"), timeout: 900_000 });
  const secret = randomBytes(48).toString("base64url");
  const env = safeEnv({ NODE_ENV: "production", DATABASE_URL: `file:${SMOKE_DB.replace(/\\/g, "/")}`, SESSION_SECRET: secret, SESSION_COOKIE_SECURE: "false", NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`, PORT: String(PORT), SKIP_PRISMA_MIGRATE: "true" });
  command("npx.cmd", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], { cwd: WORKTREE, env, timeout: 300_000 });
  command("npm.cmd", ["run", "build"], { cwd: WORKTREE, env, timeout: 900_000 });

  const db = new DatabaseSync(SMOKE_DB);
  try {
    db.prepare('INSERT INTO "Account" ("id","name","code","companyName","marketplace","accountDisplayName","accountCode","active","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run("stage3-rollback-account", "Synthetic Rollback Account", "STAGE-ROLLBACK", "Synthetic Warehouse", "FLIPKART", "Synthetic Rollback Account", "STAGE-ROLLBACK", 1);
    db.prepare('INSERT INTO "User" ("id","username","passwordHash","name","role","active","canPick","canPack","canReportProblem","accountId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run("stage3-rollback-owner", "stage3-rollback-owner", "synthetic-smoke-only", "Synthetic Rollback Owner", "OWNER", 1, 0, 0, 1, "stage3-rollback-account");
    db.prepare('INSERT INTO "UserDeviceSession" ("id","userId","ipAddress","userAgent","firstSeenAt","lastSeenAt","active") VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)').run("stage3-rollback-session", "stage3-rollback-owner", "127.0.0.1", "stage3-rollback-smoke");
  } finally { db.close(); }
  const payload = Buffer.from(JSON.stringify({ userId: "stage3-rollback-owner", sessionId: "stage3-rollback-session" })).toString("base64url");
  const cookie = `mpp_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}; mpp_account=stage3-rollback-account`;
  const nextBin = path.join(WORKTREE, "node_modules", "next", "dist", "bin", "next");
  child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(PORT)], { cwd: WORKTREE, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { serverLog += chunk; }); child.stderr.on("data", (chunk) => { serverLog += chunk; });
  const deadline = Date.now() + 90_000; while (Date.now() < deadline && !await portOpen()) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!await portOpen()) throw new Error("Previous executable did not start.");
  const login = await fetch(`http://127.0.0.1:${PORT}/login`, { redirect: "manual" });
  const dashboard = await fetch(`http://127.0.0.1:${PORT}/dashboard`, { headers: { cookie }, redirect: "manual" });
  if (login.status !== 200 || dashboard.status >= 500) throw new Error("Previous executable smoke routes failed.");

  await cp(path.join(WORKTREE, ".next"), path.join(ARTIFACT_ROOT, ".next"), { recursive: true, filter: (source) => !source.includes(`${path.sep}cache${path.sep}`) });
  for (const relative of ["package.json", "package-lock.json", "next.config.ts", "prisma", "scripts", "public"]) if (existsSync(path.join(WORKTREE, relative))) await cp(path.join(WORKTREE, relative), path.join(ARTIFACT_ROOT, relative), { recursive: true });
  command("git", ["archive", "--format=zip", `--output=${path.join(ARTIFACT_ROOT, "source.zip")}`, SOURCE_SHA]);
  const lockHash = createHash("sha256").update(await readFile(path.join(WORKTREE, "package-lock.json"))).digest("hex");
  const migrations = readdirSync(path.join(WORKTREE, "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const hashed = await hashFiles(ARTIFACT_ROOT);
  const manifest = { manifestType: "PreviousExecutableArtifactManifestV1", commitSha: SOURCE_SHA, artifactSha256: hashed.aggregateSha256, buildId: String(await readFile(path.join(WORKTREE, ".next", "BUILD_ID"), "utf8")).trim(), nodeVersion: process.version, packageLockSha256: lockHash, migrationCount: migrations.length, migrations, createdAt: new Date().toISOString(), artifactFormat: "NEXT_BUILD_PLUS_REPRODUCIBLE_SOURCE", fileCount: hashed.files.length, smokeTest: { status: "PASSED", host: "127.0.0.1", port: PORT, loginStatus: login.status, dashboardStatus: dashboard.status, database: "SYNTHETIC_ONLY" } };
  await writeFile(path.join(ARTIFACT_ROOT, "PreviousExecutableArtifactManifestV1.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  await mkdir(path.join(STAGING_ROOT, "reports"), { recursive: true });
  await writeFile(path.join(STAGING_ROOT, "reports", "previous-executable.json"), `${JSON.stringify({ artifactRoot: ARTIFACT_ROOT, ...manifest }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ artifactRoot: ARTIFACT_ROOT, ...manifest }, null, 2));
} finally {
  if (child) { child.kill("SIGTERM"); await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 5000); }); }
  if (serverLog) { await mkdir(path.join(STAGING_ROOT, "logs"), { recursive: true }); await writeFile(path.join(STAGING_ROOT, "logs", "previous-executable-server.log"), serverLog.replaceAll(SMOKE_DB, "<SYNTHETIC_DATABASE>")); }
  await rm(SMOKE_DB, { force: true });
  await rm(`${SMOKE_DB}-wal`, { force: true }); await rm(`${SMOKE_DB}-shm`, { force: true });
  if (worktreeAdded) {
    try { command("git", ["worktree", "remove", "--force", WORKTREE], { timeout: 300_000 }); }
    catch (error) {
      if (!existsSync(WORKTREE)) throw error;
      if (process.platform === "win32") {
        const escaped = WORKTREE.replaceAll("'", "''");
        command("powershell.exe", ["-NoProfile", "-Command", `$target=[System.IO.Path]::GetFullPath('${escaped}');$boundary=[System.IO.Path]::GetFullPath('${path.dirname(WORKTREE).replaceAll("'", "''")}')+[System.IO.Path]::DirectorySeparatorChar;if(-not $target.StartsWith($boundary,[System.StringComparison]::OrdinalIgnoreCase)){throw 'Rollback cleanup escaped boundary'};[System.IO.Directory]::Delete('\\\\?\\'+$target,$true)`], { timeout: 300_000 });
      } else await rm(WORKTREE, { recursive: true, force: false });
      command("git", ["worktree", "prune"]);
    }
  }
  if (existsSync(path.dirname(WORKTREE))) await rm(path.dirname(WORKTREE), { recursive: true, force: true });
}
