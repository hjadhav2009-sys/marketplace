import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BACKUP_DATABASE_FILE_NAME,
  BACKUP_STORAGE_DIRECTORY,
  MANIFEST_FILE_NAME,
  REAL_DATABASE_PATH,
  REAL_STORAGE_ROOT,
  ROOT,
  STAGE1_ROOT,
  ReleaseBackupError,
  createReleaseBackup,
  inspectSyntheticSource,
  resolveStage1Path,
  restoreReleaseBackup,
  rewriteManifestForSyntheticTest,
  sealManifest,
  sha256File,
  verifyReleaseBackup
} from "../scripts/release-backup/core.mjs";
import {
  createSyntheticFixture,
  demonstrateUnsafeMainFileCopy,
  verifySyntheticDatabase,
  verifySyntheticStorage
} from "../scripts/release-backup/synthetic-fixture.mjs";

const runRoot = path.join(STAGE1_ROOT, "tests", `run-${Date.now()}`);
await mkdir(runRoot, { recursive: true });
const negativeCases = [];

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => error instanceof ReleaseBackupError && error.code === code, `Expected safe failure code ${code}`);
  negativeCases.push(code);
}

async function cloneBackup(source, name) {
  const target = path.join(runRoot, "cases", name);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, errorOnExist: true, force: false });
  return target;
}

async function resealDatabaseState(backupDirectory) {
  const databasePath = path.join(backupDirectory, BACKUP_DATABASE_FILE_NAME);
  const databaseStat = await stat(databasePath);
  await rewriteManifestForSyntheticTest(backupDirectory, (manifest) => {
    manifest.database.sizeBytes = databaseStat.size;
    manifest.database.sha256 = "pending-test-hash";
  });
  const manifestPath = path.join(backupDirectory, MANIFEST_FILE_NAME);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.database.sha256 = await sha256File(databasePath);
  await writeFile(manifestPath, `${JSON.stringify(sealManifest(manifest), null, 2)}\n`);
}

const fixture = await createSyntheticFixture(runRoot);
const unsafeCopyPath = path.join(runRoot, "unsafe-main-only.db");
assert.equal((await demonstrateUnsafeMainFileCopy(fixture.databasePath, unsafeCopyPath)).unsafeMainFileCopyIncomplete, true);

const backupDirectory = path.join(runRoot, "archives", "primary");
const created = await createReleaseBackup({
  database: fixture.databasePath,
  storageRoot: fixture.storageRoot,
  output: backupDirectory,
  confirmSynthetic: true,
  sourceWasQuiesced: true
});
assert.equal(created.sourceUnchanged, true);
assert.equal(created.manifest.database.journalMode, "wal");
assert.equal(created.manifest.database.backupMethod, "NODE_SQLITE_ONLINE_BACKUP");
fixture.pinnedReader.exec("ROLLBACK");
fixture.pinnedReader.close();
verifySyntheticDatabase(fixture.databasePath);

assert.equal((await verifyReleaseBackup({ backupDirectory })).result.status, "PASSED");
assert.equal((await verifyReleaseBackup({ backupDirectory })).result.status, "PASSED", "Repeated verification is idempotent");
const restoredOne = await restoreReleaseBackup({ backupDirectory, target: path.join(runRoot, "restores", "one"), confirmSynthetic: true });
const restoredTwo = await restoreReleaseBackup({ backupDirectory, target: path.join(runRoot, "restores", "two"), confirmSynthetic: true });
assert.equal(restoredOne.result.status, "PASSED");
assert.equal(restoredTwo.result.status, "PASSED");
verifySyntheticDatabase(restoredOne.databasePath);
await verifySyntheticStorage(fixture.storageRoot, restoredOne.storageRoot, fixture.expectedStorageFiles);
assert.ok(created.manifest.storage.files.some((file) => file.sizeBytes === 0), "Zero-byte private files are retained and hashed");
assert.ok(created.manifest.storage.files.some((file) => /[^\x00-\x7f]/.test(file.relativePath)), "Unicode private filenames are retained");
assert.ok(created.manifest.storage.files.some((file) => file.relativePath.length > 100), "Long safe relative paths are retained");

