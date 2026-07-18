import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants as fsConstants, createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";

export const RELEASE_BACKUP_MANIFEST_VERSION = "ReleaseBackupManifestV1";
export const RELEASE_RESTORE_VERIFICATION_VERSION = "ReleaseRestoreVerificationV1";
export const SCOPE_CLASSIFICATION_VERSION = "BACKUP_SCOPE_V1";
export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const STAGE1_ROOT = path.resolve(ROOT, ".codex-tmp", "stage1-backup");
export const REAL_DATABASE_PATH = path.resolve(ROOT, "prisma", "dev.db");
export const REAL_STORAGE_ROOT = path.resolve(ROOT, "storage");
export const MANIFEST_FILE_NAME = "release-backup-manifest.json";
export const BACKUP_DATABASE_FILE_NAME = "database.sqlite";
export const BACKUP_STORAGE_DIRECTORY = "storage";
export const RESTORE_RESULT_FILE_NAME = "release-restore-verification.json";

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_RELATIVE_PATH_LENGTH = 1024;

export class ReleaseBackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseBackupError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseBackupError(code, message);
}

function pathKey(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function pathIsInside(parent, candidate, allowEqual = false) {
  const fromParent = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!fromParent) return allowEqual;
  return fromParent !== ".." && !fromParent.startsWith(`..${path.sep}`) && !path.isAbsolute(fromParent);
}

function assertRawPath(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) fail("EMPTY_PATH", `${label} is required.`);
  if (raw.includes("\0")) fail("INVALID_PATH", `${label} contains an invalid character.`);
  if (raw.split(/[\\/]+/).some((segment) => segment === "..")) fail("PATH_TRAVERSAL", `${label} must not contain parent traversal.`);
  return raw;
}

async function assertNoLinkEscape(candidate, label) {
  if (!existsSync(STAGE1_ROOT)) return;
  const rootStat = await lstat(STAGE1_ROOT);
  if (rootStat.isSymbolicLink()) fail("SYMLINK_ESCAPE", "The Stage 1 root must not be a symbolic link or junction.");
  const relative = path.relative(STAGE1_ROOT, candidate);
  let current = STAGE1_ROOT;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!existsSync(current)) break;
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) fail("SYMLINK_ESCAPE", `${label} must not traverse a symbolic link or junction.`);
  }
  if (existsSync(candidate)) {
    const [realRoot, realCandidate] = await Promise.all([realpath(STAGE1_ROOT), realpath(candidate)]);
    if (!pathIsInside(realRoot, realCandidate, true)) fail("SYMLINK_ESCAPE", `${label} resolves outside the Stage 1 root.`);
  }
}

export async function resolveStage1Path(value, label, kind = "generic") {
  const raw = assertRawPath(value, label);
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ROOT, raw);
  if (kind === "database" && pathKey(resolved) === pathKey(REAL_DATABASE_PATH)) fail("REAL_DATABASE_REFUSED", "Stage 1 refuses the real database path.");
  if (kind === "storage" && pathKey(resolved) === pathKey(REAL_STORAGE_ROOT)) fail("REAL_STORAGE_REFUSED", "Stage 1 refuses the repository private-storage root.");
  if (!pathIsInside(STAGE1_ROOT, resolved)) fail("STAGE1_PATH_REQUIRED", `${label} must stay inside the synthetic Stage 1 root.`);
  await assertNoLinkEscape(resolved, label);
  return resolved;
}

