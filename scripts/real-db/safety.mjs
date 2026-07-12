import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import dotenv from "dotenv";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const BACKUP_ROOT = resolve(ROOT, "backups", "database");
export const TEMP_ROOT = resolve(ROOT, ".codex-tmp");
export const MIGRATION_TEST_PATH = resolve(TEMP_ROOT, "dev-migration-test.db");
export const MIGRATION_RESULT_PATH = resolve(TEMP_ROOT, "real-db-migration-test-result.json");
export const PRE_COUNTS_PATH = resolve(TEMP_ROOT, "pre-migration-counts.json");
export const POST_COUNTS_PATH = resolve(TEMP_ROOT, "post-migration-counts.json");
export const COMPARISON_PATH = resolve(TEMP_ROOT, "migration-comparison.json");

const IMPORTANT_TABLES = ["Account","User","MarketplaceListing","MarketplaceListingIdentifier","UploadBatch","Order","MarkingAsset","MarkingAssetFile","MarkingAssetListingLink","ProductProcessRule","ConsignmentBatch","ConsignmentLine","ConsignmentImportFile","ConsignmentImportIssue","WorkTask","WorkActionLog","AuditLog","ScanLog"];

export function assertInside(candidate, root, label) {
  const resolvedCandidate = resolve(candidate);
  const resolvedRoot = resolve(root);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === ".." || isAbsolute(pathFromRoot)) throw new Error(`${label} must stay inside ${resolvedRoot}.`);
  return resolvedCandidate;
}

