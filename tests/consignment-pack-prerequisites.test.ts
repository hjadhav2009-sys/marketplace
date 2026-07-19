import assert from "node:assert/strict";
import type { ProcessRoute, WorkStage, WorkTaskStatus } from "@prisma/client";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { completeConsignmentPackTasksInTransaction } from "../src/lib/workflow/task-store";

const routes: Array<{ route: ProcessRoute; stages: WorkStage[] }> = [
  { route: "PICK_PACK", stages: ["PICK", "PACK"] },
  { route: "PICK_MARK_PACK", stages: ["PICK", "MARK", "PACK"] },
  { route: "PICK_ASSEMBLE_PACK", stages: ["PICK", "ASSEMBLE", "PACK"] },
  { route: "PICK_MARK_ASSEMBLE_PACK", stages: ["PICK", "MARK", "ASSEMBLE", "PACK"] }
];

const { db, cleanup } = createTempWorkflowDb("consignment-pack-prerequisites");
let counter = 0;

async function seedLine(input: {
  route: ProcessRoute;
  statuses?: Partial<Record<WorkStage, WorkTaskStatus>>;
  batchLineCount?: number;
  accountId?: string;
}) {
  const serial = ++counter;
  const accountId = input.accountId ?? "account";
  const batchId = `batch-${serial}`;
  await db.consignmentBatch.create({ data: { id: batchId, accountId, marketplace: "FLIPKART", externalConsignmentNumber: `C-${serial}`, displayName: `C-${serial}`, status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: `sha-${serial}` } });
  const selected = routes.find(item => item.route === input.route)!;
  const lines: Array<{ lineId: string; packTaskId: string }> = [];
  for (let lineIndex = 0; lineIndex < (input.batchLineCount ?? 1); lineIndex += 1) {
    const lineId = `line-${serial}-${lineIndex}`;
    await db.consignmentLine.create({ data: { id: lineId, consignmentBatchId: batchId, accountId, rowNumber: lineIndex + 1, sellerSkuSource: `SKU-${serial}-${lineIndex}`, sellerSkuSnapshot: `SKU-${serial}-${lineIndex}`, requiredQuantity: 1, matchStatus: "OWNER_SELECTED", activated: true, processRoute: input.route } });
    const snapshot = JSON.stringify(createWorkRouteSnapshot({ processRoute: input.route, currentStage: "PACK" }));
    for (const [index, stage] of selected.stages.entries()) {
      const status = input.statuses?.[stage] ?? (stage === "PACK" ? "READY" : "COMPLETED");
      await db.workTask.create({ data: { id: `task-${serial}-${lineIndex}-${stage}`, accountId, sourceType: "CONSIGNMENT", consignmentLineId: lineId, stage, sequenceNumber: index + 1, requiredQuantity: 1, completedQuantity: status === "COMPLETED" ? 1 : 0, status, completedAt: status === "COMPLETED" ? new Date() : null, completedByUserId: status === "COMPLETED" ? "packer" : null, problemReason: status === "PROBLEM" ? "PACKING_BLOCKED" : null, problemReportedAt: status === "PROBLEM" ? new Date() : null, problemReportedByUserId: status === "PROBLEM" ? "packer" : null, routeSnapshotJson: snapshot } });
    }
    lines.push({ lineId, packTaskId: `task-${serial}-${lineIndex}-PACK` });
  }
  return { batchId, lines };
}

async function expectBlocked(route: ProcessRoute, stage: WorkStage, status: WorkTaskStatus, pattern: RegExp) {
  const seeded = await seedLine({ route, statuses: { [stage]: status } });
  await assert.rejects(
    () => db.$transaction(tx => completeConsignmentPackTasksInTransaction(tx, { accountId: "account", actorUserId: "packer", taskIds: [seeded.lines[0].packTaskId] })),
    pattern
  );
  assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: seeded.lines[0].packTaskId } })).status, "READY");
}

try {
  await db.account.createMany({ data: [
    { id: "account", name: "Synthetic", code: "SYN", marketplace: "FLIPKART" },
    { id: "other", name: "Other", code: "OTH", marketplace: "FLIPKART" }
  ] });
  await db.user.create({ data: { id: "packer", username: "synthetic-packer", passwordHash: "x", name: "Packer", role: "PACKER", accountId: "account", canPack: true } });

  for (const { route } of routes) {
    const seeded = await seedLine({ route });
    await db.$transaction(tx => completeConsignmentPackTasksInTransaction(tx, { accountId: "account", actorUserId: "packer", taskIds: [seeded.lines[0].packTaskId] }));
    assert.equal((await db.workTask.findUniqueOrThrow({ where: { id: seeded.lines[0].packTaskId } })).status, "COMPLETED", `${route} completes Pack`);
    assert.ok((await db.consignmentLine.findUniqueOrThrow({ where: { id: seeded.lines[0].lineId } })).completedAt, `${route} completes its exact line`);
  }

  await expectBlocked("PICK_PACK", "PICK", "READY", /Picking is required before packing/);
  await expectBlocked("PICK_PACK", "PICK", "IN_PROGRESS", /Picking is required before packing/);
  await expectBlocked("PICK_PACK", "PICK", "PROBLEM", /Picking has problem work/);
  await expectBlocked("PICK_MARK_PACK", "MARK", "READY", /Marking is required before packing/);
  await expectBlocked("PICK_ASSEMBLE_PACK", "ASSEMBLE", "READY", /Assembly is required before packing/);
  await expectBlocked("PICK_MARK_ASSEMBLE_PACK", "MARK", "READY", /Marking is required before packing/);
  await expectBlocked("PICK_MARK_ASSEMBLE_PACK", "ASSEMBLE", "READY", /Assembly is required before packing/);

  const finalBatch = await seedLine({ route: "PICK_PACK", batchLineCount: 2 });
  await db.$transaction(tx => completeConsignmentPackTasksInTransaction(tx, { accountId: "account", actorUserId: "packer", taskIds: [finalBatch.lines[0].packTaskId] }));
  assert.equal((await db.consignmentBatch.findUniqueOrThrow({ where: { id: finalBatch.batchId } })).status, "ACTIVE", "Batch stays active until its final line");
  await db.$transaction(tx => completeConsignmentPackTasksInTransaction(tx, { accountId: "account", actorUserId: "packer", taskIds: [finalBatch.lines[1].packTaskId] }));
  assert.equal((await db.consignmentBatch.findUniqueOrThrow({ where: { id: finalBatch.batchId } })).status, "COMPLETED", "Final line completes the batch");

  const isolated = await seedLine({ route: "PICK_PACK" });
  await assert.rejects(() => db.$transaction(tx => completeConsignmentPackTasksInTransaction(tx, { accountId: "other", actorUserId: "packer", taskIds: [isolated.lines[0].packTaskId] })), /Packing work changed/);
} finally {
  await cleanup();
}

console.log("Consignment Pack prerequisite tests passed.");