export function safeManifestRelativePath(value, label = "Manifest path") {
  const raw = String(value ?? "");
  if (!raw || raw.length > MAX_RELATIVE_PATH_LENGTH || raw.includes("\0") || raw.includes("\\") || raw.startsWith("/") || /^[a-z]:/i.test(raw)) {
    fail("INVALID_MANIFEST_PATH", `${label} is invalid.`);
  }
  const parts = raw.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.length > 255)) fail("INVALID_MANIFEST_PATH", `${label} is invalid.`);
  return parts.join("/");
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function manifestSelfCheck(manifest) {
  const copy = structuredClone(manifest);
  if (!copy.verification || typeof copy.verification !== "object") copy.verification = {};
  copy.verification.manifestSelfCheck = null;
  return createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

export function sealManifest(manifest) {
  const sealed = structuredClone(manifest);
  sealed.verification.manifestSelfCheck = null;
  sealed.verification.manifestSelfCheck = manifestSelfCheck(sealed);
  return sealed;
}

function sqliteValue(row) {
  return String(Object.values(row ?? {})[0] ?? "");
}

export function inspectSqliteDatabase(databasePath) {
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const journalMode = sqliteValue(database.prepare("PRAGMA journal_mode").get()).toLowerCase();
    const integrity = database.prepare("PRAGMA integrity_check").all().map(sqliteValue);
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
    const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => String(row.name));
    const tableCounts = Object.fromEntries(tableNames.map((table) => [table, Number(database.prepare(`SELECT COUNT(*) AS count FROM "${table.replaceAll('"', '""')}"`).get().count)]));
    const appliedMigrations = tableNames.includes("_prisma_migrations")
      ? database.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name").all().map((row) => String(row.migration_name))
      : [];
    return { journalMode, integrity, foreignKeyViolationCount: foreignKeyViolations.length, tableNames, tableCounts, appliedMigrations };
  } catch (error) {
    if (error instanceof ReleaseBackupError) throw error;
    fail("SQLITE_CORRUPT", "SQLite verification could not open or inspect the database.");
  } finally {
    database?.close();
  }
}

async function walkStorage(root) {
  if (!existsSync(root)) fail("STORAGE_MISSING", "The synthetic storage root does not exist.");
  const rootEntry = await lstat(root);
  if (!rootEntry.isDirectory()) fail("STORAGE_NOT_DIRECTORY", "The synthetic storage root must be a directory.");
  if (rootEntry.isSymbolicLink()) fail("SYMLINK_ESCAPE", "The synthetic storage root must not be a symbolic link or junction.");
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = path.join(directory, entry.name);
      const entryInfo = await lstat(fullPath);
      if (entryInfo.isSymbolicLink()) fail("SYMLINK_ESCAPE", "Private storage contains a symbolic link or junction.");
      if (entryInfo.isDirectory()) {
        await visit(fullPath);
      } else if (entryInfo.isFile()) {
        const relativePath = safeManifestRelativePath(path.relative(root, fullPath).split(path.sep).join("/"), "Storage relative path");
        files.push({ relativePath, fullPath, sizeBytes: entryInfo.size, sha256: await sha256File(fullPath) });
      } else {
        fail("UNSUPPORTED_STORAGE_ENTRY", "Private storage contains an unsupported filesystem entry.");
      }
    }
  }
  await visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function captureSourceState(databasePath, storageRoot) {
  const databaseFiles = [];
  for (const suffix of ["", "-wal", "-journal"]) {
    const candidate = `${databasePath}${suffix}`;
    if (existsSync(candidate)) databaseFiles.push({ suffix: suffix || "main", sizeBytes: statSync(candidate).size, sha256: await sha256File(candidate) });
  }
  const storage = (await walkStorage(storageRoot)).map(({ relativePath, sizeBytes, sha256 }) => ({ relativePath, sizeBytes, sha256 }));
  return { databaseFiles, storage };
}

function statesEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

async function copyStorageFiles(files, sourceRoot, destinationRoot, options = {}) {
  let copied = 0;
  for (const file of files) {
    if (options.failAfterFiles !== undefined && copied >= options.failAfterFiles) fail("SIMULATED_COPY_INTERRUPTION", "Synthetic copy interruption was injected.");
    const source = path.resolve(sourceRoot, ...file.relativePath.split("/"));
    const destination = path.resolve(destinationRoot, ...file.relativePath.split("/"));
    if (!pathIsInside(sourceRoot, source) || !pathIsInside(destinationRoot, destination)) fail("PATH_TRAVERSAL", "Storage copy escaped its managed root.");
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    copied += 1;
  }
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function assertHealthyInspection(inspection, prefix) {
  if (inspection.integrity.length !== 1 || inspection.integrity[0] !== "ok") fail("SQLITE_INTEGRITY_FAILED", `${prefix} failed SQLite integrity verification.`);
  if (inspection.foreignKeyViolationCount !== 0) fail("FOREIGN_KEY_VIOLATION", `${prefix} contains foreign-key violations.`);
}

function assertString(value, code, message) {
  if (typeof value !== "string" || !value) fail(code, message);
  return value;
}

async function readManifest(backupDirectory) {
  const manifestPath = path.join(backupDirectory, MANIFEST_FILE_NAME);
  if (!existsSync(manifestPath)) fail("MANIFEST_MISSING", "The release backup manifest is missing.");
  const manifestStat = await stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size <= 0 || manifestStat.size > MAX_MANIFEST_BYTES) fail("MANIFEST_INVALID", "The release backup manifest has an invalid size.");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("MANIFEST_INVALID", "The release backup manifest is not valid JSON.");
  }
  if (manifest.version !== RELEASE_BACKUP_MANIFEST_VERSION) fail("MANIFEST_VERSION_UNSUPPORTED", "The release backup manifest version is not supported.");
  if (manifest.verification?.manifestSelfCheck !== manifestSelfCheck(manifest)) fail("MANIFEST_SELF_CHECK_FAILED", "The release backup manifest self-check failed.");
  return { manifest, manifestPath };
}

