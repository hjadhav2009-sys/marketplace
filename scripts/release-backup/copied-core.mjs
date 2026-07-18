import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import {
  BACKUP_DATABASE_FILE_NAME,
  BACKUP_STORAGE_DIRECTORY,
  MANIFEST_FILE_NAME,
  RELEASE_BACKUP_MANIFEST_VERSION,
  RELEASE_RESTORE_VERIFICATION_VERSION,
  ROOT,
  ReleaseBackupError,
  inspectSqliteDatabase,
  manifestSelfCheck,
  pathIsInside,
  safeManifestRelativePath,
  sealManifest,
  sha256File
} from "./core.mjs";

export const STAGE2_ROOT = path.resolve(ROOT, ".codex-tmp", "stage2-copied-rehearsal");
export const COPIED_CONFIRMATION_PHRASE = "READ AND COPY PRODUCTION DATA ONLY";
export const COPIED_SCOPE_VERSION = "ReleaseCopiedScopeV1";
export const QUIESCENCE_RECEIPT_VERSION = "ReleaseQuiescenceReceiptV1";
const ALLOWED_CLASSIFICATIONS = new Set(["MUST_BACK_UP", "REGENERABLE_INCLUDED", "MUST_BACK_UP_PENDING_CLEANUP"]);

function fail(code, message) {
  throw new ReleaseBackupError(code, message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function assertPlainPath(candidate, label, expectedType) {
  if (!existsSync(candidate)) fail("SOURCE_MISSING", `${label} does not exist.`);
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) fail("SYMLINK_ESCAPE", `${label} must not be a symbolic link or junction.`);
  if (expectedType === "file" && !info.isFile()) fail("SOURCE_INVALID", `${label} must be a file.`);
  if (expectedType === "directory" && !info.isDirectory()) fail("SOURCE_INVALID", `${label} must be a directory.`);
}

export async function resolveStage2PrivatePath(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) fail("EMPTY_PATH", `${label} is required.`);
  if (raw.includes("\0") || raw.split(/[\\/]+/).includes("..")) fail("PATH_TRAVERSAL", `${label} is invalid.`);
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ROOT, raw);
  if (!pathIsInside(STAGE2_ROOT, resolved)) fail("STAGE2_PRIVATE_PATH_REQUIRED", `${label} must stay inside the private Stage 2 root.`);
  return resolved;
}

async function walkFiles(root) {
  if (!existsSync(root)) return [];
  await assertPlainPath(root, "Storage root", "directory");
  const files = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) fail("SYMLINK_ESCAPE", "A storage root contains a symbolic link or junction.");
      if (info.isDirectory()) await visit(fullPath);
      else if (info.isFile()) {
        const relativePath = safeManifestRelativePath(path.relative(root, fullPath).split(path.sep).join("/"));
        files.push({ relativePath, fullPath, sizeBytes: info.size, sha256: await sha256File(fullPath) });
      } else fail("UNSUPPORTED_STORAGE_ENTRY", "A storage root contains an unsupported entry.");
    }
  }
  await visit(root);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function scopeSeal(scope) {
  const sealed = structuredClone(scope);
  sealed.scopeHash = null;
  sealed.scopeHash = digest(sealed);
  return sealed;
}

