import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createPhase736Database } from "./phase-7-3-6-test-db";
import { hashPassword } from "../lib/password";

const fixtureRoot = path.resolve(".codex-tmp", "data-management-fixtures");
rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(fixtureRoot, { recursive: true });
process.env.IMPORT_JOB_STORAGE_ROOT = path.join(fixtureRoot, "imports");
process.env.CONSIGNMENT_IMPORT_ROOT = path.join(fixtureRoot, "consignments");
process.env.PRODUCT_IMAGE_STORAGE_ROOT = path.join(fixtureRoot, "images");
process.env.DATA_QUARANTINE_ROOT = path.join(fixtureRoot, "quarantine");
for (const value of [process.env.IMPORT_JOB_STORAGE_ROOT, process.env.CONSIGNMENT_IMPORT_ROOT, process.env.PRODUCT_IMAGE_STORAGE_ROOT, process.env.DATA_QUARANTINE_ROOT]) mkdirSync(value!, { recursive: true });

const dbFixture = createPhase736Database("data-management");
const { prisma } = await import("../lib/prisma");
const {
  createOwnerActionGrant,
  consumeOwnerActionGrant,
  executeDataAction,
  previewDataAction
} = await import("../src/lib/data-management/service");

const ownerId = "dm-owner";
const sessionId = "dm-synthetic-session";
const password = "Synthetic-owner-password-34!";
const accountId = "dm-stage-account";
const otherAccountId = "dm-other-account";

async function authorizeAndExecute(
  actionKind: Parameters<typeof previewDataAction>[1],
  scope: Parameters<typeof previewDataAction>[2],
  requestId = `dm-test-${randomUUID()}`
) {
  const preview = await previewDataAction(ownerId, actionKind, scope);
  assert.equal(preview.blockers.length, 0, `Unexpected preview blocker: ${preview.blockers.join(", ")}`);
  const token = await createOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind,
    scopeFingerprint: preview.scopeFingerprint,
    password
  });
  return executeDataAction({
    actorUserId: ownerId,
    sessionId,
    grantToken: token,
    clientRequestId: requestId,
    actionKind,
    scope,
    typedPhrase: preview.typedPhrase
  });
}

