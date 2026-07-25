import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  COPIED_CONFIRMATION_PHRASE,
  STAGE2_ROOT,
  createCopiedBackup,
  createCopiedScopeFile,
  inspectCopiedCapacity,
  privateFingerprint,
  restoreCopiedBackup,
  verifyCopiedBackup,
  writeQuiescenceReceipt
} from "./copied-core.mjs";
import { ROOT, inspectSqliteDatabase, pathIsInside, sha256File } from "./core.mjs";
import { resolveRealDatabasePath } from "../real-db/safety.mjs";

const require = createRequire(import.meta.url);
const startedAt = Date.now();
const runId = `run-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const runRoot = path.join(STAGE2_ROOT, runId);
const privateReportPath = path.join(runRoot, "stage2-private-report.json");
const timings = {};

function elapsed(start) { return Date.now() - start; }
function hashValue(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function safeDecision(error) {
  const code = error?.code;
  if (code === "ACTIVE_WRITER" || code === "SOURCE_CHANGED_DURING_BACKUP") return "STAGE2_BLOCKED_ACTIVE_WRITER";
  if (code === "INSUFFICIENT_CAPACITY") return "STAGE2_BLOCKED_CAPACITY";
  if (/SCOPE|SOURCE_MISSING|SYMLINK/.test(String(code))) return "STAGE2_BLOCKED_STORAGE_SCOPE";
  if (/RESTORE|DATABASE_HASH|STORAGE_HASH/.test(String(code))) return "STAGE2_BLOCKED_RESTORE";
  if (/MIGRATION/.test(String(code))) return "STAGE2_BLOCKED_MIGRATION";
  if (/SMOKE/.test(String(code))) return "STAGE2_BLOCKED_APPLICATION_SMOKE";
  if (/ACL|PRIVACY|ENCRYPT/.test(String(code))) return "STAGE2_BLOCKED_PRIVACY_OR_ENCRYPTION";
  return "STAGE2_BLOCKED_BACKUP";
}

async function timed(name, operation) {
  const start = Date.now();
  const result = await operation();
  timings[name] = elapsed(start);
  return result;
}

async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(800, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function otherNodeProcesses() {
  if (process.platform !== "win32") return [];
  const command = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (result.error || result.status !== 0) return ["PROCESS_CHECK_FAILED"];
  const raw = String(result.stdout ?? "").trim();
  if (!raw) return [];
  let processes;
  try {
    const parsed = JSON.parse(raw);
    processes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return ["PROCESS_CHECK_FAILED"];
  }
  const repositoryPath = ROOT.toLowerCase();
  return processes
    .filter((entry) => Number(entry.ProcessId) !== process.pid)
    .filter((entry) => String(entry.CommandLine ?? "").toLowerCase().includes(repositoryPath))
    .map((entry) => Number(entry.ProcessId))
    .filter(Boolean);
}

function currentApplicationCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  const commit = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(commit)) {
    const error = new Error("Current application commit could not be resolved.");
    error.code = "APPLICATION_COMMIT_UNAVAILABLE";
    throw error;
  }
  return commit;
}

function restrictAndInspectAcl(directory) {
  if (process.platform !== "win32") return { status: "NOT_WINDOWS", broadAccess: false };
  const identity = spawnSync("whoami.exe", [], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  const principal = String(identity.stdout ?? "").trim();
  if (identity.status !== 0 || !principal.includes("\\")) { const error = new Error("Current Windows principal could not be resolved."); error.code = "ACL_PREFLIGHT_FAILED"; throw error; }
  const changed = spawnSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `${principal}:(OI)(CI)F`, "SYSTEM:(OI)(CI)F"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (changed.status !== 0) { const error = new Error("Private rehearsal ACL restriction failed."); error.code = "ACL_PREFLIGHT_FAILED"; throw error; }
  const inspected = spawnSync("icacls.exe", [directory], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  const acl = String(inspected.stdout ?? "");
  const broadAccess = /Everyone|Authenticated Users|BUILTIN\\Users/i.test(acl);
  if (inspected.status !== 0 || broadAccess) { const error = new Error("Private rehearsal ACL remains too broad."); error.code = "ACL_PREFLIGHT_FAILED"; throw error; }
  return { status: "RESTRICTED_CURRENT_USER_AND_SYSTEM", broadAccess: false };
}

function encryptionObservation(volumeRoot) {
  if (process.platform !== "win32") return { status: "UNKNOWN", ownerDecision: "ENCRYPTION_OWNER_DECISION_PENDING" };
  const result = spawnSync("manage-bde.exe", ["-status", path.parse(volumeRoot).root], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  const output = String(result.stdout ?? "");
  const fullyEncrypted = /Percentage Encrypted:\s*100(?:\.0)?%/i.test(output);
  const protectionOn = /Protection Status:\s*Protection On/i.test(output);
  return { status: result.status === 0 ? (fullyEncrypted && protectionOn ? "VOLUME_PROTECTED_OBSERVED" : "VOLUME_PROTECTION_NOT_CONFIRMED") : "VOLUME_PROTECTION_UNKNOWN", ownerDecision: "ENCRYPTION_OWNER_DECISION_PENDING" };
}

async function copySqliteSet(databasePath, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  const target = path.join(targetDirectory, "source.sqlite");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) if (existsSync(`${databasePath}${suffix}`)) await copyFile(`${databasePath}${suffix}`, `${target}${suffix}`);
  return target;
}

function activeImportLeases(copiedDatabase) {
  const db = new DatabaseSync(copiedDatabase, { readOnly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)));
    if (!tables.has("ImportJob")) return { activeLeaseCount: 0, legacyRunningCount: 0 };
    const columns = new Set(db.prepare('PRAGMA table_info("ImportJob")').all().map((row) => String(row.name)));
    const legacyRunningCount = Number(db.prepare('SELECT COUNT(*) AS count FROM "ImportJob" WHERE "status" = ?').get("RUNNING").count);
    if (!columns.has("runnerId") || !columns.has("leaseExpiresAt")) return { activeLeaseCount: 0, legacyRunningCount };
    const activeLeaseCount = Number(db.prepare('SELECT COUNT(*) AS count FROM "ImportJob" WHERE "status" = ? AND "runnerId" IS NOT NULL AND "leaseExpiresAt" > CURRENT_TIMESTAMP').get("RUNNING").count);
    return { activeLeaseCount, legacyRunningCount };
  } finally { db.close(); }
}

function migrationCommand(databasePath, args, logName, allowPendingStatus = false) {
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const commandArgs = ["/d", "/s", "/c", "npx.cmd", "prisma", ...args, "--schema", "prisma/schema.prisma"];
  if (commandArgs.some((value) => String(value).includes(resolveRealDatabasePath()))) { const error = new Error("Migration command referenced the production database."); error.code = "MIGRATION_SOURCE_PATH"; throw error; }
  const result = spawnSync("cmd.exe", commandArgs, { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", windowsHide: true, timeout: 300_000 });
  const safeLog = `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`.replaceAll(databasePath, "<COPIED_DATABASE>").replaceAll(databaseUrl, "file:<COPIED_DATABASE>");
  require("node:fs").writeFileSync(path.join(runRoot, logName), safeLog);
  const expectedPendingStatus = allowPendingStatus && result.status === 1 && /migrations have not yet been applied/i.test(safeLog);
  if (result.status !== 0 && !expectedPendingStatus) { const error = new Error("Copied migration command failed."); error.code = "MIGRATION_COMMAND_FAILED"; throw error; }
}

function relationalSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)));
    const groups = {
      accountListingIdentifier: ["Account", "MarketplaceListing", "MarketplaceListingIdentifier"],
      orderTaskProjection: ["Order", "WorkTask", "WorkGroupProjection"],
      consignmentLineTask: ["ConsignmentBatch", "ConsignmentLine", "WorkTask"],
      importIssues: ["ImportJob", "ImportRowIssue"]
    };
    const samples = {};
    const digests = Object.fromEntries(Object.entries(groups).map(([name, names]) => [name, hashValue(names.filter((table) => tables.has(table)).map((table) => {
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
      const primary = columns.filter((column) => Number(column.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => String(column.name));
      const keyColumns = primary.length ? primary : columns.some((column) => column.name === "id") ? ["id"] : [String(columns[0]?.name ?? "rowid")];
      const selected = keyColumns.map((column) => `"${column.replaceAll('"', '""')}"`).join(",");
      const rows = db.prepare(`SELECT ${selected} FROM "${table}" ORDER BY ${selected} LIMIT 25`).all();
      samples[table] = { keyColumns, rows };
      return `${table}:${hashValue(JSON.stringify(rows))}`;
    }).join("|"))]));
    return { digests, samples };
  } finally { db.close(); }
}

