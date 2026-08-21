import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { WorkStage, WorkTaskStatus } from "@prisma/client";
import { resolveOrderWorkflowProblem } from "../src/lib/workflow/order-problems";
import {
  reassignWorkTask,
  reportWorkTaskProblem,
  resolveConsignmentProblemRestoredStatus,
  resolveWorkTaskProblem,
} from "../src/lib/workflow/task-store";
import { createTempWorkflowDb } from "./temp-workflow-db";

assert.equal(resolveConsignmentProblemRestoredStatus("READY", 0), "READY");
assert.equal(resolveConsignmentProblemRestoredStatus("IN_PROGRESS", 0), "IN_PROGRESS");
assert.equal(resolveConsignmentProblemRestoredStatus("IN_PROGRESS", 2), "IN_PROGRESS");
assert.equal(resolveConsignmentProblemRestoredStatus(null, 0), "READY");
assert.equal(resolveConsignmentProblemRestoredStatus(null, 2), "IN_PROGRESS");
for (const unsupported of ["LOCKED", "PROBLEM", "COMPLETED", "SKIPPED", "CANCELLED", "UNKNOWN"]) {
  assert.equal(resolveConsignmentProblemRestoredStatus(unsupported, 0), "READY");
  assert.equal(resolveConsignmentProblemRestoredStatus(unsupported, 1), "IN_PROGRESS");
}

const { db, cleanup } = createTempWorkflowDb("phase-7-4c6a-problem-state-fidelity");
const accountId = "c6a-account";
const routeTruth = JSON.stringify({ version: 2, processRoute: "PICK_MARK_PACK", actualProcessRoute: "PICK_MARK_PACK", actualStages: ["PICK", "MARK", "PACK"], currentStage: "MARK" });

async function createLine(id: string, rowNumber: number, requiredQuantity = 3, processRoute = "PICK_MARK_PACK") {
  await db.consignmentLine.create({ data: { id, consignmentBatchId: "batch", accountId, rowNumber, requiredQuantity, matchStatus: "OWNER_SELECTED", activated: true, processRoute: processRoute as "PICK_MARK_PACK" } });
}

async function createProblemTask(input: { id: string; row: number; stage: WorkStage; prior: WorkTaskStatus | null; quantity: number; route?: string }) {
  await createLine(`${input.id}-line`, input.row, 3, input.route ?? "PICK_MARK_PACK");
  await db.workTask.create({ data: {
    id: input.id, accountId, sourceType: "CONSIGNMENT", consignmentLineId: `${input.id}-line`, stage: input.stage,
    sequenceNumber: input.stage === "PICK" ? 1 : input.stage === "MARK" ? 2 : input.stage === "ASSEMBLE" ? 3 : 4,
    requiredQuantity: 3, completedQuantity: input.quantity, status: "PROBLEM", statusBeforeProblem: input.prior,
    assignedUserId: "marker-a", problemReason: "MARKING_FAILED", problemReportedAt: new Date(), problemReportedByUserId: "marker-a", routeSnapshotJson: routeTruth,
  } });
}

async function resolveAndRead(taskId: string, requestId: string) {
  await resolveWorkTaskProblem({ taskId, accountId, actorUserId: "owner", resolutionNote: `Resolve ${taskId}.`, clientRequestId: requestId }, db);
  return db.workTask.findUniqueOrThrow({ where: { id: taskId } });
}

