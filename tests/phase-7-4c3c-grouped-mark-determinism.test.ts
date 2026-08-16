import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot, parseWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { completeSelectedGroupMembers, setGroupedProgress } from "../src/lib/workflow/grouped-progress";
import { completeGroupedStage } from "../src/lib/workflow/grouped-transition";
import { resolveForwardStageEligibility } from "../src/lib/workflow/route-stage-eligibility";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const { db, cleanup } = createTempWorkflowDb("phase-7-4c3c-grouped-mark-determinism");
const accountId = "c3c-account";

function snapshot(selectedNextStage: "ASSEMBLE" | "PACK" | null) {
  return JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: "PICK_MARK_PACK", currentStage: "MARK" }),
    currentStage: "MARK",
    ...(selectedNextStage ? { selectedNextStage } : {}),
    actualStages: selectedNextStage ? ["PICK", "MARK", selectedNextStage] : ["PICK", "MARK"],
    completedStages: ["PICK"],
    decisions: [{ fromStage: "PICK", toStage: "MARK", actorUserId: "marker", decidedAt: "2026-08-16T00:00:00.000Z", reason: "WORKER_SELECTION" }],
  });
}

function workSnapshot(id: string) {
  return JSON.stringify({ sellerSku: "C3C-SKU", productTitle: `C3C grouped Mark ${id}`, hasExplicitSavedRoute: true, routeRecommendation: "PICK_MARK_PACK" });
}

async function createMarkFixture(input: { id: string; rowNumber: number; requiredQuantity: number; selectedNextStage?: "ASSEMBLE" | "PACK" | null }) {
  const selectedNextStage = input.selectedNextStage === undefined ? "ASSEMBLE" : input.selectedNextStage;
  const routeSnapshotJson = snapshot(selectedNextStage);
  const workCardSnapshotJson = workSnapshot(input.id);
  await db.consignmentLine.create({ data: {
    id: `line-${input.id}`, consignmentBatchId: "c3c-batch", accountId, rowNumber: input.rowNumber,
    sellerSkuSource: "C3C-SKU", sellerSkuSnapshot: "C3C-SKU", requiredQuantity: input.requiredQuantity,
    matchStatus: "OWNER_SELECTED", processRoute: "PICK_MARK_PACK", activated: true,
  } });
  await db.workTask.create({ data: {
    id: `mark-${input.id}`, accountId, sourceType: "CONSIGNMENT", consignmentLineId: `line-${input.id}`,
    stage: "MARK", sequenceNumber: 2, requiredQuantity: input.requiredQuantity, status: "READY",
    metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }), workCardSnapshotJson, routeSnapshotJson,
  } });
  if (selectedNextStage === "ASSEMBLE") {
    await db.workTask.createMany({ data: [
      { id: `assembly-${input.id}`, accountId, sourceType: "CONSIGNMENT", consignmentLineId: `line-${input.id}`, stage: "ASSEMBLE", sequenceNumber: 3, requiredQuantity: input.requiredQuantity, status: "LOCKED", metadataJson: JSON.stringify({ assemblyTitle: "Immutable assembly", assemblyInstructions: "Use the prepared component." }), workCardSnapshotJson, routeSnapshotJson },
      { id: `pack-${input.id}`, accountId, sourceType: "CONSIGNMENT", consignmentLineId: `line-${input.id}`, stage: "PACK", sequenceNumber: 4, requiredQuantity: input.requiredQuantity, status: "LOCKED", workCardSnapshotJson, routeSnapshotJson },
    ] });
  } else if (selectedNextStage === "PACK") {
    await db.workTask.create({ data: { id: `pack-${input.id}`, accountId, sourceType: "CONSIGNMENT", consignmentLineId: `line-${input.id}`, stage: "PACK", sequenceNumber: 3, requiredQuantity: input.requiredQuantity, status: "LOCKED", workCardSnapshotJson, routeSnapshotJson } });
  }
}

async function markCard(id: string) {
  const cards = (await getGroupedWork({ actorUserId: "marker", accountId, sourceType: "CONSIGNMENT", stage: "MARK", includeMemberIds: true }, db)).cards;
  return cards.find(card => card.memberTaskIds.includes(`mark-${id}`))!;
}

async function assertPreselectedAssembly(id: string) {
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: `assembly-${id}` } })).status, "READY");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: `pack-${id}` } })).status, "LOCKED");
  const mark = await db.workTask.findUniqueOrThrow({ where: { id: `mark-${id}` } });
  const route = parseWorkRouteSnapshot(mark.routeSnapshotJson)!;
  assert.equal(mark.status, "COMPLETED");
  assert.deepEqual(route.actualStages, ["PICK", "MARK", "ASSEMBLE"]);
  assert.deepEqual(route.completedStages, ["PICK", "MARK"]);
  assert.equal(route.currentStage, "ASSEMBLE");
  assert.equal(route.decisions.length, 1, "Mark completion does not create a second route choice.");
  assert.equal(await db.workRouteDecision.count({ where: { taskId: mark.id } }), 0);
}

