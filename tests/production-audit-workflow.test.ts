import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { reportOrderWorkflowProblem, resolveOrderWorkflowProblem } from "../src/lib/workflow/order-problems";
import { completeWorkTask, incrementWorkTaskProgress, setWorkTaskProgress } from "../src/lib/workflow/task-store";

const { db, cleanup } = createTempWorkflowDb("production-audit-workflow");

try {
  await db.account.create({ data: { id: "account", name: "Synthetic", code: "SYN", marketplace: "FLIPKART" } });
  await db.user.createMany({ data: [
    { id: "owner", username: "audit-owner", passwordHash: "x", name: "Owner", role: "OWNER", active: true },
    { id: "worker", username: "audit-worker", passwordHash: "x", name: "Worker", role: "PICKER", active: true, accountId: "account", canPick: true, canMark: true, canAssemble: true, canPack: true, canReportProblem: true }
  ] });
  await db.uploadBatch.create({ data: { id: "batch", accountId: "account", fileName: "synthetic.csv" } });

  await db.consignmentBatch.create({ data: { id: "consignment", accountId: "account", marketplace: "FLIPKART", externalConsignmentNumber: "SYN-C", displayName: "Synthetic Consignment", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "synthetic" } });
  await db.consignmentLine.create({ data: { id: "pack-line", consignmentBatchId: "consignment", accountId: "account", rowNumber: 1, sellerSkuSource: "PACK-SKU", sellerSkuSnapshot: "PACK-SKU", requiredQuantity: 1, matchStatus: "OWNER_SELECTED", activated: true, processRoute: "PICK_PACK" } });
  await db.workTask.createMany({ data: [{ id: "pack-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, completedQuantity: 1, status: "COMPLETED", completedAt: new Date() },{ id: "pack-task", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "pack-line", stage: "PACK", sequenceNumber: 2, requiredQuantity: 1, status: "READY" }] });
  await assert.rejects(() => setWorkTaskProgress({ taskId: "pack-task", accountId: "account", actorUserId: "worker", expectedQuantity: 0, targetQuantity: 1, clientRequestId: "pack-set" }, db), /authoritative Pack Completed/i);
  await assert.rejects(() => incrementWorkTaskProgress({ taskId: "pack-task", accountId: "account", actorUserId: "worker", expectedQuantity: 0, increment: 1, clientRequestId: "pack-increment" }, db), /authoritative Pack Completed/i);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-task" } })).status, "READY");
  const consignmentPacks=await Promise.all(Array.from({length:20},()=>completeWorkTask({taskId:"pack-task",accountId:"account",actorUserId:"worker",expectedQuantity:0,clientRequestId:"direct-consignment-pack"},db)));assert.equal(consignmentPacks.filter(result=>!result.idempotent).length,1,"Twenty direct Consignment Pack retries mutate once");assert.equal((await db.consignmentLine.findUniqueOrThrow({where:{id:"pack-line"}})).completedAt instanceof Date,true);assert.equal(await db.workflowActionReceipt.count({where:{requestKind:"CONSIGNMENT_PACK",clientRequestId:"direct-consignment-pack",status:"COMPLETED"}}),1);

  for (const [index, stage] of (["PICK", "MARK", "ASSEMBLE", "PACK"] as const).entries()) {
    const orderId = `problem-order-${stage}`;
    const taskId = `problem-task-${stage}`;
    await db.order.create({ data: { id: orderId, accountId: "account", batchId: "batch", marketplace: "FLIPKART", awb: `AWB-${stage}`, sku: `SKU-${stage}`, qty: 1, orderNo: `ORDER-${stage}`, pickStatus: stage === "PICK" ? "READY" : "PICKED", packStatus: "READY" } });
    await db.workTask.create({ data: { id: taskId, accountId: "account", sourceType: "ORDER", orderId, stage, sequenceNumber: index + 1, requiredQuantity: 1, status: "READY" } });
    const result = await reportOrderWorkflowProblem({ actorUserId: "worker", accountId: "account", orderId, taskId, stage, reason: "SYNTHETIC_CHECK", note: "Synthetic stage-aware problem.", expectedTaskStatus: "READY", clientRequestId: `report-${stage}` }, db);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: taskId } })).status, "PROBLEM");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.pickStatus, stage === "PICK" ? "PROBLEM" : "PICKED", `${stage} problem must not rewind Pick`);
    assert.equal(order.packStatus, stage === "PACK" ? "PROBLEM" : "READY", `${stage} problem changes only its package stage`);
    await resolveOrderWorkflowProblem({ actorUserId: "owner", accountId: "account", problemId: result.problemId, resolutionNote: "Synthetic issue resolved.", clientRequestId: `resolve-${stage}` }, db);
    const restoredTask = await db.workTask.findUniqueOrThrow({ where: { id: taskId } });
    const restoredOrder = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(restoredTask.status, "READY");
    assert.equal(restoredOrder.pickStatus, stage === "PICK" ? "READY" : "PICKED");
    assert.equal(restoredOrder.packStatus, "READY");
  }
} finally {
  await cleanup();
}

console.log("Production-audit Pack bypass and stage-aware Order problem tests passed.");
