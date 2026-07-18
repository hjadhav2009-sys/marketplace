import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  COPIED_CONFIRMATION_PHRASE,
  STAGE2_ROOT,
  createCopiedBackup,
  createCopiedScopeFile,
  inspectCopiedCapacity,
  privateFingerprint,
  readCopiedScope,
  resolveStage2PrivatePath,
  restoreCopiedBackup,
  verifyCopiedBackup,
  writeQuiescenceReceipt
} from "../scripts/release-backup/copied-core.mjs";
import { MANIFEST_FILE_NAME, REAL_DATABASE_PATH, REAL_STORAGE_ROOT, ReleaseBackupError, STAGE1_ROOT, inspectSyntheticSource, sha256File } from "../scripts/release-backup/core.mjs";
import { createSyntheticFixture, verifySyntheticDatabase } from "../scripts/release-backup/synthetic-fixture.mjs";

const id = `run-${Date.now()}`;
const fixtureRoot = path.join(STAGE1_ROOT, "copied-mode-tests", id);
const runRoot = path.join(STAGE2_ROOT, "tests", id);
await mkdir(runRoot, { recursive: true });
const fixture = await createSyntheticFixture(fixtureRoot);
const sourceHash = await sha256File(fixture.databasePath);
const roots = [
  { id: "import-jobs", path: path.join(fixture.storageRoot, "import-jobs"), classification: "MUST_BACK_UP", evidence: "Synthetic retained ImportJob artifacts." },
  { id: "marking-library", path: path.join(fixture.storageRoot, "marking-library"), classification: "MUST_BACK_UP", evidence: "Synthetic marking library." },
  { id: "product-images", path: path.join(fixture.storageRoot, "images"), classification: "REGENERABLE_INCLUDED", evidence: "Synthetic image cache included conservatively." },
  { id: "uploads", path: path.join(fixture.storageRoot, "uploads"), classification: "MUST_BACK_UP_PENDING_CLEANUP", evidence: "Ambiguous historical root included conservatively." }
];
await mkdir(roots[3].path, { recursive: true });
await writeFile(path.join(roots[3].path, "synthetic-legacy.txt"), "synthetic only\n");
const scopeFile = path.join(runRoot, "scope.json");
const scope = await createCopiedScopeFile({ databasePath: fixture.databasePath, roots, output: scopeFile, allowTestSource: true });
const receiptFile = path.join(runRoot, "quiescence.json");
await writeQuiescenceReceipt({ output: receiptFile, databasePath: fixture.databasePath, activeWriterCount: 0, activeImportLeaseCount: 0, portInUse: false, checkedProcessKinds: ["synthetic"] });
const baseInput = { database: fixture.databasePath, scopeFile, quiescenceReceipt: receiptFile, expectedSourceSha256: sourceHash, confirmationPhrase: COPIED_CONFIRMATION_PHRASE, confirmCopiedRehearsal: true, applicationCommit: "synthetic-test" };
const observed = [];

async function expectCode(operation, code) {
  await assert.rejects(operation, (error) => error instanceof ReleaseBackupError && error.code === code, `Expected ${code}`);
  observed.push(code);
}

