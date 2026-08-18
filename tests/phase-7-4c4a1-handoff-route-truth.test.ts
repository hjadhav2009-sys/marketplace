import assert from "node:assert/strict";
import type { ProcessRoute, WorkStage } from "@prisma/client";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { completeWorkTask } from "../src/lib/workflow/task-store";
import { workChangeMatchesCard } from "../app/work/work-change-card-match";

const preflight = process.env.C4A1_PREFLIGHT === "1";
const { db, cleanup } = createTempWorkflowDb("phase-7-4c4a1-handoff-route-truth");
const accountId = "c4a1-account";
const stagesByRoute: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"],
};

type CaseInput = {
  id: string;
  route: "PICK_MARK_PACK" | "PICK_MARK_ASSEMBLE_PACK" | "PICK_ASSEMBLE_PACK";
  currentStage: "MARK" | "ASSEMBLE";
};

function initialSnapshot(input: CaseInput) {
  const stages = stagesByRoute[input.route];
  const currentIndex = stages.indexOf(input.currentStage);
  return JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: input.route, currentStage: input.currentStage }),
    actualStages: stages,
    completedStages: stages.slice(0, currentIndex),
    decisions: [{ fromStage: "PICK", toStage: input.currentStage, actorUserId: "picker", decidedAt: "2026-01-01T00:00:00.000Z", reason: "DEFAULT" }],
    routeSnapshotVersion: 3,
    routeRecommendation: input.route,
    routeRecommendationSource: "EXPLICIT_PRODUCT_RULE",
    hasExplicitSavedRoute: true,
    savedProcessRoute: input.route,
    savedProcessRuleId: `rule-${input.id}`,
    savedProcessRuleFingerprint: `fingerprint-${input.id}`,
  });
}

async function createCase(input: CaseInput) {
  const stages = stagesByRoute[input.route];
  const currentIndex = stages.indexOf(input.currentStage);
  const lineId = `line-${input.id}`;
  const snapshot = initialSnapshot(input);
  await db.consignmentLine.create({ data: {
    id: lineId,
    consignmentBatchId: "c4a1-batch",
    accountId,
    rowNumber: await db.consignmentLine.count() + 1,
    sellerSkuSource: `C4A1-${input.id}`,
    sellerSkuSnapshot: `C4A1-${input.id}`,
    productTitleSnapshot: `C4A1 ${input.id}`,
    requiredQuantity: 6,
    matchStatus: "OWNER_SELECTED",
    processRoute: input.route,
    activated: true,
  } });
  await db.workTask.createMany({ data: stages.map((stage, index) => ({
    id: `${input.id}-${stage.toLowerCase()}`,
    accountId,
    sourceType: "CONSIGNMENT" as const,
    consignmentLineId: lineId,
    stage,
    sequenceNumber: index + 1,
    requiredQuantity: 6,
    completedQuantity: index < currentIndex ? 6 : 0,
    status: index < currentIndex ? "COMPLETED" as const : index === currentIndex ? "READY" as const : "LOCKED" as const,
    assignedUserId: index === currentIndex ? input.currentStage === "MARK" ? "marker" : "assembler" : undefined,
    startedAt: index < currentIndex ? new Date(0) : undefined,
    startedByUserId: index < currentIndex ? "picker" : undefined,
    completedAt: index < currentIndex ? new Date(0) : undefined,
    completedByUserId: index < currentIndex ? "picker" : undefined,
    workCardSnapshotJson: JSON.stringify({ sellerSku: `C4A1-${input.id}`, productTitle: `C4A1 ${input.id}` }),
    routeSnapshotJson: snapshot,
  })) });
  return {
    lineId,
    currentTaskId: `${input.id}-${input.currentStage.toLowerCase()}`,
    nextTaskId: `${input.id}-${stages[currentIndex + 1]!.toLowerCase()}`,
  };
}

async function snapshots(lineId: string) {
  return db.workTask.findMany({ where: { consignmentLineId: lineId }, select: { id: true, routeSnapshotJson: true }, orderBy: { sequenceNumber: "asc" } });
}

function assertSnapshot(value: string | null, input: {
  actualStages: WorkStage[];
  completedStages: WorkStage[];
  currentStage: WorkStage;
  selectedNextStage: WorkStage;
  routeVersion: number;
  ruleId: string;
}) {
  const parsed = JSON.parse(value ?? "{}");
  assert.deepEqual(parsed.actualStages, input.actualStages);
  assert.deepEqual(parsed.completedStages, input.completedStages);
  assert.equal(parsed.currentStage, input.currentStage);
  assert.equal(parsed.selectedNextStage, input.selectedNextStage);
  assert.equal(parsed.routeVersion, input.routeVersion);
  assert.deepEqual(parsed.recommendedStages, input.actualStages);
  assert.deepEqual(parsed.decisions, [{ fromStage: "PICK", toStage: input.actualStages.includes("MARK") ? "MARK" : "ASSEMBLE", actorUserId: "picker", decidedAt: "2026-01-01T00:00:00.000Z", reason: "DEFAULT" }]);
  assert.equal(parsed.savedProcessRuleId, input.ruleId);
  assert.equal(parsed.savedProcessRuleFingerprint, `fingerprint-${input.ruleId.slice(5)}`);
}

