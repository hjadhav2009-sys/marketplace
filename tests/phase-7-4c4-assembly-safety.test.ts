import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { completeGroupedStage } from "../src/lib/workflow/grouped-transition";
import { completeStageAndChooseNext } from "../src/lib/workflow/stage-transition";
import { incrementWorkTaskProgress, setWorkTaskProgress } from "../src/lib/workflow/task-store";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";
import { completeOrderAssemblyTask, setOrderAssemblyProgress } from "../src/lib/workflow/order-assembly";

const reproduce = process.env.C4_PREFLIGHT === "1";
const { db, cleanup } = createTempWorkflowDb("phase-7-4c4-assembly-safety");
const accountId = "c4-account";

async function createLine(id: string, rowNumber: number) {
  await db.consignmentLine.create({
    data: {
      id: `line-${id}`,
      consignmentBatchId: "c4-batch",
      accountId,
      rowNumber,
      sellerSkuSource: `C4-${id}`,
      sellerSkuSnapshot: `C4-${id}`,
      requiredQuantity: 6,
      matchStatus: "OWNER_SELECTED",
      processRoute: "PICK_ASSEMBLE_PACK",
      activated: true,
    },
  });
  const snapshot = JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE" }),
    actualStages: ["PICK", "ASSEMBLE", "PACK"],
    completedStages: ["PICK"],
  });
  await db.workTask.createMany({
    data: [
      {
        id: `assembly-${id}`,
        accountId,
        sourceType: "CONSIGNMENT",
        consignmentLineId: `line-${id}`,
        stage: "ASSEMBLE",
        sequenceNumber: 2,
        requiredQuantity: 6,
        status: "READY",
        metadataJson: JSON.stringify({ processRoute: "PICK_ASSEMBLE_PACK", assemblyTitle: "Assemble", assemblyInstructions: "Attach component" }),
        workCardSnapshotJson: JSON.stringify({ sellerSku: `C4-${id}`, productTitle: `C4 ${id}` }),
        routeSnapshotJson: snapshot,
      },
      {
        id: `pack-${id}`,
        accountId,
        sourceType: "CONSIGNMENT",
        consignmentLineId: `line-${id}`,
        stage: "PACK",
        sequenceNumber: 3,
        requiredQuantity: 6,
        status: "LOCKED",
        workCardSnapshotJson: JSON.stringify({ sellerSku: `C4-${id}`, productTitle: `C4 ${id}` }),
        routeSnapshotJson: snapshot,
      },
    ],
  });
}

async function createOrderAssembly(id: string, assignedUserId: string | null = "assembler") {
  const orderId = `order-${id}`;
  const snapshot = JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE" }),
    actualStages: ["PICK", "ASSEMBLE", "PACK"],
    completedStages: ["PICK"],
  });
  const card = JSON.stringify({ sellerSku: `C4-ORDER-${id}`, productTitle: `C4 Order ${id}` });
  await db.order.create({ data: { id: orderId, accountId, marketplace: "FLIPKART", awb: `C4-AWB-${id}`, orderNo: `C4-NO-${id}`, sku: `C4-ORDER-${id}`, qty: 6, productDescription: `C4 Order ${id}`, pickStatus: "PICKED", packStatus: "READY", status: "READY" } });
  await db.workTask.createMany({ data: [
    { id: `order-assembly-${id}`, accountId, sourceType: "ORDER", orderId, stage: "ASSEMBLE", sequenceNumber: 2, requiredQuantity: 6, status: "READY", assignedUserId, metadataJson: JSON.stringify({ version: 1, source: "PROCESS_RULE", routeChoice: "ASSEMBLE", processRoute: "PICK_ASSEMBLE_PACK", requestFingerprint: "c4", assemblyTitle: "Assemble", assemblyInstructions: "Attach component", sellerSkuSnapshot: `C4-ORDER-${id}`, requestedByUserId: "assembler", requestedAt: new Date(0).toISOString() }), workCardSnapshotJson: card, routeSnapshotJson: snapshot },
    { id: `order-pack-${id}`, accountId, sourceType: "ORDER", orderId, stage: "PACK", sequenceNumber: 3, requiredQuantity: 6, status: "LOCKED", workCardSnapshotJson: card, routeSnapshotJson: snapshot },
  ] });
}

