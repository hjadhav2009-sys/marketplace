import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import dotenv from "dotenv";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const TEMP_ROOT = resolve(ROOT, ".codex-tmp");
export const BACKUP_ROOT = resolve(ROOT, "backups", "fresh-start");
export const TEST_DB = resolve(TEMP_ROOT, "fresh-start-reset-test.db");
export const TEST_RESULT = resolve(TEMP_ROOT, "fresh-start-reset-test-result.json");
export const POST_RESET_RESULT = resolve(TEMP_ROOT, "fresh-start-post-reset.json");
export const ACTIVE_STORAGE = ["storage/import-jobs", "storage/marking-library", "storage/product-images", "storage/marking-temp", "storage/consignment-imports", "storage/uploads", "storage/temp"];
const PRESERVED_TABLES = new Set(["User", "_prisma_migrations"]);

export function assertInside(candidate, root, label) {
  const value = resolve(candidate), parent = resolve(root), rel = relative(parent, value);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} must stay inside ${parent}.`);
  return value;
}

export function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

export function requireOwnerArgument() {
  const username = argument("--owner-username");
  if (!username) throw new Error('Refused: provide --owner-username "<exact username>". The owner is never guessed.');
  return username;
}

export function resolveRealDatabasePath() {
  dotenv.config({ path: resolve(ROOT, ".env"), quiet: true });
  const raw = String(process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw.startsWith("file:")) throw new Error("The configured database is not SQLite.");
  const path = raw.slice(5).split("?")[0];
  const result = isAbsolute(path) ? resolve(path) : resolve(ROOT, "prisma", path);
  if (!existsSync(result)) throw new Error("The configured SQLite database does not exist.");
  return result;
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function migrationRows(db) {
  if (!tableNames(db).includes("_prisma_migrations")) return [];
  return db.prepare('SELECT migration_name AS name, checksum, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM "_prisma_migrations" ORDER BY migration_name').all();
}

export function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => String(row.name));
}

export function validateOwner(db, username) {
  if (!tableNames(db).includes("User")) throw new Error("Owner validation failed: User table is absent.");
  const rows = db.prepare('SELECT id, username, role, active, length(passwordHash) AS hashLength, mustChangePassword FROM "User" WHERE username = ?').all(username);
  if (rows.length !== 1) throw new Error(`Owner validation failed: exact username matched ${rows.length} rows.`);
  const owner = rows[0];
  if (!String(owner.username).trim()) throw new Error("Owner validation failed: username is blank.");
  if (owner.role !== "OWNER") throw new Error("Owner validation failed: selected user is not OWNER.");
  if (!owner.active) throw new Error("Owner validation failed: selected OWNER is inactive.");
  if (!Number(owner.hashLength)) throw new Error("Owner validation failed: selected OWNER has no password hash.");
  return { id: String(owner.id), username: String(owner.username), role: "OWNER", active: true, mustChangePassword: Boolean(owner.mustChangePassword) };
}

export function repositoryMigrationNames() {
  return readdirSync(resolve(ROOT, "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function foreignKeys(db, table) {
  return db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all().map((row) => ({ table: String(row.table), from: String(row.from), to: String(row.to), onDelete: String(row.on_delete) }));
}

export function inventoryDatabase(path, ownerUsername = "") {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = tableNames(db);
    const owner = ownerUsername ? validateOwner(db, ownerUsername) : null;
    const inventory = tables.map((table) => ({
      table,
      preResetCount: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${JSON.stringify(table)}`).get().count),
      classification: table === "_prisma_migrations" ? "preserve-all" : table === "User" ? "preserve-selected-owner" : "delete-all",
      foreignKeyDependencies: foreignKeys(db, table),
      expectedPostResetCount: table === "_prisma_migrations" ? Number(db.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations"').get().count) : table === "User" ? 1 : 0
    }));
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
    const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
    const owners = tables.includes("User") ? db.prepare('SELECT username, role FROM "User" WHERE role = ? ORDER BY username').all("OWNER") : [];
    const migrations=migrationRows(db), appliedNames=new Set(migrations.filter((row)=>row.finishedAt&& !row.rolledBackAt).map((row)=>String(row.name)));
    return { databaseFile: basename(path), sizeBytes: statSync(path).size, integrity, foreignKeyViolationCount: foreignKeyViolations.length, migrations, pendingMigrations: repositoryMigrationNames().filter((name)=>!appliedNames.has(name)), owners, selectedOwner: owner, inventory };
  } finally { db.close(); }
}