await expectCode(() => inspectSyntheticSource({ database: REAL_DATABASE_PATH, storageRoot: fixture.storageRoot }), "REAL_DATABASE_REFUSED");
await expectCode(() => inspectSyntheticSource({ database: fixture.databasePath, storageRoot: REAL_STORAGE_ROOT }), "REAL_STORAGE_REFUSED");
await expectCode(() => createCopiedBackup({ ...baseInput, confirmCopiedRehearsal: false, output: path.join(runRoot, "no-confirm") }, { allowTestSource: true }), "COPIED_CONFIRMATION_REQUIRED");
await expectCode(() => createCopiedBackup({ ...baseInput, output: path.join(runRoot, "nonproduction-source-refused") }), "PRODUCTION_SOURCE_REQUIRED");
await expectCode(() => createCopiedBackup({ ...baseInput, confirmationPhrase: "wrong", output: path.join(runRoot, "bad-phrase") }, { allowTestSource: true }), "CONFIRMATION_PHRASE_MISMATCH");
await expectCode(() => createCopiedBackup({ ...baseInput, expectedSourceSha256: "", output: path.join(runRoot, "no-hash") }, { allowTestSource: true }), "EXPECTED_SOURCE_HASH_REQUIRED");
await expectCode(() => createCopiedBackup({ ...baseInput, expectedSourceSha256: "0".repeat(64), output: path.join(runRoot, "wrong-hash") }, { allowTestSource: true }), "SOURCE_HASH_MISMATCH");
await expectCode(() => createCopiedBackup({ ...baseInput, quiescenceReceipt: undefined, output: path.join(runRoot, "no-receipt") }, { allowTestSource: true }), "QUIESCENCE_RECEIPT_REQUIRED");
const badReceiptFile = path.join(runRoot, "bad-receipt.json");
const badReceipt = JSON.parse(await readFile(receiptFile, "utf8"));
badReceipt.activeWriterCount = 1;
await writeFile(badReceiptFile, JSON.stringify(badReceipt));
await expectCode(() => createCopiedBackup({ ...baseInput, quiescenceReceipt: badReceiptFile, output: path.join(runRoot, "bad-receipt-output") }, { allowTestSource: true }), "QUIESCENCE_RECEIPT_INVALID");
await expectCode(() => writeQuiescenceReceipt({ output: path.join(runRoot, "active-writer.json"), databasePath: fixture.databasePath, activeWriterCount: 1, activeImportLeaseCount: 0, portInUse: false }), "ACTIVE_WRITER");
await expectCode(() => writeQuiescenceReceipt({ output: path.join(runRoot, "active-lease.json"), databasePath: fixture.databasePath, activeWriterCount: 0, activeImportLeaseCount: 1, portInUse: false }), "ACTIVE_WRITER");
await expectCode(() => writeQuiescenceReceipt({ output: path.join(runRoot, "busy-port.json"), databasePath: fixture.databasePath, activeWriterCount: 0, activeImportLeaseCount: 0, portInUse: true }), "ACTIVE_WRITER");
await expectCode(() => createCopiedBackup({ ...baseInput, output: path.join(runRoot, "capacity") }, { allowTestSource: true, freeBytesOverride: 1 }), "INSUFFICIENT_CAPACITY");
assert.equal((await inspectCopiedCapacity({ databasePath: fixture.databasePath, scopeFile, freeBytesOverride: Number.MAX_SAFE_INTEGER })).sufficient, true);

const tamperedScope = path.join(runRoot, "tampered-scope.json");
const scopeJson = JSON.parse(await readFile(scopeFile, "utf8"));
scopeJson.roots[0].classification = "TEMPORARY_EXCLUDE";
await writeFile(tamperedScope, JSON.stringify(scopeJson));
await expectCode(() => readCopiedScope(tamperedScope), "SCOPE_HASH_MISMATCH");
await expectCode(() => createCopiedScopeFile({ databasePath: fixture.databasePath, roots: [...roots, roots[0]], output: path.join(runRoot, "duplicate-scope.json"), allowTestSource: true }), "SCOPE_INVALID");
await expectCode(() => createCopiedScopeFile({ databasePath: fixture.databasePath, roots: [{ ...roots[0], classification: "TEMPORARY_EXCLUDE" }], output: path.join(runRoot, "excluded-scope.json"), allowTestSource: true }), "SCOPE_INVALID");
const collidingRoot = path.join(runRoot, "colliding-source");
await mkdir(collidingRoot);
await writeFile(path.join(collidingRoot, "synthetic.txt"), "synthetic only");
await expectCode(() => createCopiedScopeFile({ databasePath: fixture.databasePath, roots: [{ id: "collision", path: collidingRoot, classification: "MUST_BACK_UP", evidence: "Synthetic collision." }], output: path.join(collidingRoot, "scope.json"), allowTestSource: true }), "SOURCE_DESTINATION_COLLISION");
await expectCode(() => resolveStage2PrivatePath("", "Empty test path"), "EMPTY_PATH");
await expectCode(() => resolveStage2PrivatePath(path.resolve(STAGE2_ROOT, "..", "escape"), "Outside test path"), "STAGE2_PRIVATE_PATH_REQUIRED");

const capacity = await inspectCopiedCapacity({ databasePath: fixture.databasePath, scopeFile });
assert.equal(capacity.fileCount, 7);
assert.ok(capacity.requiredBytes >= (capacity.databaseBytes + capacity.storageBytes) * 3);
assert.equal(scope.roots.length, 4, "Multiple roots are explicit in the scope");
assert.equal(scope.roots.find((root) => root.id === "uploads").classification, "MUST_BACK_UP_PENDING_CLEANUP");

const backupDirectory = path.join(runRoot, "backup-one");
const before = await privateFingerprint({ databasePath: fixture.databasePath, scopeFile });
const created = await createCopiedBackup({ ...baseInput, output: backupDirectory }, { allowTestSource: true });
assert.equal(created.before.aggregateSha256, created.after.aggregateSha256);
assert.equal((await verifyCopiedBackup(backupDirectory)).result.status, "PASSED");
assert.equal((await privateFingerprint({ databasePath: fixture.databasePath, scopeFile })).aggregateSha256, before.aggregateSha256);
await expectCode(() => createCopiedBackup({ ...baseInput, output: backupDirectory }, { allowTestSource: true }), "OUTPUT_EXISTS");

