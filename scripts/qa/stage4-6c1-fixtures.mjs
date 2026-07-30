import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYNTHETIC_FIXTURE_VERSION } from "./stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRIVATE_ROOT = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging");
const DATABASE_PATH = path.join(PRIVATE_ROOT, "database", "staging.db");
const ENVIRONMENT_PATH = path.join(PRIVATE_ROOT, "runtime", "environment.json");
const RECEIPT_PATH = path.join(PRIVATE_ROOT, "reports", "stage4-6c1-fixtures.json");
const command = process.argv[2] ?? "verify";

function assertPrivatePath(candidate) {
  const resolved = path.resolve(candidate);
  const boundary = `${path.resolve(ROOT, ".codex-tmp")}${path.sep}`;
  if (!resolved.startsWith(boundary)) throw new Error(`Refusing non-private synthetic path: ${resolved}`);
}

function expectedRows(database) {
  return {
    validationJob: database.prepare(`
      SELECT id, accountId, marketplace, importType, fileName, filePath, batchId,
             status, stage, totalRows, processedRows, errorRows, finishedAt,
             mergeStartedAt, lastError
      FROM ImportJob WHERE id = 'stage4-import-validation-error'
    `).get(),
    validationBatch: database.prepare(`
      SELECT id, accountId, importType, status, totalRows, errorRows, blockingErrorRows
      FROM UploadBatch WHERE id = 'stage4-batch-validation-error'
    `).get(),
    validationIssues: database.prepare(`
      SELECT id, issueType, severity, rawData, safeDataJson, resolved
      FROM ImportRowIssue
      WHERE batchId = 'stage4-batch-validation-error'
      ORDER BY rowNumber, id
    `).all(),
    validationWork: database.prepare(`
      SELECT COUNT(*) AS count
      FROM WorkTask
      WHERE metadataJson LIKE '%stage4-import-validation-error%'
         OR workCardSnapshotJson LIKE '%stage4-import-validation-error%'
         OR routeSnapshotJson LIKE '%stage4-import-validation-error%'
    `).get(),
    assemblyReady: database.prepare(`
      SELECT id, stage, status, requiredQuantity, completedQuantity, problemReason
      FROM WorkTask WHERE id = 'stage3-order-assembly-ready-assemble'
    `).get(),
    assemblyPartial: database.prepare(`
      SELECT id, stage, status, requiredQuantity, completedQuantity, problemReason
      FROM WorkTask WHERE id = 'stage3-order-assembly-progress-assemble'
    `).get(),
    deletionPreview: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-preview'
    `).get(),
    deletionQuarantine: database.prepare(`
      SELECT id, actionKind, state, totalFiles, totalBytes, purgeAfter
      FROM DataDeletionJob WHERE id = 'stage4-delete-quarantined'
    `).get(),
    deletionRestored: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-completed'
    `).get(),
    deletionPurged: database.prepare(`
      SELECT id, actionKind, state FROM DataDeletionJob WHERE id = 'stage4-delete-purged'
    `).get(),
  };
}