try {
  await db.account.create({ data: { id: accountId, name: "C3C synthetic account", code: "C3C", marketplace: "FLIPKART" } });
  await db.user.createMany({ data: [
    { id: "marker", username: "c3c-marker", passwordHash: "synthetic", name: "C3C Marker", role: "PICKER", active: true, accountId, canMark: true },
    { id: "viewer", username: "c3c-viewer", passwordHash: "synthetic", name: "C3C Viewer", role: "PICKER", active: true, accountId, canViewAllWork: true },
  ] });
  await db.consignmentBatch.create({ data: { id: "c3c-batch", accountId, marketplace: "FLIPKART", externalConsignmentNumber: "C3C", displayName: "C3C grouped Mark", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c3c" } });

  const fixtures: Array<Parameters<typeof createMarkFixture>[0]> = [
    { id: "full", rowNumber: 1, requiredQuantity: 8 },
    { id: "exact", rowNumber: 2, requiredQuantity: 7 },
    { id: "partial", rowNumber: 3, requiredQuantity: 6 },
    { id: "preselected-pack", rowNumber: 4, requiredQuantity: 5, selectedNextStage: "PACK" },
    { id: "reroute-assembly", rowNumber: 5, requiredQuantity: 4 },
    { id: "reroute-pack", rowNumber: 6, requiredQuantity: 4, selectedNextStage: "PACK" },
    { id: "unresolved-pack", rowNumber: 7, requiredQuantity: 3, selectedNextStage: null },
    { id: "unresolved-assembly", rowNumber: 8, requiredQuantity: 3, selectedNextStage: null },
    { id: "legacy-a", rowNumber: 9, requiredQuantity: 8 },
    { id: "legacy-b", rowNumber: 10, requiredQuantity: 7 },
    { id: "no-permission", rowNumber: 11, requiredQuantity: 2 },
    { id: "unsafe-downstream", rowNumber: 12, requiredQuantity: 2 },
    { id: "stale", rowNumber: 13, requiredQuantity: 2 },
  ];
  for (const fixture of fixtures) await createMarkFixture(fixture);
  await rebuildWorkGroupProjection({ accountId, sourceType: "CONSIGNMENT", stage: "MARK" }, db);

  const initial = await getGroupedWork({ actorUserId: "marker", accountId, sourceType: "CONSIGNMENT", stage: "MARK", includeMemberIds: true }, db);
  assert.equal(initial.cards.length, fixtures.length, "Current non-Pack projections create one exact source card per Mark task.");
  assert.ok(initial.cards.every(card => card.memberCount === 1 && card.memberTaskIds.length === 1));
  assert.deepEqual(resolveForwardStageEligibility({ currentStage: "MARK", selectedStages: ["PICK", "MARK", "ASSEMBLE"], completedStages: ["PICK"] }), { valid: true, selectableStages: ["PACK"], preselectedNextStage: "ASSEMBLE" });

  const fullCard = await markCard("full");
  const assemblyMetadata = (await db.workTask.findUniqueOrThrow({ where: { id: "assembly-full" } })).metadataJson;
  const fullInput = { actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT" as const, stage: "MARK" as const, groupKey: fullCard.groupKey, expectedGroupVersion: fullCard.groupVersion, useRecommendedNextStage: true, clientRequestId: "c3c-full" };
  const fullResult = await completeGroupedStage(fullInput, db);
  assert.equal(fullResult.nextStage, "ASSEMBLE");
  await assertPreselectedAssembly("full");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-full" } })).metadataJson, assemblyMetadata, "Prepared downstream metadata remains immutable.");
  const fullReplay = await completeGroupedStage(fullInput, db);
  assert.equal(fullReplay.idempotent, true);
  assert.equal(fullReplay.nextStage, "ASSEMBLE", "Replay returns the persisted actual destination, not the old recommendation.");
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark-full", clientRequestId: "c3c-full" } }), 1);

  const packCard = await markCard("preselected-pack");
  const packResult = await completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: packCard.groupKey, expectedGroupVersion: packCard.groupVersion, useRecommendedNextStage: true, clientRequestId: "c3c-pack" }, db);
  assert.equal(packResult.nextStage, "PACK");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-preselected-pack" } })).status, "READY");
  assert.deepEqual(parseWorkRouteSnapshot((await db.workTask.findUniqueOrThrow({ where: { id: "mark-preselected-pack" } })).routeSnapshotJson)?.actualStages, ["PICK", "MARK", "PACK"]);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-preselected-pack" } }), 0);

  for (const [id, requested] of [["reroute-assembly", "PACK"], ["reroute-pack", "ASSEMBLE"]] as const) {
    const card = await markCard(id);
    const before = await db.workTask.findMany({ where: { consignmentLineId: `line-${id}` }, orderBy: { sequenceNumber: "asc" } });
    await assert.rejects(() => completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: card.groupKey, expectedGroupVersion: card.groupVersion, nextStage: requested, useRecommendedNextStage: false, clientRequestId: `c3c-${id}` }, db), /next processing stage is already selected/i);
    assert.deepEqual(await db.workTask.findMany({ where: { consignmentLineId: `line-${id}` }, orderBy: { sequenceNumber: "asc" } }), before);
    assert.equal(await db.workRouteDecision.count({ where: { taskId: `mark-${id}` } }), 0);
    assert.equal(await db.workActionLog.count({ where: { taskId: `mark-${id}` } }), 0);
  }

  const unsafeCard = await markCard("unsafe-downstream");
  await db.workTask.update({ where: { id: "assembly-unsafe-downstream" }, data: { status: "PROBLEM", problemReason: "OTHER", problemReportedAt: new Date(), problemReportedByUserId: "marker", statusBeforeProblem: "LOCKED" } });
  await assert.rejects(() => completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: unsafeCard.groupKey, expectedGroupVersion: unsafeCard.groupVersion, useRecommendedNextStage: true, clientRequestId: "c3c-unsafe-downstream" }, db), /no longer safely locked/i);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark-unsafe-downstream" } })).status, "READY");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-unsafe-downstream" } })).status, "LOCKED");
  assert.equal(await db.workActionLog.count({ where: { taskId: "mark-unsafe-downstream" } }), 0);

  const staleCard = await markCard("stale");
  await assert.rejects(() => completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: staleCard.groupKey, expectedGroupVersion: `${staleCard.groupVersion}-stale`, useRecommendedNextStage: true, clientRequestId: "c3c-stale" }, db), /Work changed/i);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark-stale" } })).status, "READY");

  const exactCard = await markCard("exact");
  await completeSelectedGroupMembers({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: exactCard.groupKey, expectedGroupVersion: exactCard.groupVersion, selectedTaskIds: ["mark-exact"], useRecommendedNextStage: true, clientRequestId: "c3c-exact" }, db);
  await assertPreselectedAssembly("exact");

  const partialCard = await markCard("partial");
  await setGroupedProgress({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: partialCard.groupKey, expectedGroupVersion: partialCard.groupVersion, targetCompletedQuantity: 5, useRecommendedNextStage: true, clientRequestId: "c3c-partial" }, db);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "mark-partial" }, select: { status: true, completedQuantity: true } }), { status: "IN_PROGRESS", completedQuantity: 5 });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "assembly-partial" } })).status, "LOCKED");
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-partial" } })).status, "LOCKED");

  const unresolvedPackCard = await markCard("unresolved-pack");
  const unresolvedPack = await completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: unresolvedPackCard.groupKey, expectedGroupVersion: unresolvedPackCard.groupVersion, nextStage: "PACK", clientRequestId: "c3c-unresolved-pack" }, db);
  assert.equal(unresolvedPack.nextStage, "PACK");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-unresolved-pack", stage: "PACK" } })).status, "READY");
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-unresolved-pack" } }), 1);

  const unresolvedAssemblyCard = await markCard("unresolved-assembly");
  const unresolvedAssembly = await completeGroupedStage({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: unresolvedAssemblyCard.groupKey, expectedGroupVersion: unresolvedAssemblyCard.groupVersion, nextStage: "ASSEMBLE", routeReason: "Assembly required", confirmMissingInstructions: true, clientRequestId: "c3c-unresolved-assembly" }, db);
  assert.equal(unresolvedAssembly.nextStage, "ASSEMBLE");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-unresolved-assembly", stage: "ASSEMBLE" } })).status, "READY");
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark-unresolved-assembly" } }), 1);

  // Current non-Pack grouping makes a multi-member partial completion unreachable. This
  // compatibility fixture deliberately models a legacy/coalesced projection to exercise
  // routeFinishedMember if such a projection is ever encountered or reintroduced.
  const legacyA = await markCard("legacy-a"), legacyB = await markCard("legacy-b");
  await db.workGroupMember.update({ where: { taskId: "mark-legacy-b" }, data: { groupKey: legacyA.groupKey } });
  await db.workGroupProjection.update({ where: { groupKey: legacyA.groupKey }, data: { memberCount: 2, requiredQuantity: 15, completedQuantity: 0, groupVersion: "legacy-coalesced-v1" } });
  await db.workGroupProjection.delete({ where: { groupKey: legacyB.groupKey } });
  await setGroupedProgress({ actorUserId: "marker", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: legacyA.groupKey, expectedGroupVersion: "legacy-coalesced-v1", targetCompletedQuantity: 8, useRecommendedNextStage: true, clientRequestId: "c3c-legacy-partial" }, db);
  await assertPreselectedAssembly("legacy-a");
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "mark-legacy-b" }, select: { status: true, completedQuantity: true } }), { status: "READY", completedQuantity: 0 });
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "pack-legacy-a" } })).status, "LOCKED");

  const deniedCard = await markCard("no-permission");
  await assert.rejects(() => completeGroupedStage({ actorUserId: "viewer", selectedAccountId: accountId, sourceType: "CONSIGNMENT", stage: "MARK", groupKey: deniedCard.groupKey, expectedGroupVersion: deniedCard.groupVersion, useRecommendedNextStage: true, clientRequestId: "c3c-view-only" }, db), /MARK permission/i);
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: "mark-no-permission" } })).status, "READY");

  console.log("Phase 7.4C3C grouped Mark destination regressions passed.");
} finally {
  await cleanup();
}