export async function createCopiedScopeFile({ databasePath, roots, output, allowTestSource = false }) {
  const target = await resolveStage2PrivatePath(output, "Scope output");
  if (existsSync(target)) fail("OUTPUT_EXISTS", "The scope output already exists.");
  const database = path.resolve(databasePath);
  if (!allowTestSource && pathIsInside(path.resolve(ROOT, ".codex-tmp"), database, true)) fail("PRODUCTION_SOURCE_REQUIRED", "Copied mode requires the configured source outside disposable storage.");
  await assertPlainPath(database, "Configured SQLite database", "file");
  const normalizedRoots = [];
  for (const root of roots) {
    if (!/^[a-z][a-z0-9-]{1,40}$/i.test(root.id) || !ALLOWED_CLASSIFICATIONS.has(root.classification)) fail("SCOPE_INVALID", "A scope root is invalid.");
    const resolvedPath = path.resolve(root.path);
    if (pathKey(resolvedPath) === pathKey(database) || pathIsInside(resolvedPath, target, true)) fail("SOURCE_DESTINATION_COLLISION", "Scope source and output must be separate.");
    const files = await walkFiles(resolvedPath);
    normalizedRoots.push({ id: root.id, path: resolvedPath, classification: root.classification, included: true, evidence: String(root.evidence ?? "").slice(0, 500), fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0), largestFileBytes: files.reduce((max, file) => Math.max(max, file.sizeBytes), 0), longestRelativePath: files.reduce((max, file) => Math.max(max, file.relativePath.length), 0) });
  }
  if (new Set(normalizedRoots.map((root) => root.id)).size !== normalizedRoots.length) fail("SCOPE_INVALID", "Scope root IDs must be unique.");
  const scope = scopeSeal({ version: COPIED_SCOPE_VERSION, createdAt: new Date().toISOString(), databasePath: database, roots: normalizedRoots, scopeHash: null });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(scope, null, 2)}\n`, { flag: "wx" });
  return scope;
}

export async function readCopiedScope(scopeFile) {
  const resolved = await resolveStage2PrivatePath(scopeFile, "Scope file");
  const scope = JSON.parse(await readFile(resolved, "utf8"));
  if (scope.version !== COPIED_SCOPE_VERSION || scope.scopeHash !== scopeSeal(scope).scopeHash) fail("SCOPE_HASH_MISMATCH", "The copied-rehearsal scope file is invalid.");
  if (!Array.isArray(scope.roots) || !scope.roots.length || scope.roots.some((root) => !root.included || !ALLOWED_CLASSIFICATIONS.has(root.classification))) fail("SCOPE_INVALID", "The copied-rehearsal scope is incomplete.");
  return { scope, resolved };
}

export async function writeQuiescenceReceipt({ output, databasePath, activeWriterCount, activeImportLeaseCount, portInUse, checkedProcessKinds = [] }) {
  const target = await resolveStage2PrivatePath(output, "Quiescence receipt");
  if (existsSync(target)) fail("OUTPUT_EXISTS", "The quiescence receipt already exists.");
  if (activeWriterCount || activeImportLeaseCount || portInUse) fail("ACTIVE_WRITER", "Application writers must be stopped before copied rehearsal.");
  const now = new Date().toISOString();
  const receipt = { version: QUIESCENCE_RECEIPT_VERSION, databasePath: path.resolve(databasePath), quiescenceStartedAt: now, quiescenceVerifiedAt: now, activeWriterCount: 0, activeImportLeaseCount: 0, portInUse: false, checkedProcessKinds: checkedProcessKinds.map(String).slice(0, 20), receiptHash: null };
  receipt.receiptHash = digest(receipt);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receipt;
}

async function readReceipt(file, databasePath) {
  if (!file) fail("QUIESCENCE_RECEIPT_REQUIRED", "A quiescence receipt is required.");
  const resolved = await resolveStage2PrivatePath(file, "Quiescence receipt");
  const receipt = JSON.parse(await readFile(resolved, "utf8"));
  const copy = structuredClone(receipt);
  copy.receiptHash = null;
  if (receipt.version !== QUIESCENCE_RECEIPT_VERSION || receipt.receiptHash !== digest(copy) || pathKey(receipt.databasePath) !== pathKey(databasePath) || receipt.activeWriterCount || receipt.activeImportLeaseCount || receipt.portInUse) fail("QUIESCENCE_RECEIPT_INVALID", "The quiescence receipt is invalid.");
  return receipt;
}

async function fingerprint(databasePath, roots) {
  const databaseFiles = [];
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${databasePath}${suffix}`;
    if (existsSync(candidate)) databaseFiles.push({ suffix: suffix || "main", sizeBytes: (await stat(candidate)).size, sha256: await sha256File(candidate) });
  }
  const storage = [];
  for (const root of roots) {
    const files = await walkFiles(root.path);
    storage.push({ id: root.id, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0), aggregateSha256: digest(files.map(({ relativePath, sizeBytes, sha256 }) => ({ relativePath, sizeBytes, sha256 }))), files });
  }
  return { capturedAt: new Date().toISOString(), databaseFiles, storage, aggregateSha256: digest({ databaseFiles, storage: storage.map(({ id, fileCount, totalBytes, aggregateSha256 }) => ({ id, fileCount, totalBytes, aggregateSha256 })) }) };
}