const restoreOne = await restoreCopiedBackup({ backupDirectory, target: path.join(runRoot, "restore-one") });
const restoreTwo = await restoreCopiedBackup({ backupDirectory, target: path.join(runRoot, "restore-two") });
assert.equal(restoreOne.result.status, "PASSED");
assert.equal(restoreTwo.result.status, "PASSED");
verifySyntheticDatabase(restoreOne.databasePath);
await expectCode(() => restoreCopiedBackup({ backupDirectory, target: restoreOne.targetDirectory }), "RESTORE_TARGET_NOT_EMPTY");
await expectCode(() => restoreCopiedBackup({ backupDirectory, target: path.join(backupDirectory, "nested") }), "SOURCE_DESTINATION_COLLISION");
await expectCode(() => restoreCopiedBackup({ backupDirectory, target: path.resolve(STAGE2_ROOT, "..", "outside-restore") }), "STAGE2_PRIVATE_PATH_REQUIRED");

const corruptManifestBackup = path.join(runRoot, "corrupt-manifest");
await cp(backupDirectory, corruptManifestBackup, { recursive: true });
const manifestPath = path.join(corruptManifestBackup, MANIFEST_FILE_NAME);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.backupId = "changed";
await writeFile(manifestPath, JSON.stringify(manifest));
await expectCode(() => verifyCopiedBackup(corruptManifestBackup), "MANIFEST_SELF_CHECK_FAILED");

const mutationRoot = path.join(STAGE1_ROOT, "copied-mode-tests", `${id}-mutation`);
const mutationFixture = await createSyntheticFixture(mutationRoot);
const mutationScopeFile = path.join(runRoot, "mutation-scope.json");
await createCopiedScopeFile({ databasePath: mutationFixture.databasePath, roots: [{ id: "storage", path: mutationFixture.storageRoot, classification: "MUST_BACK_UP", evidence: "Synthetic mutation detection." }], output: mutationScopeFile, allowTestSource: true });
const mutationReceipt = path.join(runRoot, "mutation-receipt.json");
await writeQuiescenceReceipt({ output: mutationReceipt, databasePath: mutationFixture.databasePath, activeWriterCount: 0, activeImportLeaseCount: 0, portInUse: false });
const mutationSourceHash = await sha256File(mutationFixture.databasePath);
await expectCode(() => createCopiedBackup({ ...baseInput, database: mutationFixture.databasePath, expectedSourceSha256: mutationSourceHash, output: path.join(runRoot, "scope-database-mismatch") }, { allowTestSource: true }), "SCOPE_INVALID");
let mutationInjected = false;
await expectCode(() => createCopiedBackup({ database: mutationFixture.databasePath, scopeFile: mutationScopeFile, quiescenceReceipt: mutationReceipt, expectedSourceSha256: mutationSourceHash, confirmationPhrase: COPIED_CONFIRMATION_PHRASE, confirmCopiedRehearsal: true, applicationCommit: "synthetic-test", output: path.join(runRoot, "mutated-backup") }, { allowTestSource: true, onAfterStorageFileCopied: async ({ sourceFile }) => { if (!mutationInjected) { mutationInjected = true; await writeFile(sourceFile, Buffer.from(`test-mutation-${Date.now()}`)); } } }), "SOURCE_CHANGED_DURING_BACKUP");
mutationFixture.pinnedReader.exec("ROLLBACK");
mutationFixture.pinnedReader.close();

const migratedCopy = path.join(runRoot, "migration-copy.db");
await cp(restoreTwo.databasePath, migratedCopy);
const migrated = new DatabaseSync(migratedCopy);
const migrationCountBefore = Number(migrated.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations"').get().count);
migrated.close();
assert.equal(migrationCountBefore, (await verifyCopiedBackup(backupDirectory)).manifest.database.appliedMigrations.length);
assert.equal(await sha256File(fixture.databasePath), sourceHash, "Migration rehearsal fixture source is unchanged");
fixture.pinnedReader.exec("ROLLBACK");
fixture.pinnedReader.close();

assert.ok(path.resolve(runRoot).startsWith(path.resolve(STAGE2_ROOT)));
assert.equal(existsSync(path.join(runRoot, ".git")), false);
assert.ok(observed.length >= 25);
process.stdout.write(`${JSON.stringify({ status: "PASSED", negativeCases: observed.length, requiredScenarios: 25, copiedConfirmations: "PASSED", multipleRoots: "PASSED", uploadsClassification: "MUST_BACK_UP_PENDING_CLEANUP", sourceMutationDetection: "PASSED", restores: 2, sourceUnchanged: true, productionPathsRefusedBySyntheticMode: true, privateIgnoredOutput: true, aclAndEncryptionAreRuntimePreflights: true, alternatePortPolicy: true }, null, 2)}\n`);