try {
  await prisma.account.createMany({ data: [
    { id: accountId, name: "Synthetic Stage Account", code: "STAGE-DM-01", marketplace: "FLIPKART" },
    { id: otherAccountId, name: "Synthetic Other Account", code: "LIVE-LIKE-02", marketplace: "FLIPKART" }
  ] });
  await prisma.user.createMany({ data: [
    { id: ownerId, username: "synthetic-dm-owner", passwordHash: hashPassword(password), name: "Synthetic Owner", role: "OWNER", active: true },
    { id: "dm-manager", username: "synthetic-dm-manager", passwordHash: hashPassword(password), name: "Synthetic Manager", role: "PICKER", active: true }
  ] });

  await assert.rejects(
    () => previewDataAction("dm-manager", "PURGE_QA_OPERATIONAL_DATA", { accountId }),
    /Owner authorization/,
    "Managers cannot preview owner-only destructive operations."
  );
  const accountPreview = await previewDataAction(ownerId, "PURGE_QA_OPERATIONAL_DATA", { accountId });
  const previewReceiptCount = await prisma.dataDeletionJob.count();
  await previewDataAction(ownerId, "PURGE_QA_OPERATIONAL_DATA", { accountId });
  assert.equal(await prisma.dataDeletionJob.count(), previewReceiptCount, "Dry-run preview performs no mutation.");
  await assert.rejects(() => createOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    password: "wrong-password"
  }), /reauthentication failed/i);

  const oneUseToken = await createOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    password
  });
  await consumeOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    token: oneUseToken
  });
  await assert.rejects(() => consumeOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    token: oneUseToken
  }), /already used|expired/);

  const scopeToken = await createOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    password
  });
  await assert.rejects(() => consumeOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "ARCHIVE_LISTING",
    scopeFingerprint: accountPreview.scopeFingerprint,
    token: scopeToken
  }), /does not match/);

  const wrongPhraseToken = await createOwnerActionGrant({
    actorUserId: ownerId, sessionId, actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint, password
  });
  await assert.rejects(() => executeDataAction({
    actorUserId: ownerId, sessionId, grantToken: wrongPhraseToken, clientRequestId: "dm-wrong-phrase",
    actionKind: "PURGE_QA_OPERATIONAL_DATA", scope: { accountId }, typedPhrase: "WRONG PHRASE"
  }), /Type exactly/);
  assert.equal(await prisma.dataDeletionJob.count({ where: { clientRequestId: "dm-wrong-phrase" } }), 0);

  const expiredToken = await createOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    password
  });
  await prisma.ownerActionGrant.updateMany({ where: { tokenHash: { not: "" }, usedAt: null }, data: { expiresAt: new Date(0) } });
  await assert.rejects(() => consumeOwnerActionGrant({
    actorUserId: ownerId,
    sessionId,
    actionKind: "PURGE_QA_OPERATIONAL_DATA",
    scopeFingerprint: accountPreview.scopeFingerprint,
    token: expiredToken
  }), /expired/);

  const importName = `job_${randomUUID()}-synthetic.csv`;
  const importPath = path.join(process.env.IMPORT_JOB_STORAGE_ROOT!, importName);
  writeFileSync(importPath, "synthetic,row\n1,2\n");
  await prisma.importJob.create({ data: {
    id: "dm-import", accountId, marketplace: "FLIPKART", importType: "FLIPKART_ORDER",
    fileName: "synthetic.csv", filePath: importPath, status: "COMPLETED", stage: "COMPLETED"
  } });
  const quarantine = await authorizeAndExecute("QUARANTINE_IMPORT_JOB_FILE", { importJobId: "dm-import" }, "dm-quarantine-import");
  assert.equal(quarantine.state, "COMPLETED");
  assert.equal(existsSync(importPath), false, "The managed file is moved before metadata is finalized.");
  const archivedImport = await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-import" } });
  assert.equal(archivedImport.filePath, null);
  assert.equal(archivedImport.status, "ARCHIVED");
  assert.equal(await prisma.auditLog.count({ where: { action: "QUARANTINE_IMPORT_JOB_FILE" } }), 1);
  const importManifest = JSON.parse(quarantine.manifestJson ?? "[]") as Array<{ sha256?: string }>;
  assert.equal(importManifest[0]?.sha256, createHash("sha256").update("synthetic,row\n1,2\n").digest("hex"), "Quarantine records the verified content hash.");
  const replayed = await executeDataAction({
    actorUserId: ownerId,
    sessionId,
    grantToken: "already-consumed-token",
    clientRequestId: "dm-quarantine-import",
    actionKind: "QUARANTINE_IMPORT_JOB_FILE",
    scope: { importJobId: "dm-import" },
    typedPhrase: "not-needed-for-authorized-replay"
  });
  assert.equal(replayed.id, quarantine.id, "A committed request returns its durable result.");
  assert.equal(await prisma.dataDeletionJob.count({ where: { clientRequestId: "dm-quarantine-import" } }), 1);
  await assert.rejects(() => executeDataAction({
    actorUserId: ownerId, sessionId, grantToken: "irrelevant", clientRequestId: "dm-quarantine-import",
    actionKind: "QUARANTINE_IMPORT_JOB_FILE", scope: { importJobId: "different-import" }, typedPhrase: "irrelevant"
  }), /different data/);

  const replayPreview = await previewDataAction(ownerId, "RESTORE_QUARANTINED_FILES", { deletionJobId: quarantine.id });
  const replayToken = await createOwnerActionGrant({ actorUserId: ownerId, sessionId, actionKind: "RESTORE_QUARANTINED_FILES", scopeFingerprint: replayPreview.scopeFingerprint, password });
  const restored = await executeDataAction({
    actorUserId: ownerId, sessionId, grantToken: replayToken, clientRequestId: "dm-restore-import",
    actionKind: "RESTORE_QUARANTINED_FILES", scope: { deletionJobId: quarantine.id }, typedPhrase: replayPreview.typedPhrase
  });
  assert.equal(restored.state, "COMPLETED");
  assert.equal(existsSync(importPath), true, "Restore returns the file to its exact managed location.");
  assert.equal((await prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: quarantine.id } })).state, "RESTORED");
  assert.equal((await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-import" } })).filePath, importPath);

  const productJobName = `job_${randomUUID()}`;
  const productJobPath = path.join(process.env.IMPORT_JOB_STORAGE_ROOT!, productJobName);
  mkdirSync(path.join(productJobPath, "reports"), { recursive: true });
  writeFileSync(path.join(productJobPath, "manifest.json"), "{}");
  writeFileSync(path.join(productJobPath, "reports", "summary.json"), "{\"safe\":true}");
  await prisma.importJob.create({ data: {
    id: "dm-product-import", accountId, marketplace: "FLIPKART", importType: "FLIPKART_PRODUCT_INVENTORY",
    fileName: "synthetic-product.zip", filePath: productJobPath, reportJson: "{\"result\":\"original\"}", status: "COMPLETED", stage: "COMPLETED"
  } });
  const reportJob = await authorizeAndExecute("QUARANTINE_GENERATED_REPORTS", { importJobId: "dm-product-import" }, "dm-quarantine-reports");
  assert.equal(existsSync(path.join(productJobPath, "reports")), false);
  assert.equal((await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-product-import" } })).reportJson, null);
  await authorizeAndExecute("RESTORE_QUARANTINED_FILES", { deletionJobId: reportJob.id }, "dm-restore-reports");
  assert.equal(existsSync(path.join(productJobPath, "reports", "summary.json")), true);
  assert.equal((await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-product-import" } })).reportJson, "{\"result\":\"original\"}");

  const crashName = `job_${randomUUID()}-crash.csv`;
  const crashPath = path.join(process.env.IMPORT_JOB_STORAGE_ROOT!, crashName);
  writeFileSync(crashPath, "synthetic-crash-recovery");
  await prisma.importJob.create({ data: {
    id: "dm-crash-import", accountId, marketplace: "FLIPKART", importType: "FLIPKART_ORDER",
    fileName: "crash.csv", filePath: crashPath, status: "COMPLETED", stage: "COMPLETED"
  } });
  const crashScope = { importJobId: "dm-crash-import", accountId };
  const crashPreview = await previewDataAction(ownerId, "QUARANTINE_IMPORT_SOURCE_FILE", crashScope);
  const crashQuarantine = path.join(process.env.DATA_QUARANTINE_ROOT!, "dm-crash-job");
  mkdirSync(crashQuarantine, { recursive: true });
  renameSync(crashPath, path.join(crashQuarantine, `0-${crashName}`));
  await prisma.dataDeletionJob.create({ data: {
    id: "dm-crash-job", accountId, actorUserId: ownerId, actionKind: "QUARANTINE_IMPORT_SOURCE_FILE",
    state: "FILES_QUARANTINED", clientRequestId: "dm-crash-resume", requestFingerprint: "synthetic",
    scopeFingerprint: crashPreview.scopeFingerprint, scopeJson: JSON.stringify(crashScope),
    previewJson: JSON.stringify({ counts: { files: 1 }, bytes: 24, warnings: [] }),
    manifestJson: JSON.stringify([{ storageKind: "IMPORT_JOB", sourceRelativePath: crashName, quarantineRelativePath: `0-${crashName}`, size: 24, recordId: "dm-crash-import", recordMetadata: { status: "COMPLETED", stage: "COMPLETED", reportJson: null } }]),
    quarantineRelativePath: "dm-crash-job", totalFiles: 1, totalBytes: 24
  } });
  const resumedCrash = await executeDataAction({
    actorUserId: ownerId, sessionId, grantToken: "not-required-after-authorization",
    clientRequestId: "dm-crash-resume", actionKind: "QUARANTINE_IMPORT_SOURCE_FILE",
    scope: { importJobId: "dm-crash-import" }, typedPhrase: "network-retry"
  });
  assert.equal(resumedCrash.state, "COMPLETED", "A restart resumes after the file phase without moving it twice.");
  assert.equal((await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-crash-import" } })).filePath, null);
  assert.equal(await prisma.auditLog.count({ where: { entityId: "dm-crash-job", action: "QUARANTINE_IMPORT_SOURCE_FILE" } }), 1);

  const sourceOnlyName = `job_${randomUUID()}-source.csv`;
  const sourceOnlyPath = path.join(process.env.IMPORT_JOB_STORAGE_ROOT!, sourceOnlyName);
  writeFileSync(sourceOnlyPath, "safe");
  await prisma.importJob.create({ data: {
    id: "dm-source-only", accountId, marketplace: "FLIPKART", importType: "FLIPKART_ORDER",
    fileName: "source-only.csv", filePath: sourceOnlyPath, status: "COMPLETED", stage: "COMPLETED"
  } });
  const sourceOnlyJob = await authorizeAndExecute("QUARANTINE_IMPORT_SOURCE_FILE", { importJobId: "dm-source-only" }, "dm-source-only-quarantine");
  const sourceOnlyRecord = await prisma.importJob.findUniqueOrThrow({ where: { id: "dm-source-only" } });
  assert.equal(sourceOnlyRecord.filePath, null);
  assert.equal(sourceOnlyRecord.status, "COMPLETED", "File-only quarantine preserves the import job state.");
  await prisma.dataDeletionJob.update({ where: { id: sourceOnlyJob.id }, data: { purgeAfter: new Date(0) } });
  await authorizeAndExecute("PURGE_QUARANTINED_FILES", { deletionJobId: sourceOnlyJob.id }, "dm-purge-quarantine");
  assert.equal((await prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: sourceOnlyJob.id } })).state, "PURGED");

  const consignmentRelative = "batch-safe/source/source.csv";
  const consignmentPath = path.join(process.env.CONSIGNMENT_IMPORT_ROOT!, ...consignmentRelative.split("/"));
  mkdirSync(path.dirname(consignmentPath), { recursive: true });
  writeFileSync(consignmentPath, "Seller SKU,Quantity Sent\nSTAGE,1\n");
  await prisma.consignmentBatch.create({ data: {
    id: "dm-consignment", accountId, externalConsignmentNumber: "STAGE-CONSIGNMENT-1",
    displayName: "Synthetic Consignment", sourceFileName: "source.csv", sourceFileSha256: "a".repeat(64), status: "DRAFT"
  } });
  await prisma.consignmentImportFile.create({ data: {
    id: "dm-consignment-file", consignmentBatchId: "dm-consignment", fileType: "SOURCE_UPLOAD",
    originalFileName: "source.csv", managedRelativePath: consignmentRelative, fileSizeBytes: 38,
    sha256: createHash("sha256").update("Seller SKU,Quantity Sent\nSTAGE,1\n").digest("hex")
  } });
  const consignmentJob = await authorizeAndExecute("QUARANTINE_CONSIGNMENT_FILE", { consignmentFileId: "dm-consignment-file" }, "dm-quarantine-consignment");
  assert.equal(existsSync(consignmentPath), false);
  assert.equal((await prisma.consignmentImportFile.findUniqueOrThrow({ where: { id: "dm-consignment-file" } })).managedRelativePath, null);
  await authorizeAndExecute("RESTORE_QUARANTINED_FILES", { deletionJobId: consignmentJob.id }, "dm-restore-consignment");
  assert.equal(existsSync(consignmentPath), true);
  await prisma.consignmentBatch.update({ where: { id: "dm-consignment" }, data: { status: "ACTIVE" } });
  await prisma.consignmentImportFile.update({ where: { id: "dm-consignment-file" }, data: { isCurrentSource: true } });
  const activeConsignmentFile = await previewDataAction(ownerId, "QUARANTINE_CONSIGNMENT_FILE", { consignmentFileId: "dm-consignment-file" });
  assert.ok(activeConsignmentFile.blockers.some(item => /current source/i.test(item)), "Actionable Consignment source files fail closed.");
  await prisma.consignmentBatch.update({ where: { id: "dm-consignment" }, data: { status: "DRAFT" } });

  const imagePath = path.join(process.env.PRODUCT_IMAGE_STORAGE_ROOT!, "stage", "cached.jpg");
  mkdirSync(path.dirname(imagePath), { recursive: true });
  writeFileSync(imagePath, "synthetic-image");
  await prisma.skuImageMapping.create({ data: {
    id: "dm-image", accountId, sku: "STAGE-IMAGE", imageUrl: "https://example.invalid/image.jpg",
    cacheStatus: "CACHED", cacheFilePath: imagePath, cacheFileSizeBytes: 15, cacheCachedAt: new Date("2026-01-01T00:00:00Z")
  } });
  const imageJob = await authorizeAndExecute("CLEAR_IMAGE_CACHE", { accountId }, "dm-clear-image-cache");
  assert.equal(existsSync(imagePath), false);
  assert.equal((await prisma.skuImageMapping.findUniqueOrThrow({ where: { id: "dm-image" } })).cacheFilePath, null);
  await authorizeAndExecute("RESTORE_QUARANTINED_FILES", { deletionJobId: imageJob.id }, "dm-restore-image-cache");
  assert.equal(existsSync(imagePath), true);
  assert.equal((await prisma.skuImageMapping.findUniqueOrThrow({ where: { id: "dm-image" } })).cacheStatus, "CACHED");

  await prisma.importJob.create({ data: {
    id: "dm-unsafe-path", accountId, marketplace: "FLIPKART", importType: "FLIPKART_ORDER",
    fileName: "unsafe.csv", filePath: path.resolve(fixtureRoot, "..", "outside.csv"), status: "COMPLETED", stage: "COMPLETED"
  } });
  const unsafePathPreview = await previewDataAction(ownerId, "QUARANTINE_IMPORT_SOURCE_FILE", { importJobId: "dm-unsafe-path" });
  assert.ok(unsafePathPreview.blockers.some(item => /outside managed storage/i.test(item)), "Paths outside managed roots fail closed.");

  await prisma.importJob.update({ where: { id: "dm-import" }, data: { status: "RUNNING", stage: "PARSING" } });
  const activePreview = await previewDataAction(ownerId, "QUARANTINE_IMPORT_JOB_FILE", { importJobId: "dm-import" });
  assert.ok(activePreview.blockers.some(item => /Active|review-required/.test(item)));
  await prisma.importJob.update({ where: { id: "dm-import" }, data: { status: "NEEDS_MAPPING", stage: "NEEDS_MAPPING" } });
  const mappingPreview = await previewDataAction(ownerId, "QUARANTINE_IMPORT_JOB_FILE", { importJobId: "dm-import" });
  assert.ok(mappingPreview.blockers.some(item => /Active|review-required/.test(item)), "A retained NEEDS_MAPPING job requires explicit safe abandonment.");
  await prisma.importJob.update({ where: { id: "dm-import" }, data: { status: "ARCHIVED", stage: "ARCHIVED" } });

  const failingName = `job_${randomUUID()}-failure.csv`;
  const failingPath = path.join(process.env.IMPORT_JOB_STORAGE_ROOT!, failingName);
  writeFileSync(failingPath, "rollback-me");
  await prisma.importJob.create({ data: {
    id: "dm-db-failure", accountId, marketplace: "FLIPKART", importType: "FLIPKART_ORDER",
    fileName: "failure.csv", filePath: failingPath, status: "COMPLETED", stage: "COMPLETED"
  } });
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "dm_fail_import_update" BEFORE UPDATE ON "ImportJob" WHEN OLD."id" = 'dm-db-failure' BEGIN SELECT RAISE(ABORT, 'synthetic database failure'); END`);
  const failingPreview = await previewDataAction(ownerId, "QUARANTINE_IMPORT_SOURCE_FILE", { importJobId: "dm-db-failure" });
  const failingToken = await createOwnerActionGrant({ actorUserId: ownerId, sessionId, actionKind: "QUARANTINE_IMPORT_SOURCE_FILE", scopeFingerprint: failingPreview.scopeFingerprint, password });
  await assert.rejects(() => executeDataAction({
    actorUserId: ownerId, sessionId, grantToken: failingToken, clientRequestId: "dm-database-failure",
    actionKind: "QUARANTINE_IMPORT_SOURCE_FILE", scope: { importJobId: "dm-db-failure" }, typedPhrase: failingPreview.typedPhrase
  }));
  assert.equal(existsSync(failingPath), true, "A failed database phase restores the quarantined file.");
  assert.equal((await prisma.dataDeletionJob.findFirstOrThrow({ where: { clientRequestId: "dm-database-failure" } })).state, "FAILED_RESTORED");
  await prisma.$executeRawUnsafe(`DROP TRIGGER "dm_fail_import_update"`);

  await prisma.marketplaceListing.createMany({ data: [
    { id: "dm-listing-free", accountId, marketplace: "FLIPKART", sellerSkuId: "STAGE-FREE", sku: "STAGE-FREE" },
    { id: "dm-listing-linked", accountId, marketplace: "FLIPKART", sellerSkuId: "STAGE-LINKED", sku: "STAGE-LINKED" },
    { id: "dm-listing-other", accountId: otherAccountId, marketplace: "FLIPKART", sellerSkuId: "OTHER-KEEP", sku: "OTHER-KEEP" }
  ] });
  await prisma.productProcessRule.create({ data: { accountId, marketplaceListingId: "dm-listing-linked", route: "PICK_PACK" } });
  const linkedPreview = await previewDataAction(ownerId, "DELETE_UNREFERENCED_LISTING", { listingId: "dm-listing-linked" });
  assert.ok(linkedPreview.blockers.some(item => /Referenced/.test(item)));
  await authorizeAndExecute("ARCHIVE_LISTING", { listingId: "dm-listing-linked" }, "dm-archive-listing");
  assert.equal((await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: "dm-listing-linked" } })).listingStatus, "ARCHIVED");
  await prisma.order.create({ data: { id: "dm-listing-order", accountId, awb: "STAGE-LISTING-AWB", sku: "STAGE-FREE", orderNo: "STAGE-LISTING-ORDER" } });
  await prisma.workTask.create({ data: { id: "dm-listing-task", accountId, sourceType: "ORDER", orderId: "dm-listing-order", stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, status: "READY" } });
  const activeListingPreview = await previewDataAction(ownerId, "DELETE_UNREFERENCED_LISTING", { listingId: "dm-listing-free" });
  assert.ok(activeListingPreview.blockers.some(item => /active work/i.test(item)));
  await prisma.workTask.update({ where: { id: "dm-listing-task" }, data: { status: "COMPLETED", completedQuantity: 1, completedAt: new Date() } });
  await authorizeAndExecute("DELETE_UNREFERENCED_LISTING", { listingId: "dm-listing-free" }, "dm-delete-listing");
  assert.equal(await prisma.marketplaceListing.count({ where: { id: "dm-listing-free" } }), 0);

  await prisma.order.createMany({ data: [
    { id: "dm-order", accountId, awb: "STAGE-AWB-1", sku: "STAGE-SKU", orderNo: "STAGE-ORDER-1" },
    { id: "dm-order-other", accountId: otherAccountId, awb: "OTHER-AWB-1", sku: "OTHER-SKU", orderNo: "OTHER-ORDER-1" }
  ] });
  await prisma.workTask.create({ data: {
    id: "dm-task", accountId, sourceType: "ORDER", orderId: "dm-order", stage: "PICK", sequenceNumber: 1,
    requiredQuantity: 1, status: "READY"
  } });
  const blockedActiveWork = await previewDataAction(ownerId, "PURGE_QA_OPERATIONAL_DATA", { accountId });
  assert.ok(blockedActiveWork.blockers.some(item => /active work/i.test(item)));
  await prisma.workTask.update({ where: { id: "dm-task" }, data: { status: "COMPLETED", completedQuantity: 1, completedAt: new Date() } });
  await prisma.importJob.updateMany({ where: { accountId }, data: { filePath: null } });
  await prisma.consignmentImportFile.updateMany({ where: { consignmentBatch: { accountId } }, data: { managedRelativePath: null } });
  await authorizeAndExecute("PURGE_QA_OPERATIONAL_DATA", { accountId }, "dm-purge-qa");
  assert.equal(await prisma.order.count({ where: { accountId } }), 0);
  assert.equal(await prisma.workTask.count({ where: { accountId } }), 0);
  assert.equal(await prisma.workGroupProjection.count({ where: { accountId } }), 0);
  assert.equal(await prisma.workProjectionState.count({ where: { accountId } }), 0);
  assert.equal(await prisma.order.count({ where: { accountId: otherAccountId } }), 1, "Another account is untouched.");
  assert.equal(await prisma.marketplaceListing.count({ where: { accountId } }), 1, "QA purge preserves Product Inventory.");
  const liveLikePreview = await previewDataAction(ownerId, "PURGE_QA_OPERATIONAL_DATA", { accountId: otherAccountId });
  assert.ok(liveLikePreview.blockers.some(item => /QA-|STAGE-/.test(item)));
  const foreignKeys = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
  assert.deepEqual(foreignKeys, [], "QA purge leaves no foreign-key orphan.");

  const safeAuditText = (await prisma.auditLog.findMany()).map(row => `${row.metadata ?? ""}`).join("\n");
  assert.doesNotMatch(safeAuditText, /Synthetic-owner-password|data-management-fixtures|IMPORT_JOB_STORAGE_ROOT/i, "Audit metadata excludes passwords and private paths.");
  assert.equal(await prisma.dataDeletionJob.count({ where: { actorUserId: ownerId } }) >= 5, true, "Durable deletion history is retained.");
} finally {
  await prisma.$disconnect();
  dbFixture.cleanup();
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Owner-only Data Management authorization, quarantine, restore, archive, and QA-isolation tests passed.");
