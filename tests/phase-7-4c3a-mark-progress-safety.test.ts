import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type WorkStage } from "@prisma/client";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { resolveForwardStageEligibility } from "../src/lib/workflow/route-stage-eligibility";
import { createImmutableRouteProvenance } from "../src/lib/workflow/route-provenance";
import { completeStageAndChooseNext } from "../src/lib/workflow/stage-transition";
import {
  completeWorkTask,
  incrementWorkTaskProgress,
  setWorkTaskProgress,
} from "../src/lib/workflow/task-store";
import { selectableForwardStages } from "../src/lib/workflow/work-route-presentation";

const temporaryDirectory = resolve(process.cwd(), ".codex-tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const databaseFile = resolve(temporaryDirectory, "phase-7-4c3a-mark-progress-safety.db");
rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });

const sqlite = new DatabaseSync(databaseFile);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const migration of readdirSync(resolve("prisma/migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  sqlite.exec(readFileSync(join("prisma/migrations", migration, "migration.sql"), "utf8"));
}
sqlite.close();

const db = new PrismaClient({ datasourceUrl: `file:${databaseFile.replace(/\\/g, "/")}` });
const requiredQuantity = 6;
const accountId = "account";

const provenance = createImmutableRouteProvenance({
  route: "PICK_MARK_PACK",
  rule: {
    id: "rule",
    route: "PICK_MARK_PACK",
    markingRequired: true,
    markingAsset: {
      id: "asset",
      name: "Synthetic reviewed design",
      masterDesignId: "MD-C3A",
      markingPosition: "Front centre",
      markingWidthMm: 20,
      markingHeightMm: 10,
      powerSetting: 30,
      speedSetting: 500,
      frequencySetting: 25,
      passes: 1,
      instructions: "Use the immutable C3A marking settings.",
    },
    assemblyRequired: true,
    assemblyTitle: "Synthetic assembly",
    assemblyInstructions: "Attach the synthetic component securely.",
  },
});

function routeSnapshot(selectedStages: WorkStage[] = ["PICK", "MARK"]) {
  return JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: "MARK" }),
    ...provenance,
    currentStage: "MARK",
    actualStages: selectedStages,
    completedStages: ["PICK"],
    decisions: [],
  });
}

function cardSnapshot(label: string) {
  return JSON.stringify({ sellerSku: `SKU-${label}`, productTitle: `Synthetic ${label}`, ...provenance });
}

async function createLineWithMark(input: {
  id: string;
  rowNumber: number;
  account?: string;
  listing?: string;
  assignedUserId?: string;
  completedQuantity?: number;
  selectedStages?: WorkStage[];
  includePack?: boolean;
  downstreamStages?: WorkStage[];
}) {
  const targetAccount = input.account ?? accountId;
  const listingId = input.listing ?? "listing";
  await db.consignmentLine.create({
    data: {
      id: `line-${input.id}`,
      consignmentBatchId: targetAccount === accountId ? "batch" : "other-batch",
      accountId: targetAccount,
      rowNumber: input.rowNumber,
      sellerSkuSource: `SKU-${input.id}`,
      sellerSkuSnapshot: `SKU-${input.id}`,
      requiredQuantity,
      marketplaceListingId: listingId,
      matchStatus: "OWNER_SELECTED",
      processRoute: "PICK_MARK_PACK",
      activated: true,
    },
  });
  const completedQuantity = input.completedQuantity ?? 0;
  await db.workTask.create({
    data: {
      id: `mark-${input.id}`,
      accountId: targetAccount,
      sourceType: "CONSIGNMENT",
      consignmentLineId: `line-${input.id}`,
      stage: "MARK",
      sequenceNumber: 2,
      requiredQuantity,
      completedQuantity,
      status: completedQuantity > 0 ? "IN_PROGRESS" : "READY",
      assignedUserId: input.assignedUserId,
      metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }),
      workCardSnapshotJson: cardSnapshot(input.id),
      routeSnapshotJson: routeSnapshot(input.selectedStages),
    },
  });
  const downstreamStages = input.downstreamStages ?? (input.includePack === false ? [] : ["PACK"] as WorkStage[]);
  for (const [index, stage] of downstreamStages.entries()) {
    await db.workTask.create({
      data: {
        id: `${stage.toLowerCase()}-${input.id}`,
        accountId: targetAccount,
        sourceType: "CONSIGNMENT",
        consignmentLineId: `line-${input.id}`,
        stage,
        sequenceNumber: 3 + index,
        requiredQuantity,
        status: "LOCKED",
        workCardSnapshotJson: cardSnapshot(input.id),
        routeSnapshotJson: routeSnapshot(input.selectedStages),
      },
    });
  }
}