try {
  await db.account.createMany({ data: [
    { id: accountId, name: "C6A Seller", code: "C6A", companyName: "Synthetic", marketplace: "FLIPKART", active: true },
    { id: "other-account", name: "Other Seller", code: "OTHER", companyName: "Synthetic", marketplace: "FLIPKART", active: true },
  ] });
  await db.user.createMany({ data: [
    { id: "owner", username: "c6a-owner", passwordHash: "fake", name: "Owner", role: "OWNER", active: true, accountId },
    { id: "marker-a", username: "c6a-marker-a", passwordHash: "fake", name: "Marker A", role: "PICKER", active: true, accountId, canMark: true, canReportProblem: true },
    { id: "marker-b", username: "c6a-marker-b", passwordHash: "fake", name: "Marker B", role: "PICKER", active: true, accountId, canMark: true },
    { id: "marker-c", username: "c6a-marker-c", passwordHash: "fake", name: "Marker C", role: "PICKER", active: true, accountId, canMark: true },
    { id: "picker-only", username: "c6a-picker-only", passwordHash: "fake", name: "Picker Only", role: "PICKER", active: true, accountId, canPick: true },
    { id: "observer", username: "c6a-observer", passwordHash: "fake", name: "Observer", role: "PICKER", active: true, accountId, canViewAllWork: true },
    { id: "cross-account-marker", username: "c6a-cross-account", passwordHash: "fake", name: "Cross Account Marker", role: "PICKER", active: true, accountId: "other-account", canMark: true },
  ] });
  await db.consignmentBatch.create({ data: { id: "batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C6A", displayName: "C6A", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c6a" } });

  // A: persisted READY is restored exactly.
  await createProblemTask({ id: "ready-zero", row: 1, stage: "MARK", prior: "READY", quantity: 0 });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "ready-zero" } })).statusBeforeProblem, "READY");
  assert.equal((await resolveAndRead("ready-zero", "resolve-ready-zero")).status, "READY");

  // B, G and H: report records IN_PROGRESS at quantity zero; resolution preserves it without rewinding Pick or unlocking Pack.
  await createLine("main-line", 2);
  await db.workTask.createMany({ data: [
    { id: "pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "main-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 3, completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner", routeSnapshotJson: routeTruth },
    { id: "mark", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "main-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 3, completedQuantity: 0, status: "IN_PROGRESS", assignedUserId: "marker-a", startedAt: new Date(), startedByUserId: "marker-a", routeSnapshotJson: routeTruth },
    { id: "pack", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "main-line", stage: "PACK", sequenceNumber: 3, requiredQuantity: 3, completedQuantity: 0, status: "LOCKED", routeSnapshotJson: routeTruth },
  ] });
  await reportWorkTaskProblem({ taskId: "mark", accountId, actorUserId: "marker-a", reason: "MARKING_FAILED", expectedQuantity: 0, clientRequestId: "report-mark-problem" }, db);
  const reported = await db.workTask.findUniqueOrThrow({ where: { id: "mark" } });
  assert.deepEqual([reported.status, reported.statusBeforeProblem, reported.completedQuantity], ["PROBLEM", "IN_PROGRESS", 0]);

  const assignmentQuantity = reported.completedQuantity;
  const assignmentRouteTruth = reported.routeSnapshotJson;
  assert.equal((await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-b", clientRequestId: "reassign-1" }, db)).idempotent, false);
  assert.equal((await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-b", clientRequestId: "reassign-1" }, db)).idempotent, true);
  await assert.rejects(() => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-c", clientRequestId: "reassign-1" }, db), /request|payload|changed|different/i);
  assert.equal((await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-c", clientRequestId: "reassign-2" }, db)).idempotent, false);
  await assert.rejects(() => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "picker-only", clientRequestId: "reassign-incompatible" }, db), /permission/i);
  await assert.rejects(() => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "cross-account-marker", clientRequestId: "reassign-cross-account" }, db), /account access|selected account|assigned/i);
  await assert.rejects(() => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "observer", assignedUserId: "marker-a", clientRequestId: "reassign-unauthorized" }, db), /management permission/i);
  const reassigned = await db.workTask.findUniqueOrThrow({ where: { id: "mark" } });
  assert.deepEqual([reassigned.assignedUserId, reassigned.status, reassigned.completedQuantity, reassigned.routeSnapshotJson], ["marker-c", "PROBLEM", assignmentQuantity, assignmentRouteTruth]);
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark", action: "TASK_REASSIGNED" } }), 2);

  const resolvedMark = await resolveAndRead("mark", "resolve-mark-problem");
  assert.deepEqual([resolvedMark.status, resolvedMark.completedQuantity, resolvedMark.assignedUserId, resolvedMark.routeSnapshotJson], ["IN_PROGRESS", 0, "marker-c", routeTruth]);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pick" } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack" } })).status, "LOCKED");

  // C: partial IN_PROGRESS survives an actual report/resolve cycle.
  await createLine("partial-line", 3);
  await db.workTask.create({ data: { id: "partial", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "partial-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 3, completedQuantity: 2, status: "IN_PROGRESS", assignedUserId: "marker-a", routeSnapshotJson: routeTruth } });
  await reportWorkTaskProblem({ taskId: "partial", accountId, actorUserId: "marker-a", reason: "MARKING_FAILED", expectedQuantity: 2, clientRequestId: "report-partial" }, db);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "partial" } }).then((task) => [task.status, task.statusBeforeProblem, task.completedQuantity]), ["PROBLEM", "IN_PROGRESS", 2]);
  assert.deepEqual(await resolveAndRead("partial", "resolve-partial").then((task) => [task.status, task.completedQuantity]), ["IN_PROGRESS", 2]);

  // D and E: legacy null rows preserve the old quantity fallback.
  await createProblemTask({ id: "legacy-zero", row: 4, stage: "MARK", prior: null, quantity: 0 });
  assert.deepEqual(await resolveAndRead("legacy-zero", "resolve-legacy-zero").then((task) => [task.statusBeforeProblem, task.status]), [null, "READY"]);
  await createProblemTask({ id: "legacy-partial", row: 5, stage: "MARK", prior: null, quantity: 1 });
  assert.deepEqual(await resolveAndRead("legacy-partial", "resolve-legacy-partial").then((task) => [task.statusBeforeProblem, task.status]), [null, "IN_PROGRESS"]);

  // F: unsupported persisted prior state is never restored; quantity fallback wins.
  await createProblemTask({ id: "unsupported-prior", row: 6, stage: "MARK", prior: "COMPLETED", quantity: 1 });
  assert.deepEqual(await resolveAndRead("unsupported-prior", "resolve-unsupported").then((task) => [task.statusBeforeProblem, task.status]), ["COMPLETED", "IN_PROGRESS"]);

  // I: resolving Assembly preserves completed Pick/Mark and locked Pack.
  await createLine("assembly-line", 7, 2, "PICK_MARK_ASSEMBLE_PACK");
  await db.workTask.createMany({ data: [
    { id: "assembly-pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "assembly-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "assembly-mark", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "assembly-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "assembly-problem", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "assembly-line", stage: "ASSEMBLE", sequenceNumber: 3, requiredQuantity: 2, completedQuantity: 0, status: "PROBLEM", statusBeforeProblem: "READY", problemReason: "OTHER" },
    { id: "assembly-pack", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "assembly-line", stage: "PACK", sequenceNumber: 4, requiredQuantity: 2, status: "LOCKED" },
  ] });
  assert.equal((await resolveAndRead("assembly-problem", "resolve-assembly")).status, "READY");
  assert.deepEqual(await Promise.all(["assembly-pick", "assembly-mark", "assembly-pack"].map(async (id) => (await db.workTask.findUniqueOrThrow({ where: { id } })).status)), ["COMPLETED", "COMPLETED", "LOCKED"]);

  // J: resolving Pack preserves every completed upstream stage.
  await createLine("pack-line", 8, 2, "PICK_MARK_ASSEMBLE_PACK");
  await db.workTask.createMany({ data: [
    { id: "pack-pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "pack-mark", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "pack-assembly", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "ASSEMBLE", sequenceNumber: 3, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "pack-problem", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "PACK", sequenceNumber: 4, requiredQuantity: 2, completedQuantity: 0, status: "PROBLEM", statusBeforeProblem: "IN_PROGRESS", problemReason: "PACKING_BLOCKED" },
  ] });
  assert.equal((await resolveAndRead("pack-problem", "resolve-pack")).status, "IN_PROGRESS");
  assert.deepEqual(await Promise.all(["pack-pick", "pack-mark", "pack-assembly"].map(async (id) => (await db.workTask.findUniqueOrThrow({ where: { id } })).status)), ["COMPLETED", "COMPLETED", "COMPLETED"]);

  // K: Customer Order stage-aware restoration remains unchanged.
  await db.uploadBatch.create({ data: { id: "upload", accountId, fileName: "synthetic.csv" } });
  await db.order.create({ data: { id: "order", accountId, batchId: "upload", marketplace: "FLIPKART", awb: "C6A-AWB", sku: "C6A-SKU", qty: 2, orderNo: "C6A-ORDER", status: "PROBLEM", pickStatus: "PICKED", packStatus: "READY" } });
  await db.workTask.createMany({ data: [
    { id: "order-pick", accountId, sourceType: "ORDER", orderId: "order", stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "order-mark", accountId, sourceType: "ORDER", orderId: "order", stage: "MARK", sequenceNumber: 2, requiredQuantity: 2, completedQuantity: 2, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "order-assembly", accountId, sourceType: "ORDER", orderId: "order", stage: "ASSEMBLE", sequenceNumber: 3, requiredQuantity: 2, completedQuantity: 0, status: "PROBLEM", statusBeforeProblem: "READY", problemReason: "DAMAGED_PRODUCT", problemReportedAt: new Date(), problemReportedByUserId: "owner" },
    { id: "order-pack", accountId, sourceType: "ORDER", orderId: "order", stage: "PACK", sequenceNumber: 4, requiredQuantity: 2, status: "LOCKED" },
  ] });
  await db.problemOrder.create({ data: { id: "order-problem", accountId, orderId: "order", reason: "DAMAGED_PRODUCT", interruptedStage: "ASSEMBLE", workTaskId: "order-assembly", taskStatusBefore: "READY", orderStatusBefore: "READY", pickStatusBefore: "PICKED", packStatusBefore: "READY", clientRequestId: "order-report", reportedById: "owner" } });
  await resolveOrderWorkflowProblem({ actorUserId: "owner", accountId, problemId: "order-problem", resolutionNote: "Order issue cleared.", clientRequestId: "order-resolve" }, db);
  assert.deepEqual(await Promise.all(["order-pick", "order-mark", "order-assembly", "order-pack"].map(async (id) => (await db.workTask.findUniqueOrThrow({ where: { id } })).status)), ["COMPLETED", "COMPLETED", "READY", "LOCKED"]);

  const cardSource = readFileSync("components/ProblemWorkspaceCard.tsx", "utf8");
  const pageSource = readFileSync("app/work/problems/ProfessionalProblemsPage.tsx", "utf8");
  const scannerSource = readFileSync("components/ProfessionalUniversalScanner.tsx", "utf8");
  assert.doesNotMatch(cardSource, /useId/);
  assert.match(cardSource, /mutationRequestBase/);
  assert.match(pageSource, /randomUUID\(\)/);
  assert.match(scannerSource, /Marking Completed|Pack Completed|Scan next/);
} finally {
  await cleanup();
}

console.log("Phase 7.4C6A complete problem state fidelity matrix passed.");