try {
  await db.account.create({ data: { id: accountId, name: "C4 Assembly", code: "C4", marketplace: "FLIPKART" } });
  await db.user.create({ data: { id: "assembler", username: "c4-assembler", passwordHash: "synthetic", name: "C4 Assembler", role: "PICKER", active: true, accountId, canAssemble: true } });
  await db.user.create({ data: { id: "other-assembler", username: "c4-other-assembler", passwordHash: "synthetic", name: "Other C4 Assembler", role: "PICKER", active: true, accountId, canAssemble: true } });
  await db.consignmentBatch.create({ data: { id: "c4-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C4", displayName: "C4 Assembly", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c4" } });
  for (const [index, id] of ["individual", "grouped", "set", "increment", "complete", "mismatch"].entries()) await createLine(id, index + 1);

  const individualInput = {
    actorUserId: "assembler",
    selectedAccountId: accountId,
    taskId: "assembly-individual",
    currentStage: "ASSEMBLE" as const,
    expectedVersion: 1,
    expectedCompletedQuantity: 0,
    nextStage: "MARK" as const,
    routeReason: "Crafted unsupported transition",
    confirmMissingInstructions: true,
    clientRequestId: "c4-individual-assembly-mark",
  };
  if (reproduce) {
    await completeStageAndChooseNext(individualInput, db);
    assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-individual", stage: "MARK" } })).status, "READY");
    console.log("CONFIRMED_INDIVIDUAL_ASSEMBLY_TO_MARK_DEFECT");
  } else {
    await assert.rejects(() => completeStageAndChooseNext(individualInput, db), /stage transition is not allowed/i);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-individual" } })).status, "READY");
    assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-individual", stage: "MARK" } }), 0);
  }

  await rebuildWorkGroupProjection({ accountId, sourceType: "CONSIGNMENT", stage: "ASSEMBLE" }, db);
  const groupedCard = (await getGroupedWork({ actorUserId: "assembler", accountId, sourceType: "CONSIGNMENT", stage: "ASSEMBLE", includeMemberIds: true }, db)).cards.find(card => card.memberTaskIds.includes("assembly-grouped"))!;
  const groupedInput = {
    actorUserId: "assembler",
    selectedAccountId: accountId,
    sourceType: "CONSIGNMENT" as const,
    stage: "ASSEMBLE" as const,
    groupKey: groupedCard.groupKey,
    expectedGroupVersion: groupedCard.groupVersion,
    nextStage: "MARK" as const,
    routeReason: "Crafted unsupported transition",
    confirmMissingInstructions: true,
    clientRequestId: "c4-grouped-assembly-mark",
  };
  if (reproduce) {
    await completeGroupedStage(groupedInput, db);
    assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-grouped", stage: "MARK" } })).status, "READY");
    console.log("CONFIRMED_GROUPED_ASSEMBLY_TO_MARK_DEFECT");
  } else {
    await assert.rejects(() => completeGroupedStage(groupedInput, db), /stage transition is not allowed|next processing stage is already selected/i);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-grouped" } })).status, "READY");
    assert.equal(await db.workTask.count({ where: { consignmentLineId: "line-grouped", stage: "MARK" } }), 0);
    const groupedCompleteInput = { ...groupedInput, nextStage: undefined, routeReason: undefined, useRecommendedNextStage: true, clientRequestId: "c4-grouped-assembly-pack" };
    const groupedComplete = await completeGroupedStage(groupedCompleteInput, db);
    const groupedReplay = await completeGroupedStage(groupedCompleteInput, db);
    assert.equal(groupedComplete.nextStage, "PACK");
    assert.equal(groupedReplay.idempotent, true);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-grouped" } })).status, "COMPLETED");
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-grouped" } })).status, "READY");
    assert.equal(await db.workActionLog.count({ where: { taskId: "assembly-grouped", action: "TASK_COMPLETED" } }), 1);
    const groupedRoute = JSON.parse((await db.workTask.findUniqueOrThrow({ where: { id: "pack-grouped" } })).routeSnapshotJson!);
    assert.equal(groupedRoute.currentStage, "PACK");
    assert.deepEqual(groupedRoute.actualStages, ["PICK", "ASSEMBLE", "PACK"]);
    assert.deepEqual(groupedRoute.completedStages, ["PICK", "ASSEMBLE"]);
  }

  const setInput = { taskId: "assembly-set", accountId, actorUserId: "assembler", expectedQuantity: 0, targetQuantity: 6, action: "set" as const, requestKind: "SET_PROGRESS" as const, clientRequestId: "c4-set-full" };
  const incrementInput = { taskId: "assembly-increment", accountId, actorUserId: "assembler", expectedQuantity: 0, increment: 6, clientRequestId: "c4-increment-full" };
  if (reproduce) {
    await setWorkTaskProgress(setInput, db);
    await incrementWorkTaskProgress(incrementInput, db);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-set" } })).status, "READY");
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-increment" } })).status, "READY");
    console.log("CONFIRMED_ASSEMBLY_GENERIC_FULL_PROGRESS_BYPASS");
  } else {
    await assert.rejects(() => setWorkTaskProgress(setInput, db), /Use Assembly Completed/i);
    await assert.rejects(() => incrementWorkTaskProgress(incrementInput, db), /Use Assembly Completed/i);
    for (const id of ["set", "increment"]) {
      assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: `assembly-${id}` }, select: { status: true, completedQuantity: true } }), { status: "READY", completedQuantity: 0 });
      assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: `pack-${id}` } })).status, "LOCKED");
    }

    const completeInput = { taskId: "assembly-complete", accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4-assembly-complete" };
    const completed = await setWorkTaskProgress({ ...completeInput, action: "set", requestKind: "COMPLETE" }, db);
    const replay = await setWorkTaskProgress({ ...completeInput, action: "set", requestKind: "COMPLETE" }, db);
    assert.deepEqual(completed, { completedQuantity: 6, completed: true, idempotent: false });
    assert.equal(replay.idempotent, true);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-complete" } })).status, "READY");
    assert.equal(await db.workActionLog.count({ where: { taskId: "assembly-complete", action: "TASK_COMPLETED" } }), 1);

    await db.workTask.update({ where: { id: "pack-mismatch" }, data: { stage: "MARK" } });
    await assert.rejects(
      () => setWorkTaskProgress({ taskId: "assembly-mismatch", accountId, actorUserId: "assembler", expectedQuantity: 0, action: "set", requestKind: "COMPLETE", clientRequestId: "c4-assembly-mismatch" }, db),
      /does not match the prepared Packing task/i,
    );
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-mismatch" } })).status, "READY");

    await createOrderAssembly("normal");
    const partialInput = { taskId: "order-assembly-normal", accountId, actorUserId: "assembler", expectedStatus: "READY", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "c4-order-partial" };
    const partial = await setOrderAssemblyProgress(partialInput, db);
    const partialReplay = await setOrderAssemblyProgress(partialInput, db);
    assert.equal(partial.completedQuantity, 2);
    assert.equal(partialReplay.idempotent, true);
    assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "order-assembly-normal" }, select: { status: true, completedQuantity: true } }), { status: "IN_PROGRESS", completedQuantity: 2 });
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "order-pack-normal" } })).status, "LOCKED");
    assert.equal(await db.workActionLog.count({ where: { taskId: "order-assembly-normal", action: "TASK_PROGRESS_SET" } }), 1);
    await assert.rejects(() => setOrderAssemblyProgress({ ...partialInput, expectedStatus: "IN_PROGRESS", expectedQuantity: 2, targetQuantity: 6, clientRequestId: "c4-order-full-bypass" }, db), /leave at least one unit/i);
    await assert.rejects(() => setOrderAssemblyProgress({ ...partialInput, expectedQuantity: 2, targetQuantity: 3, clientRequestId: "c4-order-stale" }, db), /changed/i);

    const orderCompleteInput = { taskId: "order-assembly-normal", accountId, actorUserId: "assembler", expectedStatus: "IN_PROGRESS", clientRequestId: "c4-order-complete" };
    const orderComplete = await completeOrderAssemblyTask(orderCompleteInput, db);
    const orderCompleteReplay = await completeOrderAssemblyTask(orderCompleteInput, db);
    assert.equal(orderComplete.idempotent, false);
    assert.equal(orderCompleteReplay.idempotent, true);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "order-pack-normal" } })).status, "READY");
    assert.equal(await db.workTask.count({ where: { orderId: "order-normal", stage: "PACK" } }), 1);
    assert.equal(await db.workActionLog.count({ where: { taskId: "order-assembly-normal", action: "TASK_COMPLETED" } }), 1);
    const completedRoute = JSON.parse((await db.workTask.findUniqueOrThrow({ where: { id: "order-assembly-normal" } })).routeSnapshotJson!);
    assert.equal(completedRoute.currentStage, "PACK");
    assert.deepEqual(completedRoute.completedStages, ["PICK", "ASSEMBLE"]);

    await createOrderAssembly("assigned-other", "other-assembler");
    await assert.rejects(() => completeOrderAssemblyTask({ taskId: "order-assembly-assigned-other", accountId, actorUserId: "assembler", expectedStatus: "READY", clientRequestId: "c4-order-assignment-conflict" }, db), /taken by another worker/i);
    await db.account.create({ data: { id: "other-account", name: "Other", code: "OTHER", marketplace: "FLIPKART" } });
    await assert.rejects(() => completeOrderAssemblyTask({ taskId: "order-assembly-assigned-other", accountId: "other-account", actorUserId: "assembler", expectedStatus: "READY", clientRequestId: "c4-order-cross-account" }, db), /selected account|unavailable/i);
  }

  const quickAction = readFileSync("app/work/quick-route-actions.ts", "utf8");
  assert.match(quickAction, /stage !== "MARK"/);
  assert.match(quickAction, /Only individual Marking work supports this quick Process Flow action/);
  if (!reproduce) console.log("Phase 7.4C4 Assembly safety regressions passed.");
} finally {
  await cleanup();
}