function verifyRelationalSamples(databasePath, before) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    for (const [table, sample] of Object.entries(before.samples)) {
      for (const row of sample.rows) {
        const where = sample.keyColumns.map((column) => `"${column.replaceAll('"', '""')}" = ?`).join(" AND ");
        const values = sample.keyColumns.map((column) => row[column]);
        if (Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE ${where}`).get(...values).count) !== 1) { const error = new Error("A bounded relational identity sample was not preserved."); error.code = "MIGRATION_DIGEST_MISMATCH"; throw error; }
      }
    }
    return { preserved: true, groupDigests: before.digests, sampledTables: Object.keys(before.samples).length, sampledRows: Object.values(before.samples).reduce((sum, sample) => sum + sample.rows.length, 0) };
  } finally { db.close(); }
}

function verifyMigrationCounts(before, after) {
  const decreases = [];
  const unexpectedGrowth = [];
  for (const [table, count] of Object.entries(before.tableCounts)) {
    const next = after.tableCounts[table];
    if (next === undefined || next < count) decreases.push(table);
    if (next > count && table !== "_prisma_migrations") unexpectedGrowth.push(table);
  }
  if (decreases.length || unexpectedGrowth.length) { const error = new Error("Copied migration changed protected table counts unexpectedly."); error.code = "MIGRATION_COUNT_MISMATCH"; throw error; }
  return { decreases: 0, unexpectedGrowth: 0, comparedTables: Object.keys(before.tableCounts).length };
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { redirect: "manual" }); if (response.status > 0) return response; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const error = new Error("Temporary application did not start."); error.code = "SMOKE_START_FAILED"; throw error;
}

async function smokeCopiedApplication(databasePath, storageRoot, label) {
  const port = label === "migration" ? 3186 : 3187;
  if (await portOpen(port)) { const error = new Error("Alternate smoke port is already in use."); error.code = "SMOKE_PORT_BUSY"; throw error; }
  const db = new DatabaseSync(databasePath);
  let sessionId; let userId; let accountId;
  try {
    const user = db.prepare('SELECT "id", "accountId" FROM "User" WHERE "active" = 1 AND "role" = ? ORDER BY "createdAt" LIMIT 1').get("OWNER");
    if (!user) { const error = new Error("Copied database has no active owner for isolated smoke."); error.code = "SMOKE_OWNER_MISSING"; throw error; }
    sessionId = `stage2-smoke-${randomUUID()}`; userId = String(user.id); accountId = user.accountId ? String(user.accountId) : null;
    db.prepare('INSERT INTO "UserDeviceSession" ("id","userId","ipAddress","userAgent","firstSeenAt","lastSeenAt","active") VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)').run(sessionId, userId, "127.0.0.1", "stage2-copied-rehearsal");
  } finally { db.close(); }
  const secret = randomBytes(48).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId, sessionId })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  const cookie = `mpp_session=${payload}.${signature}${accountId ? `; mpp_account=${accountId}` : ""}`;
  const env = {
    ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`, SESSION_SECRET: secret,
    SESSION_COOKIE_SECURE: "false", NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`, PORT: String(port),
    IMPORT_JOB_STORAGE_ROOT: path.join(storageRoot, "import-jobs"), MARKING_LIBRARY_ROOT: path.join(storageRoot, "marking-library"),
    CONSIGNMENT_IMPORT_ROOT: path.join(storageRoot, "consignment-imports"), PRODUCT_IMAGE_STORAGE_ROOT: path.join(storageRoot, "product-images"),
    STAGE2_COPIED_REHEARSAL: "true"
  };
  for (const productionRoot of [path.resolve(ROOT, "storage"), resolveRealDatabasePath()]) if (Object.values(env).some((value) => value === productionRoot)) { const error = new Error("Temporary application environment references production storage."); error.code = "SMOKE_ISOLATION_FAILED"; throw error; }
  const preflight = spawnSync(process.execPath, ["scripts/check-production-readiness.mjs", "--startup"], { cwd: ROOT, env, encoding: "utf8", windowsHide: true, timeout: 120_000 });
  await writeFile(path.join(runRoot, `${label}-preflight.log`), `${preflight.stdout ?? ""}\n${preflight.stderr ?? ""}`.replaceAll(databasePath, "<COPIED_DATABASE>"));
  if (preflight.status !== 0) { const error = new Error("Copied application readiness preflight failed."); error.code = "SMOKE_PREFLIGHT_FAILED"; throw error; }
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let logs = ""; child.stdout.on("data", (chunk) => { logs += chunk; }); child.stderr.on("data", (chunk) => { logs += chunk; });
  try {
    const login = await waitForHttp(`http://127.0.0.1:${port}/login`);
    if (login.status !== 200) throw Object.assign(new Error("Login smoke failed."), { code: "SMOKE_ROUTE_FAILED" });
    const routes = ["/owner/product-inventory", "/owner/imports", "/owner/consignments", "/work"];
    const statuses = [];
    for (const route of routes) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { cookie }, redirect: "manual" });
      const body = await response.text();
      if (response.status !== 200 || body.includes(databasePath) || body.includes(path.resolve(ROOT, "storage"))) throw Object.assign(new Error("Protected copied route smoke failed."), { code: "SMOKE_ROUTE_FAILED" });
      statuses.push(200);
    }
    return { loginStatus: 200, protectedRouteStatuses: statuses, alternatePort: port, boundHost: "127.0.0.1", isolatedStorageRoots: true };
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 5000); });
    await writeFile(path.join(runRoot, `${label}-server.log`), logs.replaceAll(databasePath, "<COPIED_DATABASE>").replaceAll(path.resolve(ROOT, "storage"), "<PRODUCTION_STORAGE>"));
  }
}