function assertInspectionMatchesManifest(inspection, manifestDatabase) {
  assertHealthyInspection(inspection, "The release backup database");
  if (manifestDatabase.sqliteIntegrity !== "ok") fail("MANIFEST_DATABASE_STATE_INVALID", "The manifest does not record a healthy SQLite backup.");
  if (manifestDatabase.foreignKeyViolationCount !== 0) fail("MANIFEST_DATABASE_STATE_INVALID", "The manifest records foreign-key violations.");
  if (canonicalJson([...inspection.appliedMigrations].sort()) !== canonicalJson([...(manifestDatabase.appliedMigrations ?? [])].sort())) fail("MIGRATION_HISTORY_MISMATCH", "The restored migration history does not match the manifest.");
  if (canonicalJson(inspection.tableNames) !== canonicalJson(manifestDatabase.requiredTables ?? [])) fail("REQUIRED_TABLE_MISMATCH", "The restored table inventory does not match the manifest.");
  if (canonicalJson(inspection.tableCounts) !== canonicalJson(manifestDatabase.tableCounts ?? {})) fail("ROW_COUNT_MISMATCH", "The restored row counts do not match the manifest.");
}

export async function verifyReleaseBackup(input) {
  const backupDirectory = await resolveStage1Path(input.backupDirectory, "Backup directory", "output");
  if (!existsSync(backupDirectory) || !(await stat(backupDirectory)).isDirectory()) fail("BACKUP_MISSING", "The release backup directory does not exist.");
  const { manifest } = await readManifest(backupDirectory);
  const databaseName = safeManifestRelativePath(assertString(manifest.database?.safeDisplayName, "MANIFEST_INVALID", "The manifest database name is missing."), "Database backup name");
  if (databaseName !== BACKUP_DATABASE_FILE_NAME) fail("MANIFEST_INVALID", "The manifest database name is not supported.");
  const databasePath = path.join(backupDirectory, databaseName);
  if (!existsSync(databasePath)) fail("DATABASE_BACKUP_MISSING", "The SQLite backup file is missing.");
  const databaseStat = await stat(databasePath);
  if (!databaseStat.isFile() || databaseStat.size !== manifest.database.sizeBytes) fail("DATABASE_SIZE_MISMATCH", "The SQLite backup size does not match its manifest.");
  if (await sha256File(databasePath) !== manifest.database.sha256) fail("DATABASE_HASH_MISMATCH", "The SQLite backup hash does not match its manifest.");
  const inspection = inspectSqliteDatabase(databasePath);
  assertInspectionMatchesManifest(inspection, manifest.database);

  const storageRoot = path.join(backupDirectory, BACKUP_STORAGE_DIRECTORY);
  if (!existsSync(storageRoot) || !(await stat(storageRoot)).isDirectory()) fail("STORAGE_BACKUP_MISSING", "The private-storage backup directory is missing.");
  const expectedFiles = Array.isArray(manifest.storage?.files) ? manifest.storage.files : fail("MANIFEST_INVALID", "The storage manifest is invalid.");
  const seen = new Set();
  for (const file of expectedFiles) {
    const relativePath = safeManifestRelativePath(file.relativePath, "Storage manifest path");
    if (seen.has(relativePath)) fail("MANIFEST_DUPLICATE_PATH", "The storage manifest contains a duplicate path.");
    seen.add(relativePath);
    const storedPath = path.resolve(storageRoot, ...relativePath.split("/"));
    if (!pathIsInside(storageRoot, storedPath)) fail("PATH_TRAVERSAL", "The storage manifest escapes the backup root.");
    if (!existsSync(storedPath)) fail("STORAGE_FILE_MISSING", "A private-storage backup file is missing.");
    const storedStat = await stat(storedPath);
    if (!storedStat.isFile() || storedStat.size !== file.sizeBytes) fail("STORAGE_SIZE_MISMATCH", "A private-storage file size does not match its manifest.");
    if (await sha256File(storedPath) !== file.sha256) fail("STORAGE_HASH_MISMATCH", "A private-storage file hash does not match its manifest.");
  }
  const actualFiles = await walkStorage(storageRoot);
  if (canonicalJson(actualFiles.map((file) => file.relativePath)) !== canonicalJson([...seen].sort((a, b) => a.localeCompare(b)))) fail("UNEXPECTED_STORAGE_FILE", "The private-storage backup contains an unexpected file.");
  const actualBytes = actualFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (actualFiles.length !== manifest.storage.fileCount || actualBytes !== manifest.storage.totalBytes) fail("STORAGE_TOTAL_MISMATCH", "The private-storage totals do not match the manifest.");
  if (manifest.verification?.databaseHashVerified !== true || manifest.verification?.storageHashesVerified !== true) fail("MANIFEST_VERIFICATION_INCOMPLETE", "The manifest does not record completed hash verification.");

  const result = {
    version: RELEASE_RESTORE_VERIFICATION_VERSION,
    status: "PASSED",
    failureCodes: [],
    manifestVersionSupported: true,
    databaseHashVerified: true,
    storageHashesVerified: true,
    sqliteIntegrity: "ok",
    foreignKeyViolationCount: 0,
    migrationHistoryVerified: true,
    requiredTablesVerified: true,
    rowCountsVerified: true,
    fileCount: actualFiles.length,
    totalBytes: actualBytes
  };
  return { manifest, result, databasePath, storageRoot, inspection };
}