await expectCode(() => createReleaseBackup({ database: fixture.databasePath, storageRoot: fixture.storageRoot, output: path.join(runRoot, "archives", "unconfirmed"), sourceWasQuiesced: true }), "SYNTHETIC_CONFIRMATION_REQUIRED");
await expectCode(() => createReleaseBackup({ database: fixture.databasePath, storageRoot: fixture.storageRoot, output: path.join(runRoot, "archives", "not-quiesced"), confirmSynthetic: true }), "QUIESCENCE_CONFIRMATION_REQUIRED");
await expectCode(() => restoreReleaseBackup({ backupDirectory, target: path.join(runRoot, "restores", "unconfirmed") }), "SYNTHETIC_CONFIRMATION_REQUIRED");
await expectCode(() => createReleaseBackup({ database: path.join(runRoot, "missing.db"), storageRoot: fixture.storageRoot, output: path.join(runRoot, "archives", "missing-source"), confirmSynthetic: true, sourceWasQuiesced: true }), "DATABASE_SOURCE_MISSING");
await expectCode(() => createReleaseBackup({ database: fixture.databasePath, storageRoot: path.join(runRoot, "absent-storage"), output: path.join(runRoot, "archives", "missing-storage"), confirmSynthetic: true, sourceWasQuiesced: true }), "STORAGE_MISSING");
await expectCode(() => verifyReleaseBackup({ backupDirectory: path.join(runRoot, "archives", "absent") }), "BACKUP_MISSING");

const missingDatabase = await cloneBackup(backupDirectory, "missing-database");
await rm(path.join(missingDatabase, BACKUP_DATABASE_FILE_NAME));
await expectCode(() => verifyReleaseBackup({ backupDirectory: missingDatabase }), "DATABASE_BACKUP_MISSING");
const missingManifest = await cloneBackup(backupDirectory, "missing-manifest");
await rm(path.join(missingManifest, MANIFEST_FILE_NAME));
await expectCode(() => verifyReleaseBackup({ backupDirectory: missingManifest }), "MANIFEST_MISSING");
const malformedManifest = await cloneBackup(backupDirectory, "malformed-manifest");
await writeFile(path.join(malformedManifest, MANIFEST_FILE_NAME), "{not-json");
await expectCode(() => verifyReleaseBackup({ backupDirectory: malformedManifest }), "MANIFEST_INVALID");

const hashMismatch = await cloneBackup(backupDirectory, "database-hash-mismatch");
await writeFile(path.join(hashMismatch, BACKUP_DATABASE_FILE_NAME), "changed", { flag: "a" });
await expectCode(() => verifyReleaseBackup({ backupDirectory: hashMismatch }), "DATABASE_SIZE_MISMATCH");
const sameSizeDatabaseMismatch = await cloneBackup(backupDirectory, "database-same-size-hash-mismatch");
const sameSizeDatabasePath = path.join(sameSizeDatabaseMismatch, BACKUP_DATABASE_FILE_NAME);
const databaseBytes = await readFile(sameSizeDatabasePath);
databaseBytes[databaseBytes.length - 1] ^= 1;
await writeFile(sameSizeDatabasePath, databaseBytes);
await expectCode(() => verifyReleaseBackup({ backupDirectory: sameSizeDatabaseMismatch }), "DATABASE_HASH_MISMATCH");
const corruptDatabase = await cloneBackup(backupDirectory, "corrupt-database");
await writeFile(path.join(corruptDatabase, BACKUP_DATABASE_FILE_NAME), "not a sqlite database");
await resealDatabaseState(corruptDatabase);
await expectCode(() => verifyReleaseBackup({ backupDirectory: corruptDatabase }), "SQLITE_CORRUPT");