export function resolveRealDatabasePath() {
  dotenv.config({ path: resolve(ROOT, ".env"), quiet: true });
  let value = String(process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (value.startsWith("DATABASE_URL=")) value = value.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (!value.startsWith("file:")) throw new Error("The configured real database is not SQLite.");
  const sqlitePath = value.slice("file:".length).split("?")[0];
  const resolvedPath = isAbsolute(sqlitePath) ? resolve(sqlitePath) : resolve(ROOT, "prisma", sqlitePath);
  if (!existsSync(resolvedPath)) throw new Error(`SQLite database does not exist at ${resolvedPath}.`);
  return resolvedPath;
}

export function migrationNames() {
  return readdirSync(resolve(ROOT, "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function tableNames(db) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)));
}

function grouped(db, tables, table, columns) {
  if (!tables.has(table)) return [];
  const selected = columns.map((column) => `"${column}"`).join(", ");
  return db.prepare(`SELECT ${selected}, COUNT(*) AS count FROM "${table}" GROUP BY ${selected} ORDER BY ${selected}`).all();
}

export function inspectDatabase(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = tableNames(db);
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
    const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
    const appliedMigrations = tables.has("_prisma_migrations") ? db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at").all().map((row) => String(row.migration_name)) : [];
    const counts = Object.fromEntries(IMPORTANT_TABLES.map((table) => [table, tables.has(table) ? Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count) : null]));
    const ids = Object.fromEntries(["Account","User","MarketplaceListing","Order","ConsignmentBatch","ConsignmentLine","WorkTask","WorkActionLog","AuditLog"].map((table) => [table, tables.has(table) ? String(db.prepare(`SELECT COALESCE(MIN(id),'') || ':' || COALESCE(MAX(id),'') FROM "${table}"`).get()["COALESCE(MIN(id),'') || ':' || COALESCE(MAX(id),'')"] ?? "") : null]));
    return {
      databasePath: resolve(databasePath),
      sizeBytes: statSync(databasePath).size,
      integrity,
      foreignKeyViolationCount: foreignKeyViolations.length,
      appliedMigrations,
      pendingMigrations: migrationNames().filter((name) => !appliedMigrations.includes(name)),
      tableNames: [...tables].filter((name) => !name.startsWith("sqlite_")).sort(),
      counts,
      identityBounds: ids,
      grouped: {
        accountsByMarketplaceActive: grouped(db,tables,"Account",["marketplace","active"]),
        ordersByMarketplace: grouped(db,tables,"Order",["marketplace"]),
        ordersByPickPackStatus: grouped(db,tables,"Order",["pickStatus","packStatus"]),
        tasksByStageStatus: grouped(db,tables,"WorkTask",["stage","status"]),
        consignmentsByStatus: grouped(db,tables,"ConsignmentBatch",["status"])
      }
    };
  } finally {
    db.close();
  }
}

export function compareSnapshots(before, after) {
  const reductions = [];
  const countComparison = {};
  for (const table of IMPORTANT_TABLES) {
    const previous = before.counts[table]; const current = after.counts[table];
    countComparison[table] = { before: previous, after: current, delta: previous === null || current === null ? null : current - previous };
    if (previous !== null && current !== null && current < previous) reductions.push({ table, before: previous, after: current });
  }
  const missingTables = before.tableNames.filter((table) => !after.tableNames.includes(table));
  const changedIdentityBounds = Object.entries(before.identityBounds).flatMap(([table, bounds]) => bounds !== null && after.identityBounds[table] !== bounds ? [{ table, before: bounds, after: after.identityBounds[table] }] : []);
  return { ok: !reductions.length && !missingTables.length && !changedIdentityBounds.length, reductions, missingTables, changedIdentityBounds, counts: countComparison };
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export async function createVerifiedBackup(databasePath = resolveRealDatabasePath()) {
  mkdirSync(BACKUP_ROOT, { recursive: true });
  const stamp = timestamp();
  const destination = assertInside(resolve(BACKUP_ROOT, `dev-before-phase-7-1-${stamp}.db`), BACKUP_ROOT, "Backup destination");
  const manifestPath = assertInside(resolve(BACKUP_ROOT, `${stamp}-backup-manifest.json`), BACKUP_ROOT, "Backup manifest");
  if (existsSync(destination) || existsSync(manifestPath)) throw new Error("Backup destination already exists; no file was overwritten.");
  const sourceSnapshot = inspectDatabase(databasePath);
  if (sourceSnapshot.integrity.join(",") !== "ok") throw new Error("Real database integrity check failed; backup was not started.");
  const sourceSha256 = await sha256File(databasePath);
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try { await sqliteBackup(source, destination); } finally { source.close(); }
  const backupSnapshot = inspectDatabase(destination);
  if (backupSnapshot.integrity.join(",") !== "ok" || backupSnapshot.foreignKeyViolationCount) throw new Error("Backup verification failed.");
  const backupSha256 = await sha256File(destination);
  const manifest = { version: 1, verified: true, createdAt: new Date().toISOString(), sourcePath: resolve(databasePath), backupPath: destination, sourceSizeBytes: sourceSnapshot.sizeBytes, backupSizeBytes: backupSnapshot.sizeBytes, sourceSha256, backupSha256, commit: process.env.REAL_DB_GIT_COMMIT ?? null, appliedMigrations: sourceSnapshot.appliedMigrations, pendingMigrations: sourceSnapshot.pendingMigrations, integrity: backupSnapshot.integrity, foreignKeyViolationCount: backupSnapshot.foreignKeyViolationCount };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  mkdirSync(TEMP_ROOT, { recursive: true });
  writeFileSync(PRE_COUNTS_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  return { manifestPath, manifest, sourceSnapshot, backupSnapshot };
}

export function latestVerifiedManifest() {
  if (!existsSync(BACKUP_ROOT)) throw new Error("No private database backup directory exists.");
  const files = readdirSync(BACKUP_ROOT).filter((name) => name.endsWith("-backup-manifest.json")).sort().reverse();
  for (const name of files) {
    const manifestPath = assertInside(resolve(BACKUP_ROOT, name), BACKUP_ROOT, "Backup manifest");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.verified === true && existsSync(manifest.backupPath)) return { manifestPath, manifest };
  }
  throw new Error("A verified backup manifest is required.");
}

export async function prepareMigrationTestCopy() {
  mkdirSync(TEMP_ROOT, { recursive: true });
  assertInside(MIGRATION_TEST_PATH, TEMP_ROOT, "Migration-test database");
  const { manifestPath, manifest } = latestVerifiedManifest();
  await rm(MIGRATION_TEST_PATH, { force: true });
  await copyFile(manifest.backupPath, MIGRATION_TEST_PATH);
  return { manifestPath, manifest, testPath: MIGRATION_TEST_PATH, before: inspectDatabase(MIGRATION_TEST_PATH) };
}

export function writeJson(file, value) {
  assertInside(file, TEMP_ROOT, "QA output");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function safeDatabaseSummary(snapshot) {
  return { databasePath: snapshot.databasePath, sizeBytes: snapshot.sizeBytes, integrity: snapshot.integrity, foreignKeyViolationCount: snapshot.foreignKeyViolationCount, appliedMigrationCount: snapshot.appliedMigrations.length, pendingMigrations: snapshot.pendingMigrations, counts: snapshot.counts, grouped: snapshot.grouped };
}

export function databaseFileName(databasePath) { return basename(databasePath); }
export function databaseDirectory(databasePath) { return dirname(databasePath); }