export async function inspectCopiedCapacity({ databasePath, scopeFile, freeBytesOverride }) {
  const { scope } = await readCopiedScope(scopeFile);
  if (pathKey(scope.databasePath) !== pathKey(databasePath)) fail("SCOPE_INVALID", "Scope database does not match the configured source.");
  const databaseBytes = (await stat(databasePath)).size;
  const storageBytes = scope.roots.reduce((sum, root) => sum + root.totalBytes, 0);
  const requiredBytes = Math.ceil((databaseBytes + storageBytes) * 3 * 1.25);
  const volume = await statfs(STAGE2_ROOT);
  const freeBytes = freeBytesOverride ?? Number(volume.bavail * volume.bsize);
  return { databaseBytes, storageBytes, fileCount: scope.roots.reduce((sum, root) => sum + root.fileCount, 0), largestIncludedFile: Math.max(0, ...scope.roots.map((root) => root.largestFileBytes)), longestRelativePath: Math.max(0, ...scope.roots.map((root) => root.longestRelativePath)), requiredBytes, freeBytes, sufficient: freeBytes >= requiredBytes };
}

async function copyScopedFiles(scopeRoots, destinationRoot, testOptions) {
  let copied = 0;
  const manifestFiles = [];
  for (const root of scopeRoots) {
    const rootDestination = path.join(destinationRoot, root.id);
    await mkdir(rootDestination, { recursive: true });
    for (const file of await walkFiles(root.path)) {
      await testOptions?.onAfterStorageFileCopied?.({ copiedFileCount: copied, sourceFile: file.fullPath });
      const destination = path.join(rootDestination, ...file.relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.fullPath, destination, fsConstants.COPYFILE_EXCL);
      manifestFiles.push({ rootId: root.id, relativePath: file.relativePath, sizeBytes: file.sizeBytes, sha256: file.sha256 });
      copied += 1;
    }
  }
  return manifestFiles;
}

function requireCopiedConfirmations(input) {
  if (input.confirmCopiedRehearsal !== true) fail("COPIED_CONFIRMATION_REQUIRED", "Copied rehearsal confirmation is required.");
  if (input.confirmationPhrase !== COPIED_CONFIRMATION_PHRASE) fail("CONFIRMATION_PHRASE_MISMATCH", "The copied rehearsal confirmation phrase is incorrect.");
  if (!/^[a-f0-9]{64}$/i.test(String(input.expectedSourceSha256 ?? ""))) fail("EXPECTED_SOURCE_HASH_REQUIRED", "An expected source SHA-256 is required.");
}