const foreignKey = await cloneBackup(backupDirectory, "foreign-key");
const foreignKeyDatabase = path.join(foreignKey, BACKUP_DATABASE_FILE_NAME);
const foreignDb = new DatabaseSync(foreignKeyDatabase);
foreignDb.exec("PRAGMA foreign_keys = OFF");
foreignDb.prepare('INSERT INTO "MarketplaceListingIdentifier" ("id","accountId","marketplaceListingId","marketplace","identifierType","rawValue","normalizedValue","source","active","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run("orphan-id", "missing-account", "missing-listing", "FLIPKART", "SELLER_SKU", "ORPHAN", "ORPHAN", "SYNTHETIC", 1);
foreignDb.close();
await resealDatabaseState(foreignKey);
await expectCode(() => verifyReleaseBackup({ backupDirectory: foreignKey }), "FOREIGN_KEY_VIOLATION");

const missingStorage = await cloneBackup(backupDirectory, "missing-storage-file");
await rm(path.join(missingStorage, BACKUP_STORAGE_DIRECTORY, created.manifest.storage.files[0].relativePath), { force: true });
await expectCode(() => verifyReleaseBackup({ backupDirectory: missingStorage }), "STORAGE_FILE_MISSING");
const changedStorage = await cloneBackup(backupDirectory, "changed-storage");
await writeFile(path.join(changedStorage, BACKUP_STORAGE_DIRECTORY, created.manifest.storage.files[0].relativePath), "changed", { flag: "a" });
await expectCode(() => verifyReleaseBackup({ backupDirectory: changedStorage }), "STORAGE_SIZE_MISMATCH");
const sameSizeStorageMismatch = await cloneBackup(backupDirectory, "storage-same-size-hash-mismatch");
const nonemptyStorageFile = created.manifest.storage.files.find((file) => file.sizeBytes > 0);
assert.ok(nonemptyStorageFile, "The synthetic fixture must contain a nonempty private file");
const sameSizeStoragePath = path.join(sameSizeStorageMismatch, BACKUP_STORAGE_DIRECTORY, nonemptyStorageFile.relativePath);
const storageBytes = await readFile(sameSizeStoragePath);
storageBytes[0] ^= 1;
await writeFile(sameSizeStoragePath, storageBytes);
await expectCode(() => verifyReleaseBackup({ backupDirectory: sameSizeStorageMismatch }), "STORAGE_HASH_MISMATCH");
const extraStorage = await cloneBackup(backupDirectory, "extra-storage");
await writeFile(path.join(extraStorage, BACKUP_STORAGE_DIRECTORY, "unexpected.txt"), "unexpected");
await expectCode(() => verifyReleaseBackup({ backupDirectory: extraStorage }), "UNEXPECTED_STORAGE_FILE");
const missingStorageDirectory = await cloneBackup(backupDirectory, "missing-storage-directory");
await rm(path.join(missingStorageDirectory, BACKUP_STORAGE_DIRECTORY), { recursive: true });
await expectCode(() => verifyReleaseBackup({ backupDirectory: missingStorageDirectory }), "STORAGE_BACKUP_MISSING");

const versionMismatch = await cloneBackup(backupDirectory, "version-mismatch");
await rewriteManifestForSyntheticTest(versionMismatch, (manifest) => { manifest.version = "ReleaseBackupManifestV999"; });
await expectCode(() => verifyReleaseBackup({ backupDirectory: versionMismatch }), "MANIFEST_VERSION_UNSUPPORTED");
const selfCheck = await cloneBackup(backupDirectory, "self-check");
const selfManifestPath = path.join(selfCheck, MANIFEST_FILE_NAME);
const selfManifest = JSON.parse(await readFile(selfManifestPath, "utf8"));
selfManifest.backupId = "tampered";
await writeFile(selfManifestPath, `${JSON.stringify(selfManifest, null, 2)}\n`);
await expectCode(() => verifyReleaseBackup({ backupDirectory: selfCheck }), "MANIFEST_SELF_CHECK_FAILED");

await expectCode(() => createReleaseBackup({ database: fixture.databasePath, storageRoot: fixture.storageRoot, output: backupDirectory, confirmSynthetic: true, sourceWasQuiesced: true }), "OUTPUT_EXISTS");
await expectCode(() => restoreReleaseBackup({ backupDirectory, target: backupDirectory, confirmSynthetic: true }), "SOURCE_DESTINATION_COLLISION");
await expectCode(() => resolveStage1Path(".codex-tmp/stage1-backup/../escape", "Traversal test"), "PATH_TRAVERSAL");
await expectCode(() => resolveStage1Path(path.join(ROOT, "outside-stage1"), "Outside-root test"), "STAGE1_PATH_REQUIRED");
const nonemptyRestore = path.join(runRoot, "restores", "nonempty");
await mkdir(nonemptyRestore, { recursive: true });
await writeFile(path.join(nonemptyRestore, "keep.txt"), "keep");
await expectCode(() => restoreReleaseBackup({ backupDirectory, target: nonemptyRestore, confirmSynthetic: true }), "RESTORE_TARGET_NOT_EMPTY");

const interruptedOutput = path.join(runRoot, "archives", "interrupted");
await expectCode(() => createReleaseBackup({ database: fixture.databasePath, storageRoot: fixture.storageRoot, output: interruptedOutput, confirmSynthetic: true, sourceWasQuiesced: true }, { failAfterStorageFiles: 1 }), "SIMULATED_COPY_INTERRUPTION");
assert.equal(existsSync(interruptedOutput), false, "Interrupted backup leaves no final output");
assert.equal((await readdir(path.dirname(interruptedOutput))).some((name) => name.startsWith(`${path.basename(interruptedOutput)}.partial-`)), false, "Interrupted backup cleans partial output");

const interruptedRestore = path.join(runRoot, "restores", "interrupted");
await expectCode(() => restoreReleaseBackup({ backupDirectory, target: interruptedRestore, confirmSynthetic: true }, { failAfterStorageFiles: 1 }), "SIMULATED_COPY_INTERRUPTION");
assert.equal(existsSync(interruptedRestore), false, "Interrupted restore leaves no final target");
assert.equal((await readdir(path.dirname(interruptedRestore))).some((name) => name.startsWith(`${path.basename(interruptedRestore)}.partial-`)), false, "Interrupted restore cleans partial output");

await expectCode(() => inspectSyntheticSource({ database: REAL_DATABASE_PATH, storageRoot: fixture.storageRoot }), "REAL_DATABASE_REFUSED");
await expectCode(() => inspectSyntheticSource({ database: fixture.databasePath, storageRoot: REAL_STORAGE_ROOT }), "REAL_STORAGE_REFUSED");
await expectCode(() => resolveStage1Path("", "Empty path test"), "EMPTY_PATH");
await expectCode(() => resolveStage1Path("bad\0path", "NUL path test"), "INVALID_PATH");

if (process.platform === "win32") {
  const windowsDatabase = path.relative(ROOT, fixture.databasePath).replaceAll("/", "\\");
  const windowsStorage = path.relative(ROOT, fixture.storageRoot).replaceAll("/", "\\");
  assert.equal((await inspectSyntheticSource({ database: windowsDatabase, storageRoot: windowsStorage })).database.sqliteIntegrity, "ok");
}

let symlinkGuard = "NOT_TESTABLE";
try {
  const outside = path.resolve(STAGE1_ROOT, "..", `stage1-link-target-${Date.now()}`);
  const link = path.join(runRoot, "linked-storage");
  await mkdir(outside, { recursive: true });
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  await expectCode(() => inspectSyntheticSource({ database: fixture.databasePath, storageRoot: link }), "SYMLINK_ESCAPE");
  symlinkGuard = "PASSED";
} catch (error) {
  if (error instanceof ReleaseBackupError) throw error;
}

assert.equal(await sha256File(path.join(backupDirectory, BACKUP_DATABASE_FILE_NAME)), created.manifest.database.sha256, "Backup source remains unchanged after repeated restores");
assert.ok(negativeCases.length >= 25, `Expected at least 25 negative safety cases, observed ${negativeCases.length}.`);
process.stdout.write(`${JSON.stringify({ status: "PASSED", positiveRehearsal: true, negativeCases: negativeCases.length, negativeFailureCodes: negativeCases, symlinkGuard, restoredTwice: true, verificationIdempotent: true, sourceUnchanged: true }, null, 2)}\n`);