function verifyRows(rows) {
  const failures = [];
  if (rows.validationJob?.accountId !== "stage3-account-fk-01"
    || rows.validationJob?.marketplace !== "FLIPKART"
    || rows.validationJob?.importType !== "FLIPKART_PRODUCT_INVENTORY"
    || rows.validationJob?.status !== "FAILED"
    || rows.validationJob?.stage !== "VALIDATING"
    || rows.validationJob?.totalRows !== 3
    || rows.validationJob?.processedRows !== 3
    || rows.validationJob?.errorRows !== 2
    || rows.validationJob?.finishedAt != null
    || rows.validationJob?.mergeStartedAt != null
    || !rows.validationJob?.filePath
    || !existsSync(rows.validationJob.filePath)) failures.push("IMPORT_VALIDATION_ERROR_JOB");
  if (rows.validationBatch?.accountId !== "stage3-account-fk-01"
    || rows.validationBatch?.importType !== "ORDER_LABEL"
    || rows.validationBatch?.status !== "FAILED"
    || rows.validationBatch?.totalRows !== 3
    || rows.validationBatch?.errorRows !== 2
    || rows.validationBatch?.blockingErrorRows !== 2) failures.push("IMPORT_VALIDATION_ERROR_BATCH");
  if (rows.validationIssues?.length !== 2
    || rows.validationIssues.some((issue) =>
      issue.severity !== "ERROR"
      || issue.rawData != null
      || !issue.safeDataJson
      || issue.resolved !== 0
    )) failures.push("IMPORT_VALIDATION_ERROR_ISSUES");
  if (Number(rows.validationWork?.count) !== 0) failures.push("IMPORT_VALIDATION_ERROR_WORK_LEAK");
  if (rows.assemblyReady?.stage !== "ASSEMBLE"
    || rows.assemblyReady?.status !== "READY"
    || rows.assemblyReady?.requiredQuantity <= 0
    || rows.assemblyReady?.completedQuantity !== 0
    || rows.assemblyReady?.problemReason != null) failures.push("ASSEMBLY_READY");
  if (rows.assemblyPartial?.stage !== "ASSEMBLE"
    || rows.assemblyPartial?.status !== "IN_PROGRESS"
    || rows.assemblyPartial?.completedQuantity <= 0
    || rows.assemblyPartial?.completedQuantity >= rows.assemblyPartial?.requiredQuantity
    || rows.assemblyPartial?.problemReason != null) failures.push("ASSEMBLY_PARTIAL");
  if (rows.deletionPreview?.actionKind !== "PURGE_QA_OPERATIONAL_DATA"
    || rows.deletionPreview?.state !== "PREVIEWED") failures.push("DATA_DELETE_PREVIEW");
  if (rows.deletionQuarantine?.actionKind !== "QUARANTINE_IMPORT_SOURCE_FILE"
    || rows.deletionQuarantine?.state !== "COMPLETED"
    || rows.deletionQuarantine?.totalFiles <= 0
    || Number(rows.deletionQuarantine?.purgeAfter) <= Date.now()) failures.push("DATA_QUARANTINED");
  if (rows.deletionRestored?.actionKind !== "RESTORE_QUARANTINED_FILES"
    || rows.deletionRestored?.state !== "COMPLETED") failures.push("DATA_RESTORED");
  if (rows.deletionPurged?.actionKind !== "PURGE_QUARANTINED_FILES"
    || rows.deletionPurged?.state !== "PURGED") failures.push("DATA_PURGED");
  return failures;
}