async function assertRejectedRequestDidNotMutate(id: string, requestId: string, expectedCompleted = 0) {
  assert.deepEqual(
    await db.workTask.findUniqueOrThrow({
      where: { id: `mark-${id}` },
      select: { status: true, completedQuantity: true, assignedUserId: true },
    }),
    {
      status: expectedCompleted > 0 ? "IN_PROGRESS" : "READY",
      completedQuantity: expectedCompleted,
      assignedUserId: null,
    },
  );
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: `pack-${id}` } })).status, "LOCKED");
  assert.equal(await db.workTask.count({ where: { consignmentLineId: `line-${id}`, stage: "ASSEMBLE" } }), 0);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: `mark-${id}` } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: `mark-${id}`, action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }), 0);
  assert.equal(await db.workActionLog.count({ where: { taskId: `mark-${id}`, clientRequestId: requestId } }), 0);
}

try {
  await db.account.createMany({ data: [
    { id: accountId, name: "Synthetic C3A", code: "C3A", marketplace: "FLIPKART" },
    { id: "other-account", name: "Other C3A", code: "C3A-OTHER", marketplace: "FLIPKART" },
  ] });
  await db.user.createMany({ data: [
    { id: "marker", username: "c3a-marker", passwordHash: "synthetic", name: "C3A Marker", role: "PICKER", active: true, accountId, canMark: true },
    { id: "marker-two", username: "c3a-marker-two", passwordHash: "synthetic", name: "Other Marker", role: "PICKER", active: true, accountId, canMark: true },
    { id: "viewer", username: "c3a-viewer", passwordHash: "synthetic", name: "C3A Viewer", role: "PICKER", active: true, accountId, canViewAllWork: true },
    { id: "worker", username: "c3a-worker", passwordHash: "synthetic", name: "No Mark Worker", role: "PICKER", active: true, accountId },
    { id: "owner", username: "c3a-owner", passwordHash: "synthetic", name: "C3A Owner", role: "OWNER", active: true },
    { id: "other-marker", username: "c3a-other-marker", passwordHash: "synthetic", name: "Other Account Marker", role: "PICKER", active: true, accountId: "other-account", canMark: true },
  ] });
  await db.marketplaceListing.createMany({ data: [
    { id: "listing", accountId, marketplace: "FLIPKART", sku: "SKU-C3A", sellerSkuId: "SKU-C3A", productTitle: "Synthetic Mark safety" },
    { id: "other-listing", accountId: "other-account", marketplace: "FLIPKART", sku: "SKU-OTHER", sellerSkuId: "SKU-OTHER", productTitle: "Other account work" },
  ] });
  await db.markingAsset.create({ data: { id: "asset", name: "Synthetic reviewed design", masterDesignId: "MD-C3A", markingPosition: "Front centre", markingWidthMm: 20, markingHeightMm: 10, powerSetting: 30, speedSetting: 500, frequencySetting: 25, passes: 1, instructions: "Use the immutable C3A marking settings.", status: "ACTIVE", active: true } });
  await db.productProcessRule.create({ data: { id: "rule", accountId, marketplaceListingId: "listing", route: "PICK_MARK_PACK", markingRequired: true, markingAssetId: "asset", assemblyRequired: true, assemblyTitle: "Synthetic assembly", assemblyInstructions: "Attach the synthetic component securely.", active: true } });
  await db.consignmentBatch.createMany({ data: [
    { id: "batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C3A", displayName: "Synthetic C3A", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c3a" },
    { id: "other-batch", accountId: "other-account", marketplace: "FLIPKART", externalConsignmentNumber: "C3A-OTHER", displayName: "Other C3A", status: "ACTIVE", sourceFileName: "other.csv", sourceFileSha256: "c3a-other" },
  ] });

  const fixtures: Array<Parameters<typeof createLineWithMark>[0]> = [
    { id: "set-full", rowNumber: 1 },
    { id: "increment-full", rowNumber: 2, completedQuantity: 5 },
    { id: "complete-bypass", rowNumber: 14 },
    { id: "partial-set", rowNumber: 3 },
    { id: "partial-increment", rowNumber: 4 },
    { id: "single", rowNumber: 5, selectedStages: ["PICK", "MARK", "ASSEMBLE"], downstreamStages: ["ASSEMBLE", "PACK"] },
    { id: "deterministic-pack", rowNumber: 15, selectedStages: ["PICK", "MARK", "PACK"] },
    { id: "mismatched-next", rowNumber: 16, selectedStages: ["PICK", "MARK", "ASSEMBLE"] },
    { id: "route-pack", rowNumber: 6 },
    { id: "route-assembly", rowNumber: 7 },
    { id: "stale", rowNumber: 8, completedQuantity: 1 },
    { id: "stale-version", rowNumber: 13 },
    { id: "assigned", rowNumber: 9, assignedUserId: "marker-two" },
    { id: "view-only", rowNumber: 10 },
    { id: "no-permission", rowNumber: 11 },
    { id: "owner", rowNumber: 12 },
  ];
  for (const fixture of fixtures) await createLineWithMark(fixture);
  await createLineWithMark({ id: "other-account", rowNumber: 1, account: "other-account", listing: "other-listing" });

  assert.deepEqual(selectableForwardStages("MARK", ["PICK", "MARK"], ["PICK"]), ["ASSEMBLE", "PACK"]);
  assert.deepEqual(resolveForwardStageEligibility({ currentStage: "MARK", selectedStages: ["PICK", "MARK", "ASSEMBLE"], completedStages: ["PICK"] }), { valid: true, selectableStages: ["PACK"], preselectedNextStage: "ASSEMBLE" });
  assert.deepEqual(resolveForwardStageEligibility({ currentStage: "MARK", selectedStages: ["PICK", "MARK", "PACK"], completedStages: ["PICK"] }), { valid: true, selectableStages: ["ASSEMBLE"], preselectedNextStage: "PACK" });
  await assert.rejects(
    () => setWorkTaskProgress({ taskId: "mark-set-full", accountId, actorUserId: "marker", expectedQuantity: 0, targetQuantity: 6, clientRequestId: "set-full" }, db),
    /Mark completion action/i,
  );
  await assertRejectedRequestDidNotMutate("set-full", "set-full");

  await assert.rejects(
    () => incrementWorkTaskProgress({ taskId: "mark-increment-full", accountId, actorUserId: "marker", expectedQuantity: 5, increment: 1, clientRequestId: "increment-full" }, db),
    /Mark completion action/i,
  );
  await assertRejectedRequestDidNotMutate("increment-full", "increment-full", 5);

  assert.deepEqual(selectableForwardStages("MARK", ["PICK", "MARK"], ["PICK"]), ["ASSEMBLE", "PACK"]);
  await assert.rejects(
    () => completeWorkTask({ taskId: "mark-complete-bypass", accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "complete-bypass" }, db),
    /Choose where Mark work goes next/i,
  );
  await assertRejectedRequestDidNotMutate("complete-bypass", "complete-bypass");

  const partialSet = await setWorkTaskProgress({ taskId: "mark-partial-set", accountId, actorUserId: "marker", expectedQuantity: 0, targetQuantity: 3, clientRequestId: "partial-set" }, db);
  assert.deepEqual(partialSet, { completedQuantity: 3, completed: false, idempotent: false });
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "mark-partial-set" }, select: { completedQuantity: true, status: true } }), { completedQuantity: 3, status: "IN_PROGRESS" });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-partial-set" } })).status, "LOCKED");
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-partial-set" } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: "mark-partial-set", action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }), 0);

  const partialIncrement = await incrementWorkTaskProgress({ taskId: "mark-partial-increment", accountId, actorUserId: "marker", expectedQuantity: 0, increment: 2, clientRequestId: "partial-increment" }, db);
  assert.deepEqual(partialIncrement, { completedQuantity: 2, completed: false, idempotent: false });
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "mark-partial-increment" }, select: { completedQuantity: true, status: true } }), { completedQuantity: 2, status: "IN_PROGRESS" });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-partial-increment" } })).status, "LOCKED");

  const single = await completeWorkTask({ taskId: "mark-single", accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "single-complete" }, db);
  assert.deepEqual(single, { completedQuantity: 6, completed: true, idempotent: false });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assemble-single" } })).status, "READY");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-single" } })).status, "LOCKED");

  const deterministicPackInput = { taskId: "mark-deterministic-pack", accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "deterministic-pack" };
  const deterministicPack = await completeWorkTask(deterministicPackInput, db);
  assert.deepEqual(deterministicPack, { completedQuantity: 6, completed: true, idempotent: false });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-deterministic-pack" } })).status, "READY");
  const deterministicPackReplay = await completeWorkTask(deterministicPackInput, db);
  assert.equal(deterministicPackReplay.idempotent, true);
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark-deterministic-pack", clientRequestId: "deterministic-pack", action: "TASK_COMPLETED" } }), 1);

  await assert.rejects(
    () => completeWorkTask({ taskId: "mark-mismatched-next", accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "mismatched-next" }, db),
    /route does not match the next task/i,
  );
  await assertRejectedRequestDidNotMutate("mismatched-next", "mismatched-next");

  const packInput = { actorUserId: "marker", selectedAccountId: accountId, taskId: "mark-route-pack", currentStage: "MARK" as const, expectedVersion: 1, expectedCompletedQuantity: 0, nextStage: "PACK" as const, clientRequestId: "route-pack" };
  const routedPack = await completeStageAndChooseNext(packInput, db);
  assert.equal(routedPack.nextStage, "PACK");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-route-pack" } })).status, "READY");
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-route-pack", stage: "ASSEMBLE" } }), 0);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-route-pack" } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: "mark-route-pack", action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }), 1);
  const packReplay = await completeStageAndChooseNext(packInput, db);
  assert.equal(packReplay.idempotent, true);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-route-pack" } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: "mark-route-pack", action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }), 1);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-route-pack", stage: "PACK" } }), 1);

  const routedAssembly = await completeStageAndChooseNext({ actorUserId: "marker", selectedAccountId: accountId, taskId: "mark-route-assembly", currentStage: "MARK", expectedVersion: 1, expectedCompletedQuantity: 0, nextStage: "ASSEMBLE", routeReason: "Assembly required", clientRequestId: "route-assembly" }, db);
  assert.equal(routedAssembly.nextStage, "ASSEMBLE");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-route-assembly", stage: "ASSEMBLE" } })).status, "READY");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-route-assembly" } })).status, "LOCKED");
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-route-assembly" } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: "mark-route-assembly", action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }), 1);

  await assert.rejects(() => setWorkTaskProgress({ taskId: "mark-stale", accountId, actorUserId: "marker", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "stale" }, db), /changed.*refresh/i);
  await assert.rejects(
    () => completeStageAndChooseNext({ actorUserId: "marker", selectedAccountId: accountId, taskId: "mark-stale-version", currentStage: "MARK", expectedVersion: 99, expectedCompletedQuantity: 0, nextStage: "PACK", clientRequestId: "stale-version" }, db),
    /changed.*refreshed/i,
  );
  await assertRejectedRequestDidNotMutate("stale-version", "stale-version");
  await assert.rejects(() => setWorkTaskProgress({ taskId: "mark-assigned", accountId, actorUserId: "marker", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "assigned" }, db), /taken by another worker/i);
  await assert.rejects(() => setWorkTaskProgress({ taskId: "mark-other-account", accountId, actorUserId: "marker", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "account-isolation" }, db), /not available|unavailable|permission/i);
  await assert.rejects(() => setWorkTaskProgress({ taskId: "mark-view-only", accountId, actorUserId: "viewer", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "view-only" }, db), /lacks permission|MARK permission/i);
  await assert.rejects(() => setWorkTaskProgress({ taskId: "mark-no-permission", accountId, actorUserId: "worker", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "no-permission" }, db), /lacks permission|MARK permission/i);
  const ownerPartial = await setWorkTaskProgress({ taskId: "mark-owner", accountId, actorUserId: "owner", expectedQuantity: 0, targetQuantity: 1, clientRequestId: "owner-partial" }, db);
  assert.equal(ownerPartial.completedQuantity, 1);

  await db.consignmentLine.create({ data: { id: "line-pick-pack", consignmentBatchId: "batch", accountId, rowNumber: 20, sellerSkuSource: "SKU-PICK", sellerSkuSnapshot: "SKU-PICK", requiredQuantity: 2, marketplaceListingId: "listing", matchStatus: "OWNER_SELECTED", processRoute: "PICK_PACK", activated: true } });
  await db.workTask.create({ data: { id: "pick-safety", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "line-pick-pack", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, status: "READY" } });
  await assert.rejects(() => setWorkTaskProgress({ taskId: "pick-safety", accountId, actorUserId: "owner", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "pick-full" }, db), /Complete Pick/i);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "pick-safety" }, select: { status: true, completedQuantity: true } }), { status: "READY", completedQuantity: 0 });

  await db.consignmentLine.create({ data: { id: "line-pack-safety", consignmentBatchId: "batch", accountId, rowNumber: 21, sellerSkuSource: "SKU-PACK", sellerSkuSnapshot: "SKU-PACK", requiredQuantity: 2, marketplaceListingId: "listing", matchStatus: "OWNER_SELECTED", processRoute: "PICK_PACK", activated: true } });
  await db.workTask.create({ data: { id: "pack-safety", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "line-pack-safety", stage: "PACK", sequenceNumber: 2, requiredQuantity: 2, status: "READY" } });
  await assert.rejects(() => setWorkTaskProgress({ taskId: "pack-safety", accountId, actorUserId: "owner", expectedQuantity: 0, targetQuantity: 1, clientRequestId: "pack-set" }, db), /authoritative Pack Completed/i);
} finally {
  await db.$disconnect();
  try {
    rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows may release the disposable SQLite file after process exit.
  }
}

console.log("Phase 7.4C3A Mark progress safety regression passed.");
