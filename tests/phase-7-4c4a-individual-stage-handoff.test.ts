import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProcessRoute, WorkStage } from "@prisma/client";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";
import { completeWorkTask, setWorkTaskProgress } from "../src/lib/workflow/task-store";

const reproduce = process.env.C4A_PREFLIGHT === "1";
const { db, cleanup } = createTempWorkflowDb("phase-7-4c4a-individual-stage-handoff");
const accountId = "c4a-account";

type HandoffCase = {
  id: string;
  route: ProcessRoute;
  currentStage: "MARK" | "ASSEMBLE";
  nextStage: "ASSEMBLE" | "PACK";
  assignedUserId?: string;
};

const routeStages: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"],
};

async function createHandoffCase(input: HandoffCase) {
  const lineId = `line-${input.id}`;
  const stages = routeStages[input.route];
  const currentIndex = stages.indexOf(input.currentStage);
  const snapshot = JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: input.route, currentStage: input.currentStage }),
    actualStages: stages,
    completedStages: stages.slice(0, currentIndex),
  });
  const card = JSON.stringify({ sellerSku: `C4A-${input.id}`, productTitle: `C4A ${input.id}` });

  await db.consignmentLine.create({
    data: {
      id: lineId,
      consignmentBatchId: "c4a-batch",
      accountId,
      rowNumber: await db.consignmentLine.count() + 1,
      sellerSkuSource: `C4A-${input.id}`,
      sellerSkuSnapshot: `C4A-${input.id}`,
      productTitleSnapshot: `C4A ${input.id}`,
      requiredQuantity: 6,
      matchStatus: "OWNER_SELECTED",
      processRoute: input.route,
      activated: true,
    },
  });

  await db.workTask.createMany({
    data: stages.map((stage, index) => {
      const completed = index < currentIndex;
      const actor = stage === "MARK" ? "marker" : "assembler";
      return {
      id: `${input.id}-${stage.toLowerCase()}`,
      accountId,
      sourceType: "CONSIGNMENT" as const,
      consignmentLineId: lineId,
      stage,
      sequenceNumber: index + 1,
      requiredQuantity: 6,
      completedQuantity: completed ? 6 : 0,
      status: completed ? "COMPLETED" as const : index === currentIndex ? "READY" as const : "LOCKED" as const,
      assignedUserId: index === currentIndex ? input.assignedUserId ?? (input.currentStage === "MARK" ? "marker" : "assembler") : undefined,
      startedAt: completed ? new Date(0) : undefined,
      startedByUserId: completed ? actor : undefined,
      completedAt: completed ? new Date(0) : undefined,
      completedByUserId: completed ? actor : undefined,
      workCardSnapshotJson: card,
      routeSnapshotJson: snapshot,
    }; }),
  });

  await rebuildWorkGroupProjection({ accountId, sourceType: "CONSIGNMENT", stage: input.currentStage }, db);
  await rebuildWorkGroupProjection({ accountId, sourceType: "CONSIGNMENT", stage: input.nextStage }, db);
  return { lineId, currentTaskId: `${input.id}-${input.currentStage.toLowerCase()}`, nextTaskId: `${input.id}-${input.nextStage.toLowerCase()}` };
}

async function projectionCount(stage: WorkStage, taskId: string) {
  return db.workGroupMember.count({ where: { taskId, projection: { accountId, sourceType: "CONSIGNMENT", stage } } });
}

