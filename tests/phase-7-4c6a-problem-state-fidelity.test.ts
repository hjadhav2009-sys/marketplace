import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTempWorkflowDb } from "./temp-workflow-db";
import {
  reassignWorkTask,
  reportWorkTaskProblem,
  resolveConsignmentProblemRestoredStatus,
  resolveWorkTaskProblem,
} from "../src/lib/workflow/task-store";

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
    { id: "cross-account-marker", username: "c6a-cross-account", passwordHash: "fake", name: "Cross Account Marker", role: "PICKER", active: true, accountId: "other-account", canMark: true },
  ] });
  await db.consignmentBatch.create({ data: { id: "batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C6A", displayName: "C6A", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c6a" } });
  await db.consignmentLine.create({ data: { id: "line", consignmentBatchId: "batch", accountId, rowNumber: 1, requiredQuantity: 3, matchStatus: "OWNER_SELECTED", activated: true, processRoute: "PICK_MARK_PACK" } });
  await db.workTask.createMany({ data: [
    { id: "pick", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 3, completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "owner" },
    { id: "mark", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "line", stage: "MARK", sequenceNumber: 2, requiredQuantity: 3, completedQuantity: 0, status: "IN_PROGRESS", assignedUserId: "marker-a", startedAt: new Date(), startedByUserId: "marker-a" },
    { id: "pack", accountId, sourceType: "CONSIGNMENT", consignmentLineId: "line", stage: "PACK", sequenceNumber: 3, requiredQuantity: 3, completedQuantity: 0, status: "LOCKED" },
  ] });

  await reportWorkTaskProblem({ taskId: "mark", accountId, actorUserId: "marker-a", reason: "MARKING_FAILED", expectedQuantity: 0, clientRequestId: "report-mark-problem" }, db);
  const reported = await db.workTask.findUniqueOrThrow({ where: { id: "mark" } });
  assert.equal(reported.status, "PROBLEM");
  assert.equal(reported.statusBeforeProblem, "IN_PROGRESS");
  assert.equal(reported.completedQuantity, 0);

  const first = await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-b", clientRequestId: "reassign-1" }, db);
  assert.equal(first.idempotent, false);
  const replay = await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-b", clientRequestId: "reassign-1" }, db);
  assert.equal(replay.idempotent, true);
  await assert.rejects(
    () => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-c", clientRequestId: "reassign-1" }, db),
    /request|payload|changed|different/i,
  );
  const second = await reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "marker-c", clientRequestId: "reassign-2" }, db);
  assert.equal(second.idempotent, false);
  await assert.rejects(
    () => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "picker-only", clientRequestId: "reassign-incompatible" }, db),
    /permission/i,
  );
  await assert.rejects(
    () => reassignWorkTask({ taskId: "mark", accountId, actorUserId: "owner", assignedUserId: "cross-account-marker", clientRequestId: "reassign-cross-account" }, db),
    /account access|selected account|assigned/i,
  );
  const reassigned = await db.workTask.findUniqueOrThrow({ where: { id: "mark" } });
  assert.equal(reassigned.assignedUserId, "marker-c");
  assert.equal(reassigned.status, "PROBLEM");
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark", action: "TASK_REASSIGNED" } }), 2);

  await resolveWorkTaskProblem({ taskId: "mark", accountId, actorUserId: "owner", resolutionNote: "Synthetic Mark issue cleared.", clientRequestId: "resolve-mark-problem" }, db);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark" } })).status, "IN_PROGRESS");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark" } })).completedQuantity, 0);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark" } })).assignedUserId, "marker-c");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pick" } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack" } })).status, "LOCKED");

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

console.log("Phase 7.4C6A problem state fidelity tests passed.");
