import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type ProcessRoute } from "@prisma/client";

const tempRoot = resolve(process.cwd(), ".codex-tmp");
const databaseFile = resolve(tempRoot, "amazon-consignment-assembly-import.db");
const storageRoot = resolve(tempRoot, "amazon-consignment-assembly-storage");
mkdirSync(tempRoot, { recursive: true });
rmSync(databaseFile, { force: true });
rmSync(storageRoot, { recursive: true, force: true });
const sqlite = new DatabaseSync(databaseFile);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve(process.cwd(), "prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) sqlite.exec(readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close();
process.env.DATABASE_URL = `file:${databaseFile.replace(/\\/g, "/")}`;
process.env.CONSIGNMENT_IMPORT_ROOT = storageRoot;
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

try {
  await db.account.create({ data: { id: "amazon-route-account", name: "Synthetic Amazon", code: "SAMZ", marketplace: "AMAZON", active: true } });
  await db.user.create({ data: { id: "amazon-route-owner", username: "synthetic-amazon-route-owner", passwordHash: "synthetic", name: "Synthetic Owner", role: "OWNER", active: true } });
  await db.marketplaceListing.createMany({ data: [
    { id: "amazon-assembly-listing", accountId: "amazon-route-account", marketplace: "AMAZON", sellerSkuId: "AMZ-ASSEMBLY", sku: "AMZ-ASSEMBLY", productTitle: "Synthetic Amazon Assembly" },
    { id: "amazon-mark-assembly-listing", accountId: "amazon-route-account", marketplace: "AMAZON", sellerSkuId: "AMZ-MARK-ASSEMBLY", sku: "AMZ-MARK-ASSEMBLY", productTitle: "Synthetic Amazon Mark Assembly" }
  ] });
  await db.marketplaceListingIdentifier.createMany({ data: [
    { accountId: "amazon-route-account", marketplaceListingId: "amazon-assembly-listing", marketplace: "AMAZON", identifierType: "SELLER_SKU", rawValue: "AMZ-ASSEMBLY", normalizedValue: "AMZ-ASSEMBLY" },
    { accountId: "amazon-route-account", marketplaceListingId: "amazon-assembly-listing", marketplace: "AMAZON", identifierType: "FNSKU", rawValue: "FNSKU-ASSEMBLY", normalizedValue: "FNSKU-ASSEMBLY" },
    { accountId: "amazon-route-account", marketplaceListingId: "amazon-mark-assembly-listing", marketplace: "AMAZON", identifierType: "SELLER_SKU", rawValue: "AMZ-MARK-ASSEMBLY", normalizedValue: "AMZ-MARK-ASSEMBLY" },
    { accountId: "amazon-route-account", marketplaceListingId: "amazon-mark-assembly-listing", marketplace: "AMAZON", identifierType: "FNSKU", rawValue: "FNSKU-MARK-ASSEMBLY", normalizedValue: "FNSKU-MARK-ASSEMBLY" }
  ] });
  await db.markingAsset.create({ data: { id: "amazon-route-asset", name: "Synthetic Amazon Marking", status: "ACTIVE", active: true, masterDesignId: "AMZ-MD-SYNTHETIC", instructions: "Apply the Amazon synthetic marking." } });
  await db.markingAssetListingLink.create({ data: { id: "amazon-route-link", markingAssetId: "amazon-route-asset", marketplaceListingId: "amazon-mark-assembly-listing", accountId: "amazon-route-account", marketplace: "AMAZON", matchMethod: "SYNTHETIC_TEST", active: true } });
  await db.productProcessRule.createMany({ data: [
    { id: "amazon-assembly-rule", accountId: "amazon-route-account", marketplaceListingId: "amazon-assembly-listing", route: "PICK_ASSEMBLE_PACK", assemblyRequired: true, assemblyTitle: "Amazon synthetic assembly", assemblyInstructions: "Attach the Amazon synthetic part securely.", active: true },
    { id: "amazon-mark-assembly-rule", accountId: "amazon-route-account", marketplaceListingId: "amazon-mark-assembly-listing", route: "PICK_MARK_ASSEMBLE_PACK", markingRequired: true, markingAssetId: "amazon-route-asset", assemblyRequired: true, assemblyTitle: "Amazon marked assembly", assemblyInstructions: "Attach the marked Amazon synthetic part securely.", active: true }
  ] });

  const shipment = new File([
    "Shipment ID,Shipment Name,Seller SKU,FNSKU,ASIN,Quantity,Destination\n" +
    "AMZ-ROUTE-SHIP,Synthetic Assembly,AMZ-ASSEMBLY,FNSKU-ASSEMBLY,B000ROUTE1,2,FC-SYNTHETIC\n" +
    "AMZ-ROUTE-SHIP,Synthetic Mark Assembly,AMZ-MARK-ASSEMBLY,FNSKU-MARK-ASSEMBLY,B000ROUTE2,4,FC-SYNTHETIC\n"
  ], "synthetic-amazon-shipment.csv", { type: "text/csv" });
  const { importAmazonConsignmentDraft } = await import("../src/lib/consignments/amazon/import-service");
  const { resolveConsignmentMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");
  const { activateConsignmentBatch, completeWorkTask, validateConsignmentActivation } = await import("../src/lib/workflow/task-store");
  const { completePickWithNextRoute } = await import("../src/lib/workflow/route-selection");
  const { resolveConsignmentLineWorkflowPrerequisites } = await import("../src/lib/workflow/workflow-prerequisites");
  const { parseImmutableRouteProvenance } = await import("../src/lib/workflow/route-provenance");
  const imported = await importAmazonConsignmentDraft({ accountId: "amazon-route-account", user: { id: "amazon-route-owner" }, externalConsignmentNumber: "AMZ-ROUTE-SHIP", files: [shipment] });
  const batch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: imported.batchId } });
  assert.equal(batch.status, "READY_TO_ACTIVATE", "Supported Amazon Assembly defaults do not create a blocking import issue");
  assert.equal(batch.totalRequiredQuantity, 6);
  assert.equal(batch.markingLines, 1, "Amazon Marking counter includes Pick-Mark-Assembly-Pack");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentBatchId: batch.id, issueType: "UNSUPPORTED_ROUTE" } }), 0);
  const lines = await db.consignmentLine.findMany({ where: { consignmentBatchId: batch.id }, orderBy: { requiredQuantity: "asc" } });
  assert.deepEqual(lines.map(line => [line.processRoute, line.requiredQuantity]), [["PICK_ASSEMBLE_PACK", 2], ["PICK_MARK_ASSEMBLE_PACK", 4]]);
  assert.equal((await activateConsignmentBatch({ batchId: batch.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner" }, db)).activated, true);
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: batch.id }, stage: { not: "PICK" } } }), 0, "Activation creates initial Amazon Pick work only");

  for (const line of lines) {
    const pick = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: line.id, stage: "PICK" } } });
    const route = line.processRoute === "PICK_ASSEMBLE_PACK" ? "ASSEMBLE" : "MARK_ASSEMBLE";
    await completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: pick.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner", expectedQuantity: 0, route, clientRequestId: `route-${line.id}` }, db);
    const routed = await db.workTask.findMany({ where: { consignmentLineId: line.id }, orderBy: { sequenceNumber: "asc" } });
    const expectedStages = line.processRoute === "PICK_ASSEMBLE_PACK" ? ["PICK", "ASSEMBLE", "PACK"] : ["PICK", "MARK", "ASSEMBLE", "PACK"];
    assert.deepEqual(routed.map(task => task.stage), expectedStages);
    const provenance = parseImmutableRouteProvenance(routed[0].routeSnapshotJson);
    assert.equal(provenance?.savedProcessRoute, line.processRoute as ProcessRoute);
    assert.ok(provenance?.assemblyInstructionSnapshot?.assemblyInstructions.includes("Amazon synthetic part"));
    if (line.processRoute === "PICK_MARK_ASSEMBLE_PACK") {
      assert.ok(provenance?.markingInstructionSnapshot, "Amazon combined route preserves Marking instructions");
      let prerequisites = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "amazon-route-account", consignmentLineId: line.id }, db);
      assert.equal(prerequisites.stages.MARK.state, "PENDING");
      assert.equal(prerequisites.stages.ASSEMBLE.state, "LOCKED");
      const mark = routed.find(task => task.stage === "MARK")!;
      await completeWorkTask({ taskId: mark.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner", expectedQuantity: 0, clientRequestId: `mark-${line.id}` }, db);
      prerequisites = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "amazon-route-account", consignmentLineId: line.id }, db);
      assert.equal(prerequisites.stages.ASSEMBLE.state, "PENDING");
    }
    const assembly = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: line.id, stage: "ASSEMBLE" } } });
    await completeWorkTask({ taskId: assembly.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner", expectedQuantity: 0, clientRequestId: `assembly-${line.id}` }, db);
    const ready = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "amazon-route-account", consignmentLineId: line.id }, db);
    assert.equal(ready.stages.ASSEMBLE.state, "SATISFIED");
    assert.equal(ready.stages.PACK.state, "PENDING");
    assert.equal(ready.packReady, true);
  }

  const missingShipment = new File([
    "Shipment ID,Shipment Name,Seller SKU,FNSKU,ASIN,Quantity,Destination\n" +
    "AMZ-MISSING-SHIP,Synthetic Missing,AMZ-MISSING,FNSKU-MISSING,B000MISSING,9,FC-SYNTHETIC\n"
  ], "synthetic-amazon-missing.csv", { type: "text/csv" });
  const missingImport = await importAmazonConsignmentDraft({ accountId: "amazon-route-account", user: { id: "amazon-route-owner" }, externalConsignmentNumber: "AMZ-MISSING-SHIP", files: [missingShipment] });
  const missingBatch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: missingImport.batchId } });
  const missingLine = await db.consignmentLine.findFirstOrThrow({ where: { consignmentBatchId: missingBatch.id } });
  assert.equal(missingBatch.status, "REVIEW_REQUIRED");
  assert.equal(missingBatch.totalRequiredQuantity, 9);
  assert.equal(missingLine.matchStatus, "NOT_FOUND");
  assert.equal(missingLine.requiredQuantity, 9, "Amazon Shipped quantity is preserved while the listing is held for owner review");
  assert.equal(missingLine.marketplaceListingId, null);
  assert.equal(await db.marketplaceListing.count({ where: { accountId: "amazon-route-account", sellerSkuId: "AMZ-MISSING" } }), 0, "Amazon Consignment import never auto-creates a catalog placeholder");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentBatchId: missingBatch.id, consignmentLineId: missingLine.id, issueType: "NOT_FOUND", severity: "ERROR", resolved: false } }), 1);
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: missingBatch.id } } }), 0);
  await db.consignmentBatch.update({ where: { id: missingBatch.id }, data: { status: "READY_TO_ACTIVATE" } });
  await assert.rejects(activateConsignmentBatch({ batchId: missingBatch.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner" }, db), /blocking import error|select one account listing/i, "Even a forged ready state cannot release missing Amazon listing work");
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: missingBatch.id } } }), 0);

  const resolution = await resolveConsignmentMissingListing({
    actorUserId: "amazon-route-owner",
    accountId: "amazon-route-account",
    batchId: missingBatch.id,
    lineId: missingLine.id,
    expectedLineUpdatedAt: missingLine.updatedAt.toISOString(),
    clientRequestId: "resolve-amazon-missing-listing",
    action: "CREATE_MINIMAL"
  }, db);
  assert.equal(resolution.requiredQuantity, 9);
  const resolvedLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: missingLine.id } });
  assert.equal(resolvedLine.matchStatus, "OWNER_SELECTED");
  assert.ok(resolvedLine.marketplaceListingId, "Owner resolution attaches the newly created Amazon listing");
  assert.equal(resolvedLine.requiredQuantity, 9, "Owner resolution does not change Amazon Shipped quantity");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentLineId: missingLine.id, issueType: "NOT_FOUND", resolved: false } }), 0);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: missingLine.id } }), 0, "Owner resolution does not create Amazon work before explicit activation");
  const resolvedValidation = await validateConsignmentActivation(missingBatch.id, "amazon-route-account", db);
  assert.deepEqual(resolvedValidation.problems, [], "Owner resolution clears the blocking Amazon activation problem");
  const resolvedActivation = await activateConsignmentBatch({ batchId: missingBatch.id, accountId: "amazon-route-account", actorUserId: "amazon-route-owner" }, db);
  assert.equal(resolvedActivation.activated, true, "Resolved Amazon work still requires and accepts explicit activation");
  const resolvedPick = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: missingLine.id, stage: "PICK" } } });
  assert.equal(resolvedPick.requiredQuantity, 9, "Explicit activation creates Pick work with the original Shipped quantity");
  assert.equal(await db.workTask.count({ where: { consignmentLineId: missingLine.id } }), 1, "Explicit activation creates only the initial Amazon Pick task");
} finally {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  await db.$disconnect();
  rmSync(databaseFile, { force: true });
  rmSync(storageRoot, { recursive: true, force: true });
}
console.log("Amazon Consignment Assembly import and activation tests passed.");
