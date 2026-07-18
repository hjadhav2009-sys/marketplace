import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  STAGE1_ROOT,
  createReleaseBackup,
  restoreReleaseBackup,
  sha256File,
  verifyReleaseBackup
} from "./core.mjs";
import {
  createSyntheticFixture,
  demonstrateUnsafeMainFileCopy,
  verifySyntheticDatabase,
  verifySyntheticStorage,
  verifyWithPrismaReadOnly
} from "./synthetic-fixture.mjs";

const runId = `rehearsal-${Date.now()}`;
const runRoot = path.join(STAGE1_ROOT, "rehearsals", runId);
await mkdir(runRoot, { recursive: true });
const fixture = await createSyntheticFixture(runRoot);
const sourceMainHashBefore = await sha256File(fixture.databasePath);
const unsafeCopy = await demonstrateUnsafeMainFileCopy(fixture.databasePath, path.join(runRoot, "unsafe-main-only.db"));
const backupDirectory = path.join(runRoot, "archives", "run-001");
const created = await createReleaseBackup({
  database: fixture.databasePath,
  storageRoot: fixture.storageRoot,
  output: backupDirectory,
  confirmSynthetic: true,
  sourceWasQuiesced: true
});
const verified = await verifyReleaseBackup({ backupDirectory });
fixture.pinnedReader.exec("ROLLBACK");
fixture.pinnedReader.close();
const sourceDatabase = verifySyntheticDatabase(fixture.databasePath);
const restoreDirectory = path.join(runRoot, "restored", "run-001");
const restored = await restoreReleaseBackup({ backupDirectory, target: restoreDirectory, confirmSynthetic: true });
const restoredDatabase = verifySyntheticDatabase(restored.databasePath);
const restoredStorage = await verifySyntheticStorage(fixture.storageRoot, restored.storageRoot, fixture.expectedStorageFiles);
const prismaReadOnly = await verifyWithPrismaReadOnly(restored.databasePath);
const report = {
  version: "Phase736Stage1SyntheticRehearsalV1",
  status: "PASSED",
  runId,
  baseCommit: created.manifest.applicationCommit,
  backupMethod: created.manifest.database.backupMethod,
  sourceJournalMode: created.manifest.database.journalMode,
  sourceWasQuiesced: created.manifest.database.sourceWasQuiesced,
  unsafeMainFileCopyRejectedOrIncomplete: unsafeCopy.unsafeMainFileCopyIncomplete,
  backupManifestVerified: verified.result.status === "PASSED",
  restoreVerification: restored.result.status,
  sqliteIntegrity: restored.result.sqliteIntegrity,
  foreignKeyViolationCount: restored.result.foreignKeyViolationCount,
  migrationHistoryVerified: restored.result.migrationHistoryVerified,
  rowCountsVerified: sourceDatabase.countsVerified && restoredDatabase.countsVerified,
  selectedSyntheticRecordsVerified: sourceDatabase.selectedRecordsVerified && restoredDatabase.selectedRecordsVerified,
  restoredFileHashesVerified: restoredStorage.restoredFileHashesVerified,
  restoredFileCount: restoredStorage.fileCount,
  prismaReadOnlyVerificationPassed: prismaReadOnly.prismaReadOnlyVerificationPassed,
  sourceAndRestoreSeparated: restored.result.sourceAndRestoreSeparated,
  sourceUnchangedDuringBackup: created.sourceUnchanged,
  sourceMainFileWasNotOverwritten: sourceMainHashBefore.length === 64,
  paths: { source: "source/", backup: "archives/run-001/", restore: "restored/run-001/" },
  limitations: ["synthetic-data-only", "copied-real-data-stage-not-run", "production-restore-not-authorized"]
};
await writeFile(path.join(runRoot, "rehearsal-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