try {
  await db.account.create({ data: { id: accountId, name: "C4A", code: "C4A", marketplace: "FLIPKART" } });
  await db.account.create({ data: { id: "other-account", name: "Other", code: "OTHER", marketplace: "FLIPKART" } });
  await db.user.createMany({ data: [
    { id: "assembler", username: "c4a-assembler", passwordHash: "synthetic", name: "Assembler", role: "PICKER", active: true, accountId, canAssemble: true },
    { id: "marker", username: "c4a-marker", passwordHash: "synthetic", name: "Marker", role: "PICKER", active: true, accountId, canMark: true },
    { id: "packer", username: "c4a-packer", passwordHash: "synthetic", name: "Packer", role: "PACKER", active: true, accountId, canPack: true },
    { id: "other-assembler", username: "c4a-other", passwordHash: "synthetic", name: "Other assembler", role: "PICKER", active: true, accountId, canAssemble: true },
  ] });
  await db.consignmentBatch.create({ data: { id: "c4a-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C4A", displayName: "C4A", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c4a" } });

  const assembly = await createHandoffCase({ id: "assembly-pack", route: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE", nextStage: "PACK" });
  assert.equal(await projectionCount("PACK", assembly.nextTaskId), 0, "Locked Pack is absent before handoff.");
  const assemblyInput = { taskId: assembly.currentTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a-assembly-complete" };
  await completeWorkTask(assemblyInput, db);

  if (reproduce) {
    const current = await db.workTask.findUniqueOrThrow({ where: { id: assembly.currentTaskId } });
    const next = await db.workTask.findUniqueOrThrow({ where: { id: assembly.nextTaskId } });
    const route = JSON.parse(current.routeSnapshotJson ?? "{}");
    assert.equal(current.status, "COMPLETED");
    assert.equal(next.status, "READY");
    assert.equal(route.currentStage, "PACK");
    assert.equal(await projectionCount("PACK", assembly.nextTaskId), 0);
    assert.equal(await db.workChangeEvent.count({ where: { accountId, eventType: "WORK_ROUTED", stage: "PACK" } }), 0);
    console.log("CONFIRMED_INDIVIDUAL_ASSEMBLY_PACK_HANDOFF_PROJECTION_GAP");

    const markPack = await createHandoffCase({ id: "preflight-mark-pack", route: "PICK_MARK_PACK", currentStage: "MARK", nextStage: "PACK" });
    await completeWorkTask({ taskId: markPack.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a-preflight-mark-pack" }, db);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: markPack.nextTaskId } })).status, "READY");
    assert.equal(await projectionCount("PACK", markPack.nextTaskId), 0);

    const markAssembly = await createHandoffCase({ id: "preflight-mark-assembly", route: "PICK_MARK_ASSEMBLE_PACK", currentStage: "MARK", nextStage: "ASSEMBLE" });
    await completeWorkTask({ taskId: markAssembly.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a-preflight-mark-assembly" }, db);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: markAssembly.nextTaskId } })).status, "READY");
    assert.equal(await projectionCount("ASSEMBLE", markAssembly.nextTaskId), 0);
    assert.equal(await db.workChangeEvent.count({ where: { accountId, eventType: "WORK_ROUTED" } }), 0);
    console.log("CONFIRMED_INDIVIDUAL_MARK_HANDOFF_PROJECTION_GAP");
  } else {
    const replay = await completeWorkTask(assemblyInput, db);
    const current = await db.workTask.findUniqueOrThrow({ where: { id: assembly.currentTaskId } });
    const next = await db.workTask.findUniqueOrThrow({ where: { id: assembly.nextTaskId } });
    const route = JSON.parse(current.routeSnapshotJson ?? "{}");
    assert.equal(replay.idempotent, true);
    assert.equal(current.status, "COMPLETED");
    assert.equal(next.status, "READY");
    assert.equal(route.currentStage, "PACK");
    assert.equal(await projectionCount("PACK", assembly.nextTaskId), 1);
    const packQueue = await getGroupedWork({ actorUserId: "packer", accountId, sourceType: "CONSIGNMENT", stage: "PACK", includeMemberIds: true }, db);
    assert.equal(packQueue.projectionUnavailable, undefined);
    assert.ok(packQueue.cards.some(card => card.memberTaskIds.includes(assembly.nextTaskId)), "Pack queue sees the routed task without a rebuild.");
    assert.equal(await db.workChangeEvent.count({ where: { accountId, eventType: "STAGE_COMPLETED", stage: "ASSEMBLE", entityId: assembly.currentTaskId } }), 1);
    assert.equal(await db.workChangeEvent.count({ where: { accountId, eventType: "WORK_ROUTED", stage: "PACK", entityId: assembly.currentTaskId } }), 1);
    assert.equal(await db.workActionLog.count({ where: { taskId: assembly.currentTaskId, action: "TASK_COMPLETED" } }), 1);

    const markPack = await createHandoffCase({ id: "mark-pack", route: "PICK_MARK_PACK", currentStage: "MARK", nextStage: "PACK" });
    await completeWorkTask({ taskId: markPack.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a-mark-pack" }, db);
    assert.equal(await projectionCount("PACK", markPack.nextTaskId), 1);
    assert.equal(await db.workChangeEvent.count({ where: { eventType: "WORK_ROUTED", stage: "PACK", entityId: markPack.currentTaskId } }), 1);

    const markAssembly = await createHandoffCase({ id: "mark-assembly", route: "PICK_MARK_ASSEMBLE_PACK", currentStage: "MARK", nextStage: "ASSEMBLE" });
    await completeWorkTask({ taskId: markAssembly.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a-mark-assembly" }, db);
    assert.equal(await projectionCount("ASSEMBLE", markAssembly.nextTaskId), 1);
    assert.equal(await db.workChangeEvent.count({ where: { eventType: "WORK_ROUTED", stage: "ASSEMBLE", entityId: markAssembly.currentTaskId } }), 1);

    const partial = await createHandoffCase({ id: "assembly-partial", route: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE", nextStage: "PACK" });
    await setWorkTaskProgress({ taskId: partial.currentTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, targetQuantity: 3, clientRequestId: "c4a-assembly-partial" }, db);
    assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: partial.nextTaskId }, select: { status: true } }), { status: "LOCKED" });
    assert.equal(await projectionCount("PACK", partial.nextTaskId), 0);
    assert.equal(await db.workChangeEvent.count({ where: { eventType: "WORK_ROUTED", entityId: partial.currentTaskId } }), 0);

    const wrong = await createHandoffCase({ id: "assembly-wrong", route: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE", nextStage: "PACK" });
    await db.workTask.update({ where: { id: wrong.nextTaskId }, data: { stage: "MARK" } });
    await assert.rejects(() => completeWorkTask({ taskId: wrong.currentTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a-wrong" }, db), /prepared Packing task/i);
    assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: wrong.currentTaskId }, select: { status: true, completedQuantity: true } }), { status: "READY", completedQuantity: 0 });
    assert.equal(await db.workChangeEvent.count({ where: { entityId: wrong.currentTaskId } }), 0);

    const assigned = await createHandoffCase({ id: "assembly-assigned", route: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE", nextStage: "PACK", assignedUserId: "other-assembler" });
    await assert.rejects(() => completeWorkTask({ taskId: assigned.currentTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a-assigned" }, db), /taken by another worker/i);
    await assert.rejects(() => completeWorkTask({ taskId: assigned.currentTaskId, accountId: "other-account", actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a-cross-account" }, db), /selected account|unavailable/i);

    assert.match(readFileSync("app/work/assemble/OrderAssemblyWorkCard.tsx", "utf8"), /skipped \? "Assembly skipped" : "Assembly completed"/);
    assert.match(readFileSync("app/work/LiveWorkRefresh.tsx", "utf8"), /detail\.eventType==="WORK_ROUTED"\)refreshPage\(\)/, "A routed event refreshes the open destination page so a newly projected group becomes visible.");

    console.log("Phase 7.4C4A individual deterministic handoff regressions passed.");
  }
} finally {
  await cleanup();
}