async function walkStorage(root) {
  if (!existsSync(root)) return { files: [], bytes: 0 };
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Storage backup refused: symbolic links are not supported.");
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push({ full, relative: relative(root, full), bytes: statSync(full).size });
    }
  }
  await visit(root);
  return { files, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

export async function storageSummary() {
  const result = [];
  for (const relativePath of ACTIVE_STORAGE) {
    const walked = await walkStorage(resolve(ROOT, relativePath));
    result.push({ path: relativePath, fileCount: walked.files.length, bytes: walked.bytes });
  }
  return result;
}

function timestamp() { return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); }
function gitCommit() { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } }

export async function createBackup(databasePath, username) {
  const inspection = inventoryDatabase(databasePath, username);
  if (inspection.integrity.join(",") !== "ok" || inspection.foreignKeyViolationCount) throw new Error("Backup refused: source integrity or foreign keys failed.");
  mkdirSync(BACKUP_ROOT,{recursive:true});
  const stamp = timestamp(), directory = assertInside(resolve(BACKUP_ROOT, stamp), BACKUP_ROOT, "Backup directory");
  if (existsSync(directory)) throw new Error("Backup destination already exists; nothing was overwritten.");
  mkdirSync(directory, { recursive: false });
  const backupPath = resolve(directory, "dev-before-fresh-start.db"), manifestPath = resolve(directory, "backup-manifest.json");
  const sourceSha256 = await sha256File(databasePath);
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try { await sqliteBackup(source, backupPath); } finally { source.close(); }
  const backupInspection = inventoryDatabase(backupPath, username), backupSha256 = await sha256File(backupPath);
  if (backupInspection.integrity.join(",") !== "ok" || backupInspection.foreignKeyViolationCount) throw new Error("Backup verification failed.");
  const storageRoot = resolve(directory, "storage-backup");
  const storage = [];
  for (const relativePath of ACTIVE_STORAGE) {
    const sourceRoot = resolve(ROOT, relativePath), walked = await walkStorage(sourceRoot);
    const treeHash=createHash("sha256");
    for (const file of walked.files.sort((left,right)=>left.relative.localeCompare(right.relative))) {
      const destination = resolve(storageRoot, relativePath, file.relative);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file.full, destination);
      const sourceFileHash=await sha256File(file.full), backupFileHash=await sha256File(destination);
      if(sourceFileHash!==backupFileHash)throw new Error(`Storage backup hash verification failed under ${relativePath}.`);
      treeHash.update(file.relative.replace(/\\/g,"/")).update("\0").update(sourceFileHash).update("\n");
    }
    storage.push({ path: relativePath, fileCount: walked.files.length, bytes: walked.bytes, treeSha256: treeHash.digest("hex") });
  }
  const manifest = { version: 1, verified: true, createdAt: new Date().toISOString(), sourceDatabasePath: resolve(databasePath), backupPath, sourceSizeBytes: statSync(databasePath).size, backupSizeBytes: statSync(backupPath).size, sourceSha256, backupSha256, integrity: backupInspection.integrity, foreignKeyViolationCount: backupInspection.foreignKeyViolationCount, gitCommit: gitCommit(), appliedMigrations: inspection.migrations, selectedOwner: inspection.selectedOwner, activeStorage: storage, rowCounts: Object.fromEntries(inspection.inventory.map((row) => [row.table, row.preResetCount])) };
  writeFileSync(resolve(directory, "pre-reset-counts.json"), `${JSON.stringify(inspection.inventory, null, 2)}\n`, { flag: "wx" });
  writeFileSync(resolve(directory, "reset-plan.json"), `${JSON.stringify({ selectedOwner: inspection.selectedOwner, inventory: inspection.inventory }, null, 2)}\n`, { flag: "wx" });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  if (await sha256File(backupPath) !== backupSha256) throw new Error("Backup hash re-verification failed.");
  return { directory, manifestPath, manifest };
}

