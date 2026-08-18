import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { resolveOrderPackActorEligibility } from "../src/lib/workflow/order-pack-actor-eligibility";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { resolveUniversalWork } from "../src/lib/workflow/universal-resolver";
import { packCustomerOrderShipmentSafely } from "../src/lib/workflow/order-pack-scope";
import { getProblemsWorkspace } from "../src/lib/workflow/problems-workspace";
import { resolveOrderWorkflowProblem } from "../src/lib/workflow/order-problems";
import { resolveWorkTaskProblem } from "../src/lib/workflow/task-store";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const { db, cleanup } = createTempWorkflowDb("phase-7-4c6-scanner-problems");
const accountId = "c6-account";
const snapshot = (actualStages: string[], completedStages: string[], currentStage: string) => JSON.stringify({
  ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: currentStage as "PICK" | "MARK" | "ASSEMBLE" | "PACK" }),
  actualStages,
  completedStages,
  currentStage,
  decisions: actualStages.length > 1 ? [{ fromStage: actualStages[0], toStage: actualStages[1], actorUserId: "owner", decidedAt: new Date(0).toISOString(), reason: "DEFAULT" }] : [],
});

try {
  assert.deepEqual(resolveOrderPackActorEligibility({ actorUserId: "owner", packTasks: [{ assignedUserId: "packer-a" }, { assignedUserId: "packer-a" }] }), {
    eligible: false, assignmentConflict: true, assignedUserIds: ["packer-a"], reason: "Packing work is assigned to another worker.",
  });
  assert.equal(resolveOrderPackActorEligibility({ actorUserId: "packer-a", packTasks: [{ assignedUserId: null }, { assignedUserId: "packer-a" }] }).eligible, true);

  await db.account.create({ data: { id: accountId, name: "C6 Seller", code: "C6", companyName: "Synthetic", marketplace: "FLIPKART", active: true } });
  await db.user.createMany({ data: [
    { id: "owner", username: "c6-owner", passwordHash: "fake", name: "Owner", role: "OWNER", active: true, accountId },
    { id: "packer-a", username: "c6-packer-a", passwordHash: "fake", name: "Packer A", role: "PACKER", active: true, accountId, canPack: true },
    { id: "marker", username: "c6-marker", passwordHash: "fake", name: "Marker", role: "PICKER", active: true, accountId, canMark: true },
  ] });
  await db.uploadBatch.create({ data: { id: "c6-upload", accountId, fileName: "synthetic.csv" } });

  for (const serial of [1, 2]) {
    const orderId = `pack-order-${serial}`;
    await db.order.create({ data: { id: orderId, accountId, batchId: "c6-upload", marketplace: "FLIPKART", awb: `C6-AWB-${serial}`, trackingId: "C6-PACKAGE", sku: `C6-SKU-${serial}`, qty: 1, orderNo: `C6-ORDER-${serial}`, pickStatus: "PICKED", packStatus: "READY" } });
    await db.workTask.createMany({ data: [
      { id: `${orderId}-pick`, accountId, sourceType: "ORDER", orderId, stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, completedQuantity: 1, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner", routeSnapshotJson: snapshot(["PICK", "PACK"], ["PICK"], "PACK") },
      { id: `${orderId}-pack`, accountId, sourceType: "ORDER", orderId, stage: "PACK", sequenceNumber: 2, requiredQuantity: 1, status: "READY", assignedUserId: "packer-a", routeSnapshotJson: snapshot(["PICK", "PACK"], ["PICK"], "PACK") },
    ] });
  }
  await rebuildWorkGroupProjection({ accountId, sourceType: "ORDER", stage: "PACK" }, db);
  const packCards = await getGroupedWork({ actorUserId: "owner", accountId, stage: "PACK", sourceType: "ORDER", includeMemberIds: true }, db);
  assert.ok(packCards.cards.some((card) => card.assignmentConflict), "Canonical Pack card applies actor-specific assignment truth.");
  const scannedPack = await resolveUniversalWork({ actorUserId: "owner", accountId, code: "C6-PACKAGE", intent: "PACK" }, db);
  const packageCandidate = scannedPack.candidates.find((candidate) => candidate.sourceType === "CUSTOMER_ORDER_SHIPMENT");
  assert.equal(packageCandidate?.canAct, false);
  assert.equal(packageCandidate?.readOnlyReason, "Packing work is assigned to another worker.");
  await assert.rejects(() => packCustomerOrderShipmentSafely({ actorUserId: "owner", accountId, orderId: "pack-order-1", source: "universal-scan", clientRequestId: "c6-pack-owner" }, db), /assignment conflict/i);

  await db.consignmentBatch.create({ data: { id: "mark-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C6-MARK", displayName: "C6 Mark", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c6-mark" } });
  await db.consignmentLine.create({ data: { id: "mark-line", consignmentBatchId: "mark-batch", accountId, rowNumber: 1, requiredQuantity: 2, matchStatus: "OWNER_SELECTED", activated: true, sellerSkuSnapshot: "C6-MARK-SKU", processRoute: "PICK_MARK_PACK" } });
  await db.workTask.createMany({ data: [
    { id: "mark-pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "mark-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner", routeSnapshotJson: snapshot(["PICK", "MARK"], ["PICK"], "MARK") },
    { id: "mark-unresolved", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "mark-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 2, status: "READY", assignedUserId: "marker", routeSnapshotJson: snapshot(["PICK", "MARK"], ["PICK"], "MARK") },
  ] });
  const scannedMark = await resolveUniversalWork({ actorUserId: "marker", accountId, code: "mark-unresolved", intent: "MARK" }, db);
  const markCandidate = scannedMark.candidates.find((candidate) => candidate.taskId === "mark-unresolved");
  assert.equal(markCandidate?.canAct, true);
  assert.equal(markCandidate?.stageRouteDecision?.preselectedNextStage, null);
  assert.deepEqual(markCandidate?.stageRouteDecision?.selectableNextStages.sort(), ["ASSEMBLE", "PACK"]);

  await db.order.create({ data: { id: "problem-order", accountId, batchId: "c6-upload", marketplace: "FLIPKART", awb: "C6-PROBLEM-AWB", trackingId: "C6-PROBLEM", sku: "C6-PROBLEM-SKU", qty: 2, orderNo: "C6-PROBLEM-ORDER", pickStatus: "PICKED", packStatus: "READY", status: "PROBLEM" } });
  await db.workTask.createMany({ data: [
    { id: "problem-order-pick", accountId, sourceType: "ORDER", orderId: "problem-order", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "problem-order-mark", accountId, sourceType: "ORDER", orderId: "problem-order", stage: "MARK", sequenceNumber: 2, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "problem-order-assembly", accountId, sourceType: "ORDER", orderId: "problem-order", stage: "ASSEMBLE", sequenceNumber: 3, requiredQuantity: 2, status: "PROBLEM", statusBeforeProblem: "READY", problemReason: "DAMAGED_PRODUCT", problemReportedByUserId: "owner", problemReportedAt: new Date() },
    { id: "problem-order-pack", accountId, sourceType: "ORDER", orderId: "problem-order", stage: "PACK", sequenceNumber: 4, requiredQuantity: 2, status: "LOCKED" },
  ] });
  await db.problemOrder.create({ data: { id: "order-problem", accountId, orderId: "problem-order", reason: "DAMAGED_PRODUCT", interruptedStage: "ASSEMBLE", workTaskId: "problem-order-assembly", taskStatusBefore: "READY", orderStatusBefore: "READY", pickStatusBefore: "PICKED", packStatusBefore: "READY", clientRequestId: "order-problem-report", reportedById: "owner" } });

  await db.consignmentBatch.create({ data: { id: "problem-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C6-CONSIGNMENT-PROBLEM", displayName: "C6 Problem", status: "PROBLEM", sourceFileName: "synthetic.csv", sourceFileSha256: "c6-problem" } });
  await db.consignmentLine.create({ data: { id: "problem-line", consignmentBatchId: "problem-batch", accountId, rowNumber: 1, requiredQuantity: 1, matchStatus: "OWNER_SELECTED", activated: true, sellerSkuSnapshot: "C6-CONSIGNMENT-SKU", processRoute: "PICK_MARK_PACK" } });
  await db.workTask.createMany({ data: [
    { id: "problem-line-pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "problem-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, completedQuantity: 1, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "problem-line-mark", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "problem-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 1, status: "PROBLEM", statusBeforeProblem: "READY", problemReason: "MARKING_FAILED", problemReportedByUserId: "owner", problemReportedAt: new Date() },
  ] });

  const orderWorkspace = await getProblemsWorkspace({ actorUserId: "owner", accountId, requestedSource: "ORDER", stage: "ASSEMBLE" }, db);
  assert.equal(orderWorkspace.counts.ORDER, 1); assert.equal(orderWorkspace.counts.CONSIGNMENT, 1); assert.equal(orderWorkspace.items[0]?.canResolve, true); assert.equal(orderWorkspace.items[0]?.stage, "ASSEMBLE");
  const consignmentWorkspace = await getProblemsWorkspace({ actorUserId: "owner", accountId, requestedSource: "CONSIGNMENT", stage: "MARK" }, db);
  assert.equal(consignmentWorkspace.items[0]?.canReassign, true); assert.ok(consignmentWorkspace.items[0]?.eligibleWorkers.some((worker) => worker.id === "marker"));

  await resolveOrderWorkflowProblem({ actorUserId: "owner", accountId, problemId: "order-problem", resolutionNote: "Synthetic issue cleared.", clientRequestId: "resolve-order-problem" }, db);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-order-pick" } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-order-mark" } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-order-assembly" } })).status, "READY");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-order-pack" } })).status, "LOCKED");
  await resolveWorkTaskProblem({ actorUserId: "owner", accountId, taskId: "problem-line-mark", resolutionNote: "Synthetic Mark issue cleared.", clientRequestId: "resolve-consignment-problem" }, db);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-line-pick" } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "problem-line-mark" } })).status, "READY");

  const scannerSource = readFileSync("components/ProfessionalUniversalScanner.tsx", "utf8");
  const resolverSource = readFileSync("src/lib/workflow/universal-resolver.ts", "utf8");
  const problemsSource = readFileSync("app/work/problems/ProfessionalProblemsPage.tsx", "utf8");
  assert.match(scannerSource, /Universal Scan|Pack workspace|Marking Completed|Assembly Completed|Pack Completed/);
  assert.doesNotMatch(scannerSource, /Complete stage|Customer Order Packing/);
  assert.match(scannerSource, /stage === "PICK" \? "Pick"/);
  assert.match(scannerSource, /Ready for routing/);
  assert.match(resolverSource, /resolveForwardStageEligibility|resolveOrderPackActorEligibility/);
  assert.match(problemsSource, /Customer Orders|Consignments|Interrupted stage/);
} finally {
  await cleanup();
}

console.log("Phase 7.4C6 Scanner and Problems tests passed.");
