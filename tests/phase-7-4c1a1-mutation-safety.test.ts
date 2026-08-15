import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type ProcessRoute, type WorkStage } from "@prisma/client";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "../src/lib/workflow/route-provenance";
import { completePickWithNextRoute } from "../src/lib/workflow/route-selection";
import { completeStageAndChooseNext } from "../src/lib/workflow/stage-transition";
import { incrementWorkTaskProgress, setWorkTaskProgress } from "../src/lib/workflow/task-store";

const tmp = resolve(process.cwd(), ".codex-tmp");
mkdirSync(tmp, { recursive: true });
const file = resolve(tmp, "phase-7-4c1a1-mutation-safety.db");
rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 });
const sqlite = new DatabaseSync(file);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve("prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) sqlite.exec(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${file.replace(/\\/g, "/")}` });

const fallback = (route: ProcessRoute) => createImmutableRouteProvenance({ route });
const explicit = (route: ProcessRoute) => createImmutableRouteProvenance({ route, rule: { id: `rule-${route}`, route } });
const snapshot = (route: ProcessRoute, currentStage: WorkStage, provenance = explicit(route)) => JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: route, currentStage }), ...provenance });

try {
  await db.account.createMany({ data: [
    { id: "account", name: "Synthetic", code: "SYN", marketplace: "FLIPKART" },
    { id: "other-account", name: "Other", code: "OTH", marketplace: "FLIPKART" },
  ] });
  await db.user.createMany({ data: [
    { id: "picker", username: "c1a1-picker", passwordHash: "fake", name: "Picker", role: "PICKER", active: true, accountId: "account", canPick: true },
    { id: "marker", username: "c1a1-marker", passwordHash: "fake", name: "Marker", role: "PICKER", active: true, accountId: "account", canMark: true },
    { id: "marker-two", username: "c1a1-marker-two", passwordHash: "fake", name: "Marker Two", role: "PICKER", active: true, accountId: "account", canMark: true },
    { id: "other-picker", username: "c1a1-other", passwordHash: "fake", name: "Other Picker", role: "PICKER", active: true, accountId: "other-account", canPick: true },
  ] });
  await db.marketplaceListing.create({ data: { id: "listing", accountId: "account", marketplace: "FLIPKART", sku: "SKU", sellerSkuId: "SKU", productTitle: "Synthetic route truth" } });
  await db.marketplaceListing.create({ data: { id: "other-listing", accountId: "other-account", marketplace: "FLIPKART", sku: "OTHER", sellerSkuId: "OTHER", productTitle: "Other account" } });
  await db.consignmentBatch.createMany({ data: [
    { id: "batch", accountId: "account", marketplace: "FLIPKART", externalConsignmentNumber: "C1A1", displayName: "C1A1", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "synthetic" },
    { id: "other-batch", accountId: "other-account", marketplace: "FLIPKART", externalConsignmentNumber: "OTHER", displayName: "Other", status: "ACTIVE", sourceFileName: "other.csv", sourceFileSha256: "other" },
  ] });

  const lineIds = ["partial", "increment", "override", "fallback", "mark", "mark-stale", "mark-protected"];
  await db.consignmentLine.createMany({ data: lineIds.map((id, index) => ({ id: `line-${id}`, consignmentBatchId: "batch", accountId: "account", rowNumber: index + 1, sellerSkuSource: "SKU", sellerSkuSnapshot: "SKU", requiredQuantity: 6, marketplaceListingId: "listing", matchStatus: "OWNER_SELECTED" as const, processRoute: id === "mark" ? "PICK_MARK_PACK" as const : "PICK_PACK" as const, activated: true })) });
  await db.consignmentLine.create({ data: { id: "other-line", consignmentBatchId: "other-batch", accountId: "other-account", rowNumber: 1, sellerSkuSource: "OTHER", sellerSkuSnapshot: "OTHER", requiredQuantity: 2, marketplaceListingId: "other-listing", matchStatus: "OWNER_SELECTED", processRoute: "PICK_PACK", activated: true } });

  await db.workTask.createMany({ data: [
    { id: "partial-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-partial", stage: "PICK", sequenceNumber: 1, requiredQuantity: 6, status: "READY", routeSnapshotJson: snapshot("PICK_PACK", "PICK") },
    { id: "partial-pack", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-partial", stage: "PACK", sequenceNumber: 2, requiredQuantity: 6, status: "LOCKED", routeSnapshotJson: snapshot("PICK_PACK", "PICK") },
    { id: "increment-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-increment", stage: "PICK", sequenceNumber: 1, requiredQuantity: 6, completedQuantity: 5, status: "IN_PROGRESS", assignedUserId: "picker", routeSnapshotJson: snapshot("PICK_PACK", "PICK") },
    { id: "override-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-override", stage: "PICK", sequenceNumber: 1, requiredQuantity: 6, status: "READY", workCardSnapshotJson: JSON.stringify(explicit("PICK_PACK")), routeSnapshotJson: snapshot("PICK_PACK", "PICK") },
    { id: "fallback-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-fallback", stage: "PICK", sequenceNumber: 1, requiredQuantity: 6, status: "READY", workCardSnapshotJson: JSON.stringify(fallback("PICK_PACK")), routeSnapshotJson: snapshot("PICK_PACK", "PICK", fallback("PICK_PACK")) },
    { id: "mark-task", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-mark", stage: "MARK", sequenceNumber: 2, requiredQuantity: 6, status: "READY", metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }), workCardSnapshotJson: JSON.stringify(explicit("PICK_MARK_PACK")), routeSnapshotJson: JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: "PICK" }), ...explicit("PICK_MARK_PACK"), actualStages: ["PICK", "MARK"], completedStages: ["PICK"], currentStage: "MARK", decisions: [{ fromStage: "PICK", toStage: "MARK", actorUserId: "picker", decidedAt: new Date(0).toISOString(), reason: "DEFAULT" }] }) },
    { id: "mark-stale", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-mark-stale", stage: "MARK", sequenceNumber: 2, requiredQuantity: 6, status: "READY", metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }), workCardSnapshotJson: JSON.stringify(explicit("PICK_MARK_PACK")), routeSnapshotJson: JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: "PICK" }), ...explicit("PICK_MARK_PACK"), actualStages: ["PICK", "MARK"], completedStages: ["PICK"], currentStage: "MARK" }) },
    { id: "mark-protected", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-mark-protected", stage: "MARK", sequenceNumber: 2, requiredQuantity: 6, status: "READY", assignedUserId: "marker-two", metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }), workCardSnapshotJson: JSON.stringify(explicit("PICK_MARK_PACK")), routeSnapshotJson: JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: "PICK" }), ...explicit("PICK_MARK_PACK"), actualStages: ["PICK", "MARK"], completedStages: ["PICK"], currentStage: "MARK" }) },
    { id: "other-pick", accountId: "other-account", sourceType: "CONSIGNMENT", consignmentLineId: "other-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, status: "READY" },
  ] });

  const partial = await setWorkTaskProgress({ taskId: "partial-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, targetQuantity: 1, clientRequestId: "partial-valid" }, db);
  assert.equal(partial.completedQuantity, 1);
  await assert.rejects(() => setWorkTaskProgress({ taskId: "partial-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 1, targetQuantity: 6, clientRequestId: "partial-full" }, db), /Use Complete Pick/);
  await assert.rejects(() => incrementWorkTaskProgress({ taskId: "increment-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 5, increment: 1, clientRequestId: "increment-full" }, db), /Use Complete Pick/);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "partial-pick" }, select: { status: true, completedQuantity: true } }), { status: "IN_PROGRESS", completedQuantity: 1 });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "partial-pack" } })).status, "LOCKED");

  await completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: "override-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "MARK", routeReason: "Marking required", confirmMissingInstructions: true, workerNote: "Synthetic explicit override", clientRequestId: "explicit-override" }, db);
  const explicitDecision = await db.workRouteDecision.findFirstOrThrow({ where: { taskId: "override-pick" } });
  assert.equal(explicitDecision.decisionType, "OVERRIDDEN_SAVED_ROUTE");
  assert.equal(explicitDecision.reason, "Marking required");

  await completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: "fallback-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "MARK", confirmMissingInstructions: true, workerNote: "Synthetic fallback selection", clientRequestId: "fallback-selection" }, db);
  const fallbackDecision = await db.workRouteDecision.findFirstOrThrow({ where: { taskId: "fallback-pick" } });
  assert.equal(fallbackDecision.decisionType, "SELECTED_FROM_SYSTEM_FALLBACK");
  assert.equal(fallbackDecision.reason, null);

  const markInput = { actorUserId: "marker", selectedAccountId: "account", taskId: "mark-task", currentStage: "MARK" as const, expectedVersion: 1, expectedCompletedQuantity: 0, nextStage: "ASSEMBLE" as const, routeReason: "Assembly required", workerNote: "Synthetic Mark forward choice", confirmMissingInstructions: true, clientRequestId: "mark-forward" };
  const marked = await completeStageAndChooseNext(markInput, db);
  assert.equal(marked.nextStage, "ASSEMBLE");
  const replay = await completeStageAndChooseNext(markInput, db);
  assert.equal(replay.idempotent, true);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-mark", stage: "ASSEMBLE" } }), 1);
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark-task", clientRequestId: "mark-forward" } }), 1);
  await assert.rejects(() => completeStageAndChooseNext({ ...markInput, taskId: "mark-stale", expectedVersion: 0, clientRequestId: "mark-stale" }, db), /changed.*refresh/i);
  await assert.rejects(() => completeStageAndChooseNext({ ...markInput, taskId: "mark-protected", clientRequestId: "mark-protected" }, db), /taken by another worker/i);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-override", stage: "MARK" } }), 1);
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-fallback", stage: "MARK" } }), 1);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "other-pick" }, select: { status: true, completedQuantity: true } }), { status: "READY", completedQuantity: 0 });
} finally {
  await db.$disconnect();
  try { rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows may release SQLite after process exit. */ }
}

console.log("Phase 7.4C1A.1 synthetic mutation safety tests passed.");