export async function createCopiedBackup(input, testOptions = {}) {
  requireCopiedConfirmations(input);
  const output = await resolveStage2PrivatePath(input.output, "Copied backup output");
  const { scope } = await readCopiedScope(input.scopeFile);
  const databasePath = path.resolve(input.database);
  if (!testOptions.allowTestSource && pathIsInside(path.resolve(ROOT, ".codex-tmp"), databasePath, true)) fail("PRODUCTION_SOURCE_REQUIRED", "The copied source must be outside disposable storage.");
  if (pathKey(scope.databasePath) !== pathKey(databasePath)) fail("SCOPE_INVALID", "Scope database does not match the requested source.");
  await assertPlainPath(databasePath, "Configured SQLite database", "file");
  await readReceipt(input.quiescenceReceipt, databasePath);
  if (existsSync(output)) fail("OUTPUT_EXISTS", "Copied backup output already exists.");
  for (const root of scope.roots) if (pathIsInside(root.path, output, true) || pathKey(root.path) === pathKey(output)) fail("SOURCE_DESTINATION_COLLISION", "Copied backup output collides with a source root.");
  const sourceHash = await sha256File(databasePath);
  if (sourceHash !== input.expectedSourceSha256) fail("SOURCE_HASH_MISMATCH", "The configured source database does not match the approved preflight hash.");
  const capacity = await inspectCopiedCapacity({ databasePath, scopeFile: input.scopeFile, freeBytesOverride: testOptions.freeBytesOverride });
  if (!capacity.sufficient) fail("INSUFFICIENT_CAPACITY", "The private rehearsal volume lacks the required free-space budget.");
  const before = await fingerprint(databasePath, scope.roots);
  const partial = `${output}.partial-${randomUUID()}`;
  await mkdir(path.dirname(output), { recursive: true });
  try {
    await mkdir(partial);
    const startedAt = new Date().toISOString();
    const stagedSourceDirectory = path.join(partial, "source-snapshot");
    const stagedSourcePath = path.join(stagedSourceDirectory, "source.sqlite");
    await mkdir(stagedSourceDirectory);
    for (const file of before.databaseFiles) {
      const sourcePath = file.suffix === "main" ? databasePath : `${databasePath}${file.suffix}`;
      const destinationPath = file.suffix === "main" ? stagedSourcePath : `${stagedSourcePath}${file.suffix}`;
      await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
    }
    const afterDatabaseStaging = await fingerprint(databasePath, scope.roots);
    if (before.aggregateSha256 !== afterDatabaseStaging.aggregateSha256) fail("SOURCE_CHANGED_DURING_BACKUP", "The copied source changed while staging the quiesced SQLite file set.");
    const stagedInspection = inspectSqliteDatabase(stagedSourcePath);
    const source = new DatabaseSync(stagedSourcePath, { readOnly: true });
    try { await sqliteBackup(source, path.join(partial, BACKUP_DATABASE_FILE_NAME)); } finally { source.close(); }
    const backupDatabase = path.join(partial, BACKUP_DATABASE_FILE_NAME);
    const inspection = inspectSqliteDatabase(backupDatabase);
    if (inspection.integrity.join(",") !== "ok" || inspection.foreignKeyViolationCount) fail("BACKUP_DATABASE_INVALID", "The copied database backup failed integrity verification.");
    const storageRoot = path.join(partial, BACKUP_STORAGE_DIRECTORY);
    await mkdir(storageRoot);
    const copiedFiles = await copyScopedFiles(scope.roots, storageRoot, testOptions);
    const manifest = sealManifest({
      version: RELEASE_BACKUP_MANIFEST_VERSION,
      backupId: randomUUID(), createdAt: new Date().toISOString(), applicationCommit: input.applicationCommit,
      backupMode: "COPIED_PRODUCTION_REHEARSAL", scopeClassificationVersion: COPIED_SCOPE_VERSION,
      database: { safeDisplayName: BACKUP_DATABASE_FILE_NAME, sizeBytes: (await stat(backupDatabase)).size, sha256: await sha256File(backupDatabase), sqliteIntegrity: "ok", foreignKeyViolationCount: 0, journalMode: stagedInspection.journalMode, sourceWasQuiesced: true, backupMethod: "QUIESCED_SIDECAR_COPY_THEN_NODE_SQLITE_ONLINE_BACKUP", appliedMigrations: inspection.appliedMigrations, requiredTables: inspection.tableNames, tableCounts: inspection.tableCounts },
      storage: { roots: scope.roots.map(({ id, classification }) => ({ id, classification })), fileCount: copiedFiles.length, totalBytes: copiedFiles.reduce((sum, file) => sum + file.sizeBytes, 0), files: copiedFiles },
      scopeHash: scope.scopeHash, snapshotStartedAt: startedAt, snapshotCompletedAt: new Date().toISOString(),
      verification: { databaseHashVerified: true, storageHashesVerified: true, manifestSelfCheck: null }
    });
    await writeFile(path.join(partial, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    const after = await fingerprint(databasePath, scope.roots);
    if (before.aggregateSha256 !== after.aggregateSha256) fail("SOURCE_CHANGED_DURING_BACKUP", "The copied source changed during the backup window.");
    await rm(stagedSourceDirectory, { recursive: true, force: true });
    await verifyCopiedBackup(partial);
    await rename(partial, output);
    return { output, manifest, before, after, capacity };
  } catch (error) {
    await rm(partial, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function verifyCopiedBackup(backupDirectory) {
  const backup = await resolveStage2PrivatePath(backupDirectory, "Copied backup");
  const manifest = JSON.parse(await readFile(path.join(backup, MANIFEST_FILE_NAME), "utf8"));
  if (manifest.version !== RELEASE_BACKUP_MANIFEST_VERSION || manifest.verification?.manifestSelfCheck !== manifestSelfCheck(manifest)) fail("MANIFEST_SELF_CHECK_FAILED", "The copied manifest is invalid.");
  const databasePath = path.join(backup, BACKUP_DATABASE_FILE_NAME);
  if ((await stat(databasePath)).size !== manifest.database.sizeBytes || await sha256File(databasePath) !== manifest.database.sha256) fail("DATABASE_HASH_MISMATCH", "The copied database hash does not match.");
  const inspection = inspectSqliteDatabase(databasePath);
  if (inspection.integrity.join(",") !== "ok" || inspection.foreignKeyViolationCount || canonicalJson(inspection.tableCounts) !== canonicalJson(manifest.database.tableCounts) || canonicalJson(inspection.appliedMigrations) !== canonicalJson(manifest.database.appliedMigrations)) fail("BACKUP_DATABASE_INVALID", "The copied database verification failed.");
  const expected = new Map(manifest.storage.files.map((file) => [`${file.rootId}/${file.relativePath}`, file]));
  const actual = [];
  for (const root of manifest.storage.roots) for (const file of await walkFiles(path.join(backup, BACKUP_STORAGE_DIRECTORY, root.id))) actual.push({ key: `${root.id}/${file.relativePath}`, ...file });
  if (actual.length !== expected.size) fail("STORAGE_HASH_MISMATCH", "Copied storage file count differs.");
  for (const file of actual) { const wanted = expected.get(file.key); if (!wanted || wanted.sizeBytes !== file.sizeBytes || wanted.sha256 !== file.sha256) fail("STORAGE_HASH_MISMATCH", "Copied storage hash differs."); }
  return { manifest, databasePath, storageRoot: path.join(backup, BACKUP_STORAGE_DIRECTORY), inspection, result: { version: RELEASE_RESTORE_VERIFICATION_VERSION, status: "PASSED", sqliteIntegrity: "ok", foreignKeyViolationCount: 0, migrationHistoryVerified: true, rowCountsVerified: true, databaseHashVerified: true, storageHashesVerified: true } };
}

export async function restoreCopiedBackup({ backupDirectory, target }) {
  const targetDirectory = await resolveStage2PrivatePath(target, "Copied restore target");
  if (existsSync(targetDirectory)) fail("RESTORE_TARGET_NOT_EMPTY", "Copied restore target must not exist.");
  const verified = await verifyCopiedBackup(backupDirectory);
  if (pathIsInside(path.resolve(backupDirectory), targetDirectory, true) || pathKey(backupDirectory) === pathKey(targetDirectory)) fail("SOURCE_DESTINATION_COLLISION", "Restore target must be separate from backup.");
  const partial = `${targetDirectory}.partial-${randomUUID()}`;
  try {
    await mkdir(partial, { recursive: true });
    await copyFile(verified.databasePath, path.join(partial, BACKUP_DATABASE_FILE_NAME), fsConstants.COPYFILE_EXCL);
    await mkdir(path.join(partial, BACKUP_STORAGE_DIRECTORY));
    for (const root of verified.manifest.storage.roots) {
      const sourceRoot = path.join(verified.storageRoot, root.id);
      const targetRoot = path.join(partial, BACKUP_STORAGE_DIRECTORY, root.id);
      await mkdir(targetRoot, { recursive: true });
      for (const file of await walkFiles(sourceRoot)) {
        const destination = path.join(targetRoot, ...file.relativePath.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(file.fullPath, destination, fsConstants.COPYFILE_EXCL);
      }
    }
    await rename(partial, targetDirectory);
    const restoredDatabase = path.join(targetDirectory, BACKUP_DATABASE_FILE_NAME);
    if (await sha256File(restoredDatabase) !== verified.manifest.database.sha256) fail("DATABASE_HASH_MISMATCH", "Restored database hash differs.");
    return { targetDirectory, databasePath: restoredDatabase, storageRoot: path.join(targetDirectory, BACKUP_STORAGE_DIRECTORY), manifest: verified.manifest, result: { ...verified.result, sourceAndRestoreSeparated: true, restoredPrivateFilesVerified: true } };
  } catch (error) {
    await rm(partial, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function privateFingerprint({ databasePath, scopeFile }) {
  const { scope } = await readCopiedScope(scopeFile);
  return fingerprint(path.resolve(databasePath), scope.roots);
}