export async function inspectSyntheticSource(input) {
  const databasePath = await resolveStage1Path(input.database, "Synthetic database", "database");
  const storageRoot = await resolveStage1Path(input.storageRoot, "Synthetic storage root", "storage");
  if (!existsSync(databasePath) || !(await stat(databasePath)).isFile()) fail("DATABASE_SOURCE_MISSING", "The synthetic database does not exist.");
  const inspection = inspectSqliteDatabase(databasePath);
  assertHealthyInspection(inspection, "The synthetic source database");
  const storage = await walkStorage(storageRoot);
  return {
    mode: "SYNTHETIC_STAGE1",
    database: { safeDisplayName: path.basename(databasePath), journalMode: inspection.journalMode, sqliteIntegrity: "ok", foreignKeyViolationCount: 0, appliedMigrationCount: inspection.appliedMigrations.length, tableCount: inspection.tableNames.length },
    storage: { fileCount: storage.length, totalBytes: storage.reduce((sum, file) => sum + file.sizeBytes, 0) }
  };
}

export async function createReleaseBackup(input, testOptions = {}) {
  if (input.confirmSynthetic !== true) fail("SYNTHETIC_CONFIRMATION_REQUIRED", "Stage 1 backup creation requires --confirm-synthetic.");
  if (input.sourceWasQuiesced !== true) fail("QUIESCENCE_CONFIRMATION_REQUIRED", "Stage 1 backup creation requires explicit source quiescence confirmation.");
  const databasePath = await resolveStage1Path(input.database, "Synthetic database", "database");
  const storageRoot = await resolveStage1Path(input.storageRoot, "Synthetic storage root", "storage");
  const outputDirectory = await resolveStage1Path(input.output, "Backup output", "output");
  if (!existsSync(databasePath) || !(await stat(databasePath)).isFile()) fail("DATABASE_SOURCE_MISSING", "The synthetic database does not exist.");
  if (!existsSync(storageRoot) || !(await stat(storageRoot)).isDirectory()) fail("STORAGE_MISSING", "The synthetic storage root does not exist.");
  if (existsSync(outputDirectory)) fail("OUTPUT_EXISTS", "The backup output already exists and will not be overwritten.");
  if (pathIsInside(path.dirname(databasePath), outputDirectory, true) || pathIsInside(storageRoot, outputDirectory, true)) fail("OUTPUT_INSIDE_SOURCE", "The backup output must not be inside the source tree.");
  if (pathKey(databasePath) === pathKey(outputDirectory) || pathKey(storageRoot) === pathKey(outputDirectory)) fail("SOURCE_DESTINATION_COLLISION", "The backup source and destination must be different.");

  const sourceInspection = inspectSqliteDatabase(databasePath);
  assertHealthyInspection(sourceInspection, "The synthetic source database");
  const sourceFiles = await walkStorage(storageRoot);
  const stateBefore = await captureSourceState(databasePath, storageRoot);
  const snapshotStartedAt = new Date().toISOString();
  await mkdir(path.dirname(outputDirectory), { recursive: true });
  const partialDirectory = `${outputDirectory}.partial-${randomUUID()}`;
  await resolveStage1Path(partialDirectory, "Partial backup output", "output");

  try {
    await mkdir(partialDirectory, { recursive: false });
    const databaseDestination = path.join(partialDirectory, BACKUP_DATABASE_FILE_NAME);
    const source = new DatabaseSync(databasePath, { readOnly: true });
    try {
      await sqliteBackup(source, databaseDestination);
    } finally {
      source.close();
    }
    const backupInspection = inspectSqliteDatabase(databaseDestination);
    assertHealthyInspection(backupInspection, "The standalone SQLite backup");
    const backupStorageRoot = path.join(partialDirectory, BACKUP_STORAGE_DIRECTORY);
    await mkdir(backupStorageRoot, { recursive: false });
    await copyStorageFiles(sourceFiles, storageRoot, backupStorageRoot, { failAfterFiles: testOptions.failAfterStorageFiles });

    const databaseSize = (await stat(databaseDestination)).size;
    const databaseSha256 = await sha256File(databaseDestination);
    const storedFiles = await walkStorage(backupStorageRoot);
    const snapshotCompletedAt = new Date().toISOString();
    const manifest = sealManifest({
      version: RELEASE_BACKUP_MANIFEST_VERSION,
      backupId: randomUUID(),
      createdAt: snapshotCompletedAt,
      applicationCommit: currentCommit(),
      backupMode: "SYNTHETIC_STAGE1",
      database: {
        safeDisplayName: BACKUP_DATABASE_FILE_NAME,
        sizeBytes: databaseSize,
        sha256: databaseSha256,
        sqliteIntegrity: "ok",
        foreignKeyViolationCount: 0,
        journalMode: sourceInspection.journalMode,
        sourceWasQuiesced: true,
        backupMethod: "NODE_SQLITE_ONLINE_BACKUP",
        appliedMigrations: backupInspection.appliedMigrations,
        requiredTables: backupInspection.tableNames,
        tableCounts: backupInspection.tableCounts
      },
      storage: {
        roots: [{ safeDisplayName: "storage", classification: "SYNTHETIC_PRIVATE_STORAGE" }],
        fileCount: storedFiles.length,
        totalBytes: storedFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
        files: storedFiles.map(({ relativePath, sizeBytes, sha256 }) => ({ relativePath, sizeBytes, sha256 }))
      },
      scopeClassificationVersion: SCOPE_CLASSIFICATION_VERSION,
      snapshotStartedAt,
      snapshotCompletedAt,
      verification: { databaseHashVerified: true, storageHashesVerified: true, manifestSelfCheck: null }
    });
    await writeFile(path.join(partialDirectory, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await verifyReleaseBackup({ backupDirectory: partialDirectory });
    const stateAfter = await captureSourceState(databasePath, storageRoot);
    if (!statesEqual(stateBefore, stateAfter)) fail("SOURCE_CHANGED_DURING_BACKUP", "The synthetic source changed during the backup window.");
    await rename(partialDirectory, outputDirectory);
    return { manifest, sourceUnchanged: true, outputDirectory };
  } catch (error) {
    await rm(partialDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function verifyRestoredTarget(targetDirectory, manifest) {
  const databasePath = path.join(targetDirectory, BACKUP_DATABASE_FILE_NAME);
  const storageRoot = path.join(targetDirectory, BACKUP_STORAGE_DIRECTORY);
  if (!existsSync(databasePath)) fail("RESTORED_DATABASE_MISSING", "The restored database is missing.");
  if (await sha256File(databasePath) !== manifest.database.sha256) fail("DATABASE_HASH_MISMATCH", "The restored database hash does not match the manifest.");
  const inspection = inspectSqliteDatabase(databasePath);
  assertInspectionMatchesManifest(inspection, manifest.database);
  const files = await walkStorage(storageRoot);
  const manifestFiles = new Map(manifest.storage.files.map((file) => [file.relativePath, file]));
  if (files.length !== manifestFiles.size) fail("RESTORED_STORAGE_MISMATCH", "The restored storage file count does not match the manifest.");
  for (const file of files) {
    const expected = manifestFiles.get(file.relativePath);
    if (!expected || expected.sizeBytes !== file.sizeBytes || expected.sha256 !== file.sha256) fail("RESTORED_STORAGE_MISMATCH", "A restored private-storage file does not match the manifest.");
  }
  return { databasePath, storageRoot, inspection, files };
}

export async function restoreReleaseBackup(input, testOptions = {}) {
  if (input.confirmSynthetic !== true) fail("SYNTHETIC_CONFIRMATION_REQUIRED", "Stage 1 restore requires --confirm-synthetic.");
  const backupDirectory = await resolveStage1Path(input.backupDirectory, "Backup directory", "output");
  const targetDirectory = await resolveStage1Path(input.target, "Restore target", "output");
  if (pathKey(backupDirectory) === pathKey(targetDirectory) || pathIsInside(backupDirectory, targetDirectory, true)) fail("SOURCE_DESTINATION_COLLISION", "Restore must use a separate target outside the backup directory.");
  if (existsSync(targetDirectory)) fail("RESTORE_TARGET_NOT_EMPTY", "Restore target must not already exist.");
  const verified = await verifyReleaseBackup({ backupDirectory });
  const backupStateBefore = { database: await sha256File(verified.databasePath), storage: verified.manifest.storage.files };
  await mkdir(path.dirname(targetDirectory), { recursive: true });
  const partialTarget = `${targetDirectory}.partial-${randomUUID()}`;
  await resolveStage1Path(partialTarget, "Partial restore target", "output");
  try {
    await mkdir(partialTarget, { recursive: false });
    await copyFile(verified.databasePath, path.join(partialTarget, BACKUP_DATABASE_FILE_NAME), fsConstants.COPYFILE_EXCL);
    await mkdir(path.join(partialTarget, BACKUP_STORAGE_DIRECTORY), { recursive: false });
    const backupFiles = await walkStorage(verified.storageRoot);
    await copyStorageFiles(backupFiles, verified.storageRoot, path.join(partialTarget, BACKUP_STORAGE_DIRECTORY), { failAfterFiles: testOptions.failAfterStorageFiles });
    const restored = await verifyRestoredTarget(partialTarget, verified.manifest);
    const result = {
      version: RELEASE_RESTORE_VERIFICATION_VERSION,
      status: "PASSED",
      failureCodes: [],
      manifestVersionSupported: true,
      databaseHashVerified: true,
      storageHashesVerified: true,
      sqliteIntegrity: "ok",
      foreignKeyViolationCount: 0,
      migrationHistoryVerified: true,
      requiredTablesVerified: true,
      rowCountsVerified: true,
      restoredPrivateFilesVerified: true,
      sourceAndRestoreSeparated: pathKey(backupDirectory) !== pathKey(targetDirectory)
    };
    await writeFile(path.join(partialTarget, RESTORE_RESULT_FILE_NAME), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    const backupStateAfter = { database: await sha256File(verified.databasePath), storage: verified.manifest.storage.files };
    if (!statesEqual(backupStateBefore, backupStateAfter)) fail("BACKUP_CHANGED_DURING_RESTORE", "The verified backup changed during restore.");
    await rename(partialTarget, targetDirectory);
    return { result, manifest: verified.manifest, targetDirectory, databasePath: path.join(targetDirectory, BACKUP_DATABASE_FILE_NAME), storageRoot: path.join(targetDirectory, BACKUP_STORAGE_DIRECTORY), inspection: restored.inspection };
  } catch (error) {
    await rm(partialTarget, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export function safeFailureResult(error) {
  return {
    version: RELEASE_RESTORE_VERIFICATION_VERSION,
    status: "FAILED",
    failureCodes: [error instanceof ReleaseBackupError ? error.code : "UNEXPECTED_FAILURE"]
  };
}

export async function rewriteManifestForSyntheticTest(backupDirectory, mutate) {
  const manifestPath = path.join(backupDirectory, MANIFEST_FILE_NAME);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mutate(manifest);
  const sealed = sealManifest(manifest);
  await writeFile(manifestPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}
