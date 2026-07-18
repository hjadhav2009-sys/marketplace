import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type ProcessRoute } from "@prisma/client";

const tempRoot = resolve(process.cwd(), ".codex-tmp");
const databaseFile = resolve(tempRoot, "flipkart-consignment-assembly-import.db");
const storageRoot = resolve(tempRoot, "flipkart-consignment-assembly-storage");
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
  await db.account.create({ data: { id: "flipkart-route-account", name: "Synthetic Flipkart", code: "SFK", marketplace: "FLIPKART", active: true } });
  await db.user.create({ data: { id: "flipkart-route-owner", username: "synthetic-flipkart-route-owner", passwordHash: "synthetic", name: "Synthetic Owner", role: "OWNER", active: true } });
  await db.marketplaceListing.createMany({ data: [
    { id: "flipkart-assembly-listing", accountId: "flipkart-route-account", marketplace: "FLIPKART", sellerSkuId: "SKU-ASSEMBLY", sku: "SKU-ASSEMBLY", fsn: "FSN-ASSEMBLY", productTitle: "Synthetic Assembly Product" },
    { id: "flipkart-mark-assembly-listing", accountId: "flipkart-route-account", marketplace: "FLIPKART", sellerSkuId: "SKU-MARK-ASSEMBLY", sku: "SKU-MARK-ASSEMBLY", fsn: "FSN-MARK-ASSEMBLY", productTitle: "Synthetic Mark Assembly Product" }
  ] });
  await db.marketplaceListingIdentifier.createMany({ data: [
    { accountId: "flipkart-route-account", marketplaceListingId: "flipkart-assembly-listing", marketplace: "FLIPKART", identifierType: "SELLER_SKU", rawValue: "SKU-ASSEMBLY", normalizedValue: "SKU-ASSEMBLY" },
    { accountId: "flipkart-route-account", marketplaceListingId: "flipkart-assembly-listing", marketplace: "FLIPKART", identifierType: "FSN", rawValue: "FSN-ASSEMBLY", normalizedValue: "FSN-ASSEMBLY" },
    { accountId: "flipkart-route-account", marketplaceListingId: "flipkart-mark-assembly-listing", marketplace: "FLIPKART", identifierType: "SELLER_SKU", rawValue: "SKU-MARK-ASSEMBLY", normalizedValue: "SKU-MARK-ASSEMBLY" },
    { accountId: "flipkart-route-account", marketplaceListingId: "flipkart-mark-assembly-listing", marketplace: "FLIPKART", identifierType: "FSN", rawValue: "FSN-MARK-ASSEMBLY", normalizedValue: "FSN-MARK-ASSEMBLY" }
  ] });
  await db.markingAsset.create({ data: { id: "flipkart-route-asset", name: "Synthetic Marking", status: "ACTIVE", active: true, masterDesignId: "MD-SYNTHETIC", instructions: "Apply the synthetic marking." } });
  await db.markingAssetListingLink.create({ data: { id: "flipkart-route-link", markingAssetId: "flipkart-route-asset", marketplaceListingId: "flipkart-mark-assembly-listing", accountId: "flipkart-route-account", marketplace: "FLIPKART", matchMethod: "SYNTHETIC_TEST", active: true } });
  await db.productProcessRule.createMany({ data: [
    { id: "flipkart-assembly-rule", accountId: "flipkart-route-account", marketplaceListingId: "flipkart-assembly-listing", route: "PICK_ASSEMBLE_PACK", assemblyRequired: true, assemblyTitle: "Attach synthetic part", assemblyInstructions: "Attach the synthetic part securely.", active: true },
    { id: "flipkart-mark-assembly-rule", accountId: "flipkart-route-account", marketplaceListingId: "flipkart-mark-assembly-listing", route: "PICK_MARK_ASSEMBLE_PACK", markingRequired: true, markingAssetId: "flipkart-route-asset", assemblyRequired: true, assemblyTitle: "Assemble synthetic marked part", assemblyInstructions: "Attach the marked synthetic part securely.", active: true }
  ] });

  const csv = [
    "Product Name,FSN,SKU Id,Brand,Size,Style Code,Color,Isbn,Model Id,Quantity Sent,Quantity Received,Inwarded to Store,QC Fail,QC In Progress,QC Passed,Cost Price,Length(In cms),Breadth(In cms),Height(In cms),Weight(In kgs)",
    "Synthetic Assembly Product,FSN-ASSEMBLY,SKU-ASSEMBLY,Synthetic,M,,Blue,,MODEL-A,2,0,0,0,0,0,1,1,1,1,1",
    "Synthetic Mark Assembly Product,FSN-MARK-ASSEMBLY,SKU-MARK-ASSEMBLY,Synthetic,L,,Green,,MODEL-B,3,0,0,0,0,0,1,1,1,1,1"
  ].join("\n");
  const { importFlipkartConsignmentDraft } = await import("../src/lib/consignments/import-service");
  const { resolveConsignmentMissingListing } = await import("../src/lib/catalog/missing-listing-resolution");
  const { activateConsignmentBatch, completeWorkTask, validateConsignmentActivation } = await import("../src/lib/workflow/task-store");
  const { completePickWithNextRoute } = await import("../src/lib/workflow/route-selection");
  const { resolveConsignmentLineWorkflowPrerequisites } = await import("../src/lib/workflow/workflow-prerequisites");
  const { parseImmutableRouteProvenance } = await import("../src/lib/workflow/route-provenance");
  const imported = await importFlipkartConsignmentDraft({ accountId: "flipkart-route-account", user: { id: "flipkart-route-owner" }, externalConsignmentNumber: "SYNTHETIC-ROUTES", file: new File([csv], "synthetic-consignment.csv", { type: "text/csv" }) });
  const batch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: imported.batchId } });
  assert.equal(batch.status, "READY_TO_ACTIVATE", "Supported Assembly defaults do not create a blocking import issue");
  assert.equal(batch.totalRequiredQuantity, 5);
  assert.equal(batch.markingLines, 1, "Marking counter includes Pick-Mark-Assembly-Pack");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentBatchId: batch.id, issueType: "UNSUPPORTED_ROUTE" } }), 0);
  const lines = await db.consignmentLine.findMany({ where: { consignmentBatchId: batch.id }, orderBy: { requiredQuantity: "asc" } });
  assert.deepEqual(lines.map(line => [line.processRoute, line.requiredQuantity]), [["PICK_ASSEMBLE_PACK", 2], ["PICK_MARK_ASSEMBLE_PACK", 3]]);
  assert.equal((await activateConsignmentBatch({ batchId: batch.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner" }, db)).activated, true);
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: batch.id }, stage: { not: "PICK" } } }), 0, "Activation creates initial Pick work only");

  for (const line of lines) {
    const pick = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: line.id, stage: "PICK" } } });
    const route = line.processRoute === "PICK_ASSEMBLE_PACK" ? "ASSEMBLE" : "MARK_ASSEMBLE";
    await completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: pick.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner", expectedQuantity: 0, route, clientRequestId: `route-${line.id}` }, db);
    const routed = await db.workTask.findMany({ where: { consignmentLineId: line.id }, orderBy: { sequenceNumber: "asc" } });
    const expectedStages = line.processRoute === "PICK_ASSEMBLE_PACK" ? ["PICK", "ASSEMBLE", "PACK"] : ["PICK", "MARK", "ASSEMBLE", "PACK"];
    assert.deepEqual(routed.map(task => task.stage), expectedStages);
    assert.equal(routed.at(-1)?.status, "LOCKED");
    const provenance = parseImmutableRouteProvenance(routed[0].workCardSnapshotJson);
    assert.equal(provenance?.savedProcessRoute, line.processRoute as ProcessRoute);
    assert.ok(provenance?.assemblyInstructionSnapshot?.assemblyInstructions.includes("synthetic part"));
    if (line.processRoute === "PICK_MARK_ASSEMBLE_PACK") {
      assert.ok(provenance?.markingInstructionSnapshot, "Combined route preserves Marking instructions");
      let prerequisites = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "flipkart-route-account", consignmentLineId: line.id }, db);
      assert.equal(prerequisites.stages.MARK.state, "PENDING");
      assert.equal(prerequisites.stages.ASSEMBLE.state, "LOCKED");
      const mark = routed.find(task => task.stage === "MARK")!;
      await completeWorkTask({ taskId: mark.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner", expectedQuantity: 0, clientRequestId: `mark-${line.id}` }, db);
      prerequisites = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "flipkart-route-account", consignmentLineId: line.id }, db);
      assert.equal(prerequisites.stages.MARK.state, "SATISFIED");
      assert.equal(prerequisites.stages.ASSEMBLE.state, "PENDING");
    }
    const assembly = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: line.id, stage: "ASSEMBLE" } } });
    await completeWorkTask({ taskId: assembly.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner", expectedQuantity: 0, clientRequestId: `assembly-${line.id}` }, db);
    const ready = await resolveConsignmentLineWorkflowPrerequisites({ accountId: "flipkart-route-account", consignmentLineId: line.id }, db);
    assert.equal(ready.stages.ASSEMBLE.state, "SATISFIED");
    assert.equal(ready.stages.PACK.state, "PENDING");
    assert.equal(ready.packReady, true);
  }

  const missingCsv = [
    "Product Name,FSN,SKU Id,Brand,Size,Style Code,Color,Isbn,Model Id,Quantity Sent,Quantity Received,Inwarded to Store,QC Fail,QC In Progress,QC Passed,Cost Price,Length(In cms),Breadth(In cms),Height(In cms),Weight(In kgs)",
    "Synthetic Missing Product,FSN-MISSING,SKU-MISSING,Synthetic,M,,Black,,MODEL-MISSING,7,0,0,0,0,0,1,1,1,1,1"
  ].join("\n");
  const missingImport = await importFlipkartConsignmentDraft({ accountId: "flipkart-route-account", user: { id: "flipkart-route-owner" }, externalConsignmentNumber: "SYNTHETIC-MISSING", file: new File([missingCsv], "synthetic-missing-consignment.csv", { type: "text/csv" }) });
  const missingBatch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: missingImport.batchId } });
  const missingLine = await db.consignmentLine.findFirstOrThrow({ where: { consignmentBatchId: missingBatch.id } });
  assert.equal(missingBatch.status, "REVIEW_REQUIRED");
  assert.equal(missingBatch.totalRequiredQuantity, 7);
  assert.equal(missingLine.matchStatus, "NOT_FOUND");
  assert.equal(missingLine.requiredQuantity, 7, "Quantity Sent is preserved while the listing is held for owner review");
  assert.equal(missingLine.marketplaceListingId, null);
  assert.equal(await db.marketplaceListing.count({ where: { accountId: "flipkart-route-account", sellerSkuId: "SKU-MISSING" } }), 0, "Consignment import never auto-creates a catalog placeholder");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentBatchId: missingBatch.id, consignmentLineId: missingLine.id, issueType: "NOT_FOUND", severity: "ERROR", resolved: false } }), 1);
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: missingBatch.id } } }), 0);
  await db.consignmentBatch.update({ where: { id: missingBatch.id }, data: { status: "READY_TO_ACTIVATE" } });
  await assert.rejects(activateConsignmentBatch({ batchId: missingBatch.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner" }, db), /blocking import error|select one account listing/i, "Even a forged ready state cannot release missing-listing work");
  assert.equal(await db.workTask.count({ where: { consignmentLine: { consignmentBatchId: missingBatch.id } } }), 0);

  const resolution = await resolveConsignmentMissingListing({
    actorUserId: "flipkart-route-owner",
    accountId: "flipkart-route-account",
    batchId: missingBatch.id,
    lineId: missingLine.id,
    expectedLineUpdatedAt: missingLine.updatedAt.toISOString(),
    clientRequestId: "resolve-flipkart-missing-listing",
    action: "CREATE_MINIMAL"
  }, db);
  assert.equal(resolution.requiredQuantity, 7);
  const resolvedLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: missingLine.id } });
  assert.equal(resolvedLine.matchStatus, "OWNER_SELECTED");
  assert.ok(resolvedLine.marketplaceListingId, "Owner resolution attaches the newly created listing");
  assert.equal(resolvedLine.requiredQuantity, 7, "Owner resolution does not change Quantity Sent");
  assert.equal(await db.consignmentImportIssue.count({ where: { consignmentLineId: missingLine.id, issueType: "NOT_FOUND", resolved: false } }), 0);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: missingLine.id } }), 0, "Owner resolution does not create work before explicit activation");
  const resolvedValidation = await validateConsignmentActivation(missingBatch.id, "flipkart-route-account", db);
  assert.deepEqual(resolvedValidation.problems, [], "Owner resolution clears the blocking activation problem");
  const resolvedActivation = await activateConsignmentBatch({ batchId: missingBatch.id, accountId: "flipkart-route-account", actorUserId: "flipkart-route-owner" }, db);
  assert.equal(resolvedActivation.activated, true, "Resolved work still requires and accepts explicit activation");
  const resolvedPick = await db.workTask.findUniqueOrThrow({ where: { consignmentLineId_stage: { consignmentLineId: missingLine.id, stage: "PICK" } } });
  assert.equal(resolvedPick.requiredQuantity, 7, "Explicit activation creates Pick work with the original Quantity Sent");
  assert.equal(await db.workTask.count({ where: { consignmentLineId: missingLine.id } }), 1, "Explicit activation creates only the initial Pick task");
} finally {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  await db.$disconnect();
  rmSync(databaseFile, { force: true });
  rmSync(storageRoot, { recursive: true, force: true });
}
console.log("Flipkart Consignment Assembly import and activation tests passed.");