await mkdir(runRoot, { recursive: false });
let finalReport = { decision: "STAGE2_BLOCKED_BACKUP", runId, timings };
try {
  const acl = restrictAndInspectAcl(runRoot);
  const ignored = spawnSync("git", ["check-ignore", "-q", runRoot], { cwd: ROOT }).status === 0;
  if (!ignored) { const error = new Error("Private rehearsal root is not ignored by Git."); error.code = "PRIVACY_GIT_IGNORE_FAILED"; throw error; }
  const encryption = encryptionObservation(runRoot);
  const databasePath = resolveRealDatabasePath();
  const databaseInfo = await lstat(databasePath);
  if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink() || pathIsInside(path.resolve(ROOT, ".codex-tmp"), databasePath, true)) { const error = new Error("Configured production SQLite path failed safety validation."); error.code = "SCOPE_DATABASE_INVALID"; throw error; }
  const nodes = otherNodeProcesses();
  const ports = await Promise.all([portOpen(3000), portOpen(3001), portOpen(3188)]);
  if (nodes.length || ports.some(Boolean)) { const error = new Error("A possible repository application writer is active."); error.code = "ACTIVE_WRITER"; throw error; }

  const preflightCopyDirectory = path.join(runRoot, "preflight-database-copy");
  const databaseHashBeforePreflight = await sha256File(databasePath);
  const preflightDatabase = await copySqliteSet(databasePath, preflightCopyDirectory);
  const databaseHashAfterPreflight = await sha256File(databasePath);
  if (databaseHashBeforePreflight !== databaseHashAfterPreflight) { const error = new Error("Database changed during writer preflight."); error.code = "ACTIVE_WRITER"; throw error; }
  const importWriterState = activeImportLeases(preflightDatabase);
  await rm(preflightCopyDirectory, { recursive: true, force: true });
  if (importWriterState.activeLeaseCount) { const error = new Error("An active ImportJob lease prevents copied rehearsal."); error.code = "ACTIVE_WRITER"; throw error; }

  const storageRoot = path.resolve(ROOT, "storage");
  const roots = [
    { id: "import-jobs", path: path.resolve(process.env.IMPORT_JOB_STORAGE_ROOT ?? path.join(storageRoot, "import-jobs")), classification: "MUST_BACK_UP", evidence: "ImportJob.filePath and retained Product Inventory retry/recovery." },
    { id: "marking-library", path: path.resolve(process.env.MARKING_LIBRARY_ROOT ?? path.join(storageRoot, "marking-library")), classification: "MUST_BACK_UP", evidence: "MarkingAssetFile managedRelativePath." },
    { id: "consignment-imports", path: path.resolve(process.env.CONSIGNMENT_IMPORT_ROOT ?? path.join(storageRoot, "consignment-imports")), classification: "MUST_BACK_UP", evidence: "ConsignmentImportFile managedRelativePath and mapped-import retry." },
    { id: "product-images", path: path.join(storageRoot, "product-images"), classification: "REGENERABLE_INCLUDED", evidence: "MarketplaceListing image cache paths; included for coherent conservative restore." },
    { id: "uploads", path: path.join(storageRoot, "uploads"), classification: "MUST_BACK_UP_PENDING_CLEANUP", evidence: "Historical active-storage classification; no confirmed current writer, so uncertain data is included." }
  ];
  const scopeFile = path.join(runRoot, "copied-scope.json");
  const scope = await timed("scopeInventoryMs", () => createCopiedScopeFile({ databasePath, roots, output: scopeFile }));
  const capacity = await inspectCopiedCapacity({ databasePath, scopeFile });
  if (!capacity.sufficient) { const error = new Error("Insufficient private rehearsal capacity."); error.code = "INSUFFICIENT_CAPACITY"; throw error; }
  const receiptFile = path.join(runRoot, "quiescence-receipt.json");
  const receipt = await writeQuiescenceReceipt({ output: receiptFile, databasePath, activeWriterCount: 0, activeImportLeaseCount: 0, portInUse: false, checkedProcessKinds: ["node", "ports-3000-3001", "import-job-leases", "migration-reset-seed"] });
  const sourceBefore = await privateFingerprint({ databasePath, scopeFile });
  await writeFile(path.join(runRoot, "source-before.json"), `${JSON.stringify(sourceBefore, null, 2)}\n`, { flag: "wx" });
  const expectedSourceSha256 = await sha256File(databasePath);
  const backupDirectory = path.join(runRoot, "verified-backup");
  const applicationCommit = currentApplicationCommit();
  const backup = await timed("backupAndStorageCopyMs", () => createCopiedBackup({ confirmCopiedRehearsal: true, confirmationPhrase: COPIED_CONFIRMATION_PHRASE, database: databasePath, output: backupDirectory, expectedSourceSha256, scopeFile, quiescenceReceipt: receiptFile, applicationCommit }));
  const verified = await timed("backupVerificationMs", () => verifyCopiedBackup(backupDirectory));
  const sourceAfter = await privateFingerprint({ databasePath, scopeFile });
  await writeFile(path.join(runRoot, "source-after.json"), `${JSON.stringify(sourceAfter, null, 2)}\n`, { flag: "wx" });
  if (sourceBefore.aggregateSha256 !== sourceAfter.aggregateSha256) { const error = new Error("Production source changed after backup."); error.code = "ACTIVE_WRITER"; throw error; }

  const restoreOne = await timed("restorePreMigrationMs", () => restoreCopiedBackup({ backupDirectory, target: path.join(runRoot, "restore-pre-migration") }));
  const restoreTwo = await timed("restoreMigrationMs", () => restoreCopiedBackup({ backupDirectory, target: path.join(runRoot, "restore-migration") }));
  const restoreOneInspection = inspectSqliteDatabase(restoreOne.databasePath);
  const beforeMigration = inspectSqliteDatabase(restoreTwo.databasePath);
  const relationalBefore = relationalSnapshot(restoreTwo.databasePath);
  const migrationStart = Date.now();
  migrationCommand(restoreTwo.databasePath, ["migrate", "status"], "migration-status-before.log", true);
  migrationCommand(restoreTwo.databasePath, ["migrate", "deploy"], "migration-deploy.log");
  migrationCommand(restoreTwo.databasePath, ["migrate", "status"], "migration-status-after.log");
  timings.migrationMs = elapsed(migrationStart);
  const afterMigration = inspectSqliteDatabase(restoreTwo.databasePath);
  const countResult = verifyMigrationCounts(beforeMigration, afterMigration);
  const relationalResult = verifyRelationalSamples(restoreTwo.databasePath, relationalBefore);
  if (afterMigration.integrity.join(",") !== "ok" || afterMigration.foreignKeyViolationCount) { const error = new Error("Migrated copy failed integrity checks."); error.code = "MIGRATION_INTEGRITY_FAILED"; throw error; }
  const smoke = await timed("temporaryStartupAndSmokeMs", () => smokeCopiedApplication(restoreTwo.databasePath, restoreTwo.storageRoot, "migration"));

  await rm(restoreOne.targetDirectory, { recursive: true, force: true });
  const rollback = await timed("rollbackCopyPreparationMs", () => restoreCopiedBackup({ backupDirectory, target: path.join(runRoot, "rollback-target") }));
  const rollbackMigrationStart = Date.now();
  migrationCommand(rollback.databasePath, ["migrate", "status"], "rollback-migration-status-before.log", true);
  migrationCommand(rollback.databasePath, ["migrate", "deploy"], "rollback-migration-deploy.log");
  migrationCommand(rollback.databasePath, ["migrate", "status"], "rollback-migration-status-after.log");
  timings.rollbackMigrationMs = elapsed(rollbackMigrationStart);
  await writeFile(path.join(runRoot, "disposable-current-target.json"), JSON.stringify({ target: "rollback-target", switchedAt: new Date().toISOString() }));
  const rollbackSmoke = await timed("rollbackSmokeMs", () => smokeCopiedApplication(rollback.databasePath, rollback.storageRoot, "rollback"));
  const finalSource = await privateFingerprint({ databasePath, scopeFile });
  if (sourceBefore.aggregateSha256 !== finalSource.aggregateSha256) { const error = new Error("Production source changed during copied rehearsal."); error.code = "ACTIVE_WRITER"; throw error; }

  const protectionAcceptableForRetention = encryption.status === "VOLUME_PROTECTED_OBSERVED" && false;
  await rm(restoreTwo.targetDirectory, { recursive: true, force: true });
  await rm(rollback.targetDirectory, { recursive: true, force: true });
  await rm(path.join(runRoot, "disposable-current-target.json"), { force: true });
  if (!protectionAcceptableForRetention) await rm(backupDirectory, { recursive: true, force: true });
  timings.totalMs = elapsed(startedAt);
  finalReport = {
    decision: "STAGE2_COPIED_BACKUP_RESTORE_MIGRATION_PASSED", runId, applicationCommit,
    source: { databaseResolvedSafely: true, writerProcesses: 0, activeImportLeases: 0, legacyRunningImportRowsWithoutLease: importWriterState.legacyRunningCount, portsClosed: true, unchanged: true },
    scope: { rootCount: scope.roots.length, uploadsClassification: "MUST_BACK_UP_PENDING_CLEANUP", databaseBytes: capacity.databaseBytes, storageBytes: capacity.storageBytes, fileCount: capacity.fileCount, largestIncludedFile: capacity.largestIncludedFile, longestRelativePath: capacity.longestRelativePath },
    capacity: { requiredBytes: capacity.requiredBytes, freeBytes: capacity.freeBytes, sufficient: true }, acl, encryption,
    backup: { method: backup.manifest.database.backupMethod, manifestStatus: verified.result.status, databaseHashVerified: true, storageHashesVerified: true },
    restoreOne: { status: restoreOne.result.status, integrity: restoreOneInspection.integrity, foreignKeyViolationCount: restoreOneInspection.foreignKeyViolationCount },
    restoreTwo: { status: restoreTwo.result.status, integrity: afterMigration.integrity, foreignKeyViolationCount: afterMigration.foreignKeyViolationCount },
    migration: { beforeApplied: beforeMigration.appliedMigrations.length, pendingBefore: afterMigration.appliedMigrations.length - beforeMigration.appliedMigrations.length, afterApplied: afterMigration.appliedMigrations.length, pendingAfter: 0, counts: countResult, relationalSamples: relationalResult },
    smoke, rollback: { status: rollback.result.status, recoveryMode: "RESTORE_THEN_REAPPLY_REVIEWED_MIGRATIONS_FOR_CURRENT_EXECUTABLE", smoke: rollbackSmoke }, timings,
    cleanup: { restoreCopiesDeleted: true, temporaryApplicationStopped: true, durableBackupRetained: protectionAcceptableForRetention, logicalDeletionOnly: true },
    privacy: { absolutePathsPrivateOnly: true, gitIgnored: true, ownerDecision: "ENCRYPTION_OWNER_DECISION_PENDING" },
    quiescence: { startedAt: receipt.quiescenceStartedAt, verifiedAt: receipt.quiescenceVerifiedAt }
  };
} catch (error) {
  timings.totalMs = elapsed(startedAt);
  finalReport = { decision: safeDecision(error), runId, failureCode: String(error?.code ?? "UNEXPECTED_FAILURE").slice(0, 100), timings };
}

await writeFile(privateReportPath, `${JSON.stringify(finalReport, null, 2)}\n`, { flag: "wx" }).catch(async () => writeFile(privateReportPath, `${JSON.stringify(finalReport, null, 2)}\n`));
process.stdout.write(`${JSON.stringify({ decision: finalReport.decision, runId, failureCode: finalReport.failureCode ?? null, timings: finalReport.timings }, null, 2)}\n`);
if (finalReport.decision !== "STAGE2_COPIED_BACKUP_RESTORE_MIGRATION_PASSED") process.exitCode = 1;