try {
  await db.account.create({ data: { id: accountId, name: "C4A1", code: "C4A1", marketplace: "FLIPKART" } });
  await db.user.createMany({ data: [
    { id: "picker", username: "c4a1-picker", passwordHash: "synthetic", name: "Picker", role: "PICKER", active: true, accountId, canPick: true },
    { id: "marker", username: "c4a1-marker", passwordHash: "synthetic", name: "Marker", role: "PICKER", active: true, accountId, canMark: true },
    { id: "assembler", username: "c4a1-assembler", passwordHash: "synthetic", name: "Assembler", role: "PICKER", active: true, accountId, canAssemble: true },
  ] });
  await db.consignmentBatch.create({ data: { id: "c4a1-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C4A1", displayName: "C4A1", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c4a1" } });

  const markPack = await createCase({ id: "mark-pack", route: "PICK_MARK_PACK", currentStage: "MARK" });
  const markPackInput = { taskId: markPack.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a1-mark-pack" };
  await completeWorkTask(markPackInput, db);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: markPack.currentTaskId } })).status, "COMPLETED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: markPack.nextTaskId } })).status, "READY");

  if (preflight) {
    const stale = (await snapshots(markPack.lineId)).some(({ routeSnapshotJson }) => {
      const route = JSON.parse(routeSnapshotJson ?? "{}");
      return route.currentStage === "MARK" || !route.completedStages?.includes("MARK");
    });
    assert.equal(stale, true);
    console.log("CONFIRMED_INDIVIDUAL_MARK_ROUTE_SNAPSHOT_STALE");
  } else {
    const markPackSnapshots = await snapshots(markPack.lineId);
    for (const task of markPackSnapshots) assertSnapshot(task.routeSnapshotJson, { actualStages: ["PICK", "MARK", "PACK"], completedStages: ["PICK", "MARK"], currentStage: "PACK", selectedNextStage: "PACK", routeVersion: 2, ruleId: "rule-mark-pack" });
    const persistedBeforeReplay = markPackSnapshots.map((task) => task.routeSnapshotJson);
    const replay = await completeWorkTask(markPackInput, db);
    assert.equal(replay.idempotent, true);
    assert.deepEqual((await snapshots(markPack.lineId)).map((task) => task.routeSnapshotJson), persistedBeforeReplay, "Replay leaves every persisted route snapshot byte-for-byte unchanged.");
    assert.equal(await db.workActionLog.count({ where: { taskId: markPack.currentTaskId, action: "TASK_COMPLETED" } }), 1);
    assert.equal(await db.workChangeEvent.count({ where: { entityId: markPack.currentTaskId, eventType: "STAGE_COMPLETED" } }), 1);
    assert.equal(await db.workChangeEvent.count({ where: { entityId: markPack.currentTaskId, eventType: "WORK_ROUTED" } }), 1);

    const full = await createCase({ id: "mark-assembly-pack", route: "PICK_MARK_ASSEMBLE_PACK", currentStage: "MARK" });
    await completeWorkTask({ taskId: full.currentTaskId, accountId, actorUserId: "marker", expectedQuantity: 0, clientRequestId: "c4a1-mark-assembly" }, db);
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: full.nextTaskId } })).status, "READY");
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark-assembly-pack-pack" } })).status, "LOCKED");
    for (const task of await snapshots(full.lineId)) assertSnapshot(task.routeSnapshotJson, { actualStages: ["PICK", "MARK", "ASSEMBLE", "PACK"], completedStages: ["PICK", "MARK"], currentStage: "ASSEMBLE", selectedNextStage: "ASSEMBLE", routeVersion: 2, ruleId: "rule-mark-assembly-pack" });
    await completeWorkTask({ taskId: full.nextTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a1-assembly-pack" }, db);
    for (const task of await snapshots(full.lineId)) assertSnapshot(task.routeSnapshotJson, { actualStages: ["PICK", "MARK", "ASSEMBLE", "PACK"], completedStages: ["PICK", "MARK", "ASSEMBLE"], currentStage: "PACK", selectedNextStage: "PACK", routeVersion: 3, ruleId: "rule-mark-assembly-pack" });

    const assemblyPack = await createCase({ id: "assembly-pack", route: "PICK_ASSEMBLE_PACK", currentStage: "ASSEMBLE" });
    await completeWorkTask({ taskId: assemblyPack.currentTaskId, accountId, actorUserId: "assembler", expectedQuantity: 0, clientRequestId: "c4a1-direct-assembly-pack" }, db);
    for (const task of await snapshots(assemblyPack.lineId)) assertSnapshot(task.routeSnapshotJson, { actualStages: ["PICK", "ASSEMBLE", "PACK"], completedStages: ["PICK", "ASSEMBLE"], currentStage: "PACK", selectedNextStage: "PACK", routeVersion: 2, ruleId: "rule-assembly-pack" });

    assert.equal(await db.workRouteDecision.count(), 0, "Deterministic completion does not create route decisions.");
    const card = { groupKey: "group-a", memberTaskIds: ["task-a", "task-b"] };
    assert.equal(workChangeMatchesCard(card, { groupKey: "group-a", entityId: null }), true, "Grouped events retain their existing group-key match.");
    assert.equal(workChangeMatchesCard(card, { groupKey: null, entityId: "task-b" }), true, "An individual member-task event matches its mounted card.");
    assert.equal(workChangeMatchesCard(card, { groupKey: null, entityId: "task-other" }), false, "An unrelated individual task cannot mutate this card.");
    assert.equal(workChangeMatchesCard(card, { groupKey: "group-other", entityId: "task-b" }), false, "A different explicit group key cannot fall through to entity matching.");
    console.log("Phase 7.4C4A.1 deterministic route truth regressions passed.");
  }
} finally {
  await cleanup();
}