export function latestBackup(username) {
  if (!existsSync(BACKUP_ROOT)) throw new Error("No fresh-start backup exists.");
  for (const name of readdirSync(BACKUP_ROOT).sort().reverse()) {
    const manifestPath = resolve(BACKUP_ROOT, name, "backup-manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.verified === true && manifest.selectedOwner?.username === username && existsSync(manifest.backupPath)) return { manifestPath, manifest };
  }
  throw new Error("No verified fresh-start backup exists for the selected owner.");
}

function deletionOrder(db, tables) {
  const candidates = new Set(tables.filter((table) => !PRESERVED_TABLES.has(table)));
  const result = [], visiting = new Set(), visited = new Set();
  function visit(table) {
    if (visited.has(table)) return;
    if (visiting.has(table)) throw new Error(`Reset refused: foreign-key cycle includes ${table}.`);
    visiting.add(table);
    for (const parent of foreignKeys(db, table).map((fk) => fk.table)) if (candidates.has(parent)) visit(parent);
    visiting.delete(table); visited.add(table); result.unshift(table);
  }
  for (const table of candidates) visit(table);
  return result;
}

export function purgeDatabase(path, username, { vacuum = false } = {}) {
  const before = inventoryDatabase(path, username), db = new DatabaseSync(path);
  const originalHash = db.prepare('SELECT passwordHash FROM "User" WHERE username=?').get(username).passwordHash;
  const beforeMigrations = JSON.stringify(migrationRows(db));
  const started = Date.now();
  try {
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
    db.prepare('UPDATE "User" SET accountId=NULL').run();
    for (const table of deletionOrder(db, tableNames(db))) db.exec(`DELETE FROM ${JSON.stringify(table)}`);
    db.prepare('DELETE FROM "User" WHERE username <> ?').run(username);
    db.prepare('UPDATE "User" SET failedLoginCount=0, lockedUntil=NULL, lastLoginAt=NULL, lastLoginIp=NULL, lastUserAgent=NULL, accountId=NULL WHERE username=?').run(username);
    db.exec("COMMIT;");
  } catch (error) { try { db.exec("ROLLBACK;"); } catch {} throw error; }
  const preVacuumBytes = statSync(path).size;
  const owner = validateOwner(db, username), hashUnchanged = db.prepare('SELECT passwordHash FROM "User" WHERE username=?').get(username).passwordHash === originalHash;
  const afterCounts = Object.fromEntries(tableNames(db).map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${JSON.stringify(table)}`).get().count)]));
  const badCounts = Object.entries(afterCounts).filter(([table, count]) => table !== "_prisma_migrations" && count !== (table === "User" ? 1 : 0));
  const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
  const foreignKeyViolationCount = db.prepare("PRAGMA foreign_key_check").all().length;
  const migrationsUnchanged = JSON.stringify(migrationRows(db)) === beforeMigrations;
  if (!hashUnchanged || badCounts.length || integrity.join(",") !== "ok" || foreignKeyViolationCount || !migrationsUnchanged) { db.close(); throw new Error(`Post-reset verification failed: ${JSON.stringify({ hashUnchanged, badCounts, integrity, foreignKeyViolationCount, migrationsUnchanged })}`); }
  db.exec("PRAGMA optimize;");
  if (vacuum) db.exec("VACUUM;");
  db.close();
  return { passed: true, databaseFile: basename(path), selectedOwner: owner, passwordHashUnchanged: hashUnchanged, migrationsUnchanged, appliedMigrationCount: before.migrations.length, integrity, foreignKeyViolationCount, counts: afterCounts, preResetBytes: before.sizeBytes, postResetPreVacuumBytes: preVacuumBytes, postResetBytes: statSync(path).size, elapsedMs: Date.now() - started };
}

export async function verifyManifest(manifest) {
  if (manifest.verified !== true || !existsSync(manifest.backupPath)) throw new Error("Backup manifest is not verified or its database is missing.");
  if (await sha256File(manifest.backupPath) !== manifest.backupSha256) throw new Error("Backup SHA-256 does not match its manifest.");
}

export async function clearActiveStorage() {
  for (const relativePath of ACTIVE_STORAGE) {
    const root = resolve(ROOT, relativePath);
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root)) await rm(assertInside(resolve(root, entry), root, "Active storage entry"), { recursive: true, force: true });
  }
}

export function writePrivateJson(path, value) {
  assertInside(path, TEMP_ROOT, "Private output"); mkdirSync(TEMP_ROOT, { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