async function prepare() {
  assertPrivatePath(DATABASE_PATH);
  assertPrivatePath(ENVIRONMENT_PATH);
  assertPrivatePath(RECEIPT_PATH);
  if (!existsSync(DATABASE_PATH)) throw new Error("Synthetic staging database is missing.");
  const database = new DatabaseSync(DATABASE_PATH);
  const now = Date.now();
  try {
    database.exec("BEGIN IMMEDIATE");
    const source = database.prepare(`
      SELECT filePath FROM ImportJob WHERE id = 'stage4-import-failed'
    `).get();
    if (!source?.filePath || !existsSync(source.filePath)) {
      throw new Error("The retained synthetic import source is unavailable.");
    }
    database.prepare(`
      INSERT INTO UploadBatch (
        id, accountId, uploadedById, filename, importType, status, totalRows,
        errorRows, warningRows, blockingErrorRows, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        accountId = excluded.accountId,
        uploadedById = excluded.uploadedById,
        filename = excluded.filename,
        importType = excluded.importType,
        status = excluded.status,
        totalRows = excluded.totalRows,
        errorRows = excluded.errorRows,
        warningRows = excluded.warningRows,
        blockingErrorRows = excluded.blockingErrorRows,
        updatedAt = excluded.updatedAt
    `).run(
      "stage4-batch-validation-error",
      "stage3-account-fk-01",
      "stage3-import-manager",
      "synthetic-product-inventory-validation.csv",
      "ORDER_LABEL",
      "FAILED",
      3,
      2,
      0,
      2,
      now,
      now,
    );
    database.prepare(`
      INSERT INTO ImportJob (
        id, accountId, createdByUserId, marketplace, importType, fileName,
        filePath, batchId, status, totalRows, processedRows, createdRows,
        updatedRows, unchangedRows, duplicateRows, warningRows, errorRows,
        missingListingRows, missingImageRows, startedAt, finishedAt, lastError,
        createdAt, updatedAt, stage, currentFile, totalFiles, processedFiles,
        reportJson, attemptNumber, currentChunk
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        accountId = excluded.accountId,
        createdByUserId = excluded.createdByUserId,
        marketplace = excluded.marketplace,
        importType = excluded.importType,
        fileName = excluded.fileName,
        filePath = excluded.filePath,
        batchId = excluded.batchId,
        status = excluded.status,
        totalRows = excluded.totalRows,
        processedRows = excluded.processedRows,
        createdRows = excluded.createdRows,
        updatedRows = excluded.updatedRows,
        unchangedRows = excluded.unchangedRows,
        duplicateRows = excluded.duplicateRows,
        warningRows = excluded.warningRows,
        errorRows = excluded.errorRows,
        missingListingRows = excluded.missingListingRows,
        missingImageRows = excluded.missingImageRows,
        startedAt = excluded.startedAt,
        finishedAt = excluded.finishedAt,
        lastError = excluded.lastError,
        updatedAt = excluded.updatedAt,
        stage = excluded.stage,
        currentFile = excluded.currentFile,
        totalFiles = excluded.totalFiles,
        processedFiles = excluded.processedFiles,
        reportJson = excluded.reportJson,
        cancelRequestedAt = NULL,
        mergeStartedAt = NULL,
        runnerId = NULL,
        leaseExpiresAt = NULL,
        heartbeatAt = NULL,
        attemptNumber = excluded.attemptNumber,
        checkpointJson = NULL,
        currentEntryId = NULL,
        currentChunk = excluded.currentChunk,
        mergeCompletedEntryIdsJson = NULL
    `).run(
      "stage4-import-validation-error",
      "stage3-account-fk-01",
      "stage3-import-manager",
      "FLIPKART",
      "FLIPKART_PRODUCT_INVENTORY",
      "synthetic-product-inventory-validation.csv",
      source.filePath,
      "stage4-batch-validation-error",
      "FAILED",
      3,
      3,
      0,
      0,
      1,
      0,
      0,
      2,
      0,
      0,
      now,
      null,
      "Synthetic validation failed. Review blocking issues.",
      now,
      now,
      "VALIDATING",
      "synthetic-product-inventory-validation.csv",
      1,
      1,
      JSON.stringify({ synthetic: true, lifecycle: "VALIDATION_FAILED", blockingIssues: 2 }),
      1,
      0,
    );
    database.prepare(`
      DELETE FROM ImportRowIssue WHERE batchId = 'stage4-batch-validation-error'
    `).run();
    const insertValidationIssue = database.prepare(`
      INSERT INTO ImportRowIssue (
        id, batchId, rowNumber, issueType, message, rawData, safeDataJson,
        severity, sourceType, sourceId, resolved, version, createdAt
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'ERROR', 'PRODUCT_INVENTORY', NULL, 0, 1, ?)
    `);
    insertValidationIssue.run(
      "stage4-validation-error-missing-sku",
      "stage4-batch-validation-error",
      2,
      "MISSING_REQUIRED_IDENTIFIER",
      "Synthetic row is missing the required Seller SKU.",
      JSON.stringify({ row: 2, field: "sellerSku", synthetic: true }),
      now,
    );
    insertValidationIssue.run(
      "stage4-validation-error-invalid-price",
      "stage4-batch-validation-error",
      3,
      "INVALID_PRICE",
      "Synthetic row has an invalid non-negative price.",
      JSON.stringify({ row: 3, field: "sellingPrice", synthetic: true }),
      now,
    );
    database.prepare(`
      UPDATE DataDeletionJob
      SET actionKind = 'QUARANTINE_IMPORT_SOURCE_FILE',
          state = 'COMPLETED',
          manifestJson = ?,
          quarantineRelativePath = 'stage4-delete-quarantined',
          totalFiles = 1,
          totalBytes = 22,
          purgeAfter = ?,
          completedAt = ?,
          updatedAt = ?
      WHERE id = 'stage4-delete-quarantined'
    `).run(
      JSON.stringify([{
        storageKind: "IMPORT_JOB",
        sourceRelativePath: "stage4-synthetic-import.csv",
        quarantineRelativePath: "0-stage4-synthetic-import.csv",
        size: 22,
      }]),
      now + 14 * 24 * 60 * 60 * 1000,
      now,
      now,
    );
    database.prepare(`
      INSERT INTO DataDeletionJob (
        id, accountId, actorUserId, actionKind, state, clientRequestId,
        requestFingerprint, scopeFingerprint, scopeJson, previewJson,
        totalFiles, totalBytes, completedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        actionKind = excluded.actionKind,
        state = excluded.state,
        totalFiles = excluded.totalFiles,
        totalBytes = excluded.totalBytes,
        completedAt = excluded.completedAt,
        updatedAt = excluded.updatedAt
    `).run(
      "stage4-delete-purged",
      "stage3-account-fk-01",
      "stage3-owner",
      "PURGE_QUARANTINED_FILES",
      "PURGED",
      "stage4-purged",
      "1".repeat(64),
      "2".repeat(64),
      JSON.stringify({ synthetic: true, deletionJobId: "stage4-delete-historical-source" }),
      JSON.stringify({ synthetic: true, affectedFiles: 1 }),
      1,
      22,
      now,
      now,
      now,
    );
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
  const rows = expectedRows(database);
  database.close();
  const failures = verifyRows(rows);
  if (failures.length) throw new Error(`Synthetic fixture preparation failed: ${failures.join(", ")}`);

  const environment = JSON.parse(await readFile(ENVIRONMENT_PATH, "utf8"));
  environment.seedVersion = SYNTHETIC_FIXTURE_VERSION;
  await writeFile(ENVIRONMENT_PATH, `${JSON.stringify(environment, null, 2)}\n`);
  await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify({
    schema: "Stage4_6C1SyntheticFixtureReceiptV1",
    fixtureVersion: SYNTHETIC_FIXTURE_VERSION,
    syntheticOnly: true,
    databasePath: path.relative(ROOT, DATABASE_PATH).replaceAll(path.sep, "/"),
    preparedAt: new Date().toISOString(),
    rows,
  }, null, 2)}\n`);
  return { status: "STAGE4_6C1_FIXTURES_PREPARED", fixtureVersion: SYNTHETIC_FIXTURE_VERSION, failures: [] };
}

function verify() {
  assertPrivatePath(DATABASE_PATH);
  if (!existsSync(DATABASE_PATH)) throw new Error("Synthetic staging database is missing.");
  const database = new DatabaseSync(DATABASE_PATH, { readOnly: true });
  const rows = expectedRows(database);
  database.close();
  const failures = verifyRows(rows);
  return {
    status: failures.length ? "STAGE4_6C1_FIXTURES_INVALID" : "STAGE4_6C1_FIXTURES_VERIFIED",
    fixtureVersion: SYNTHETIC_FIXTURE_VERSION,
    failures,
    rows,
  };
}

const result = command === "prepare" ? await prepare() : verify();
console.log(JSON.stringify(result, null, 2));
if (result.failures.length) process.exitCode = 2;
