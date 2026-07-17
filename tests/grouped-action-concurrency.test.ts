import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { completeGroupedStage } from "../src/lib/workflow/grouped-transition";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const { db, cleanup } = createTempWorkflowDb("grouped-action-concurrency");
try {
  await db.account.createMany({ data: [{ id: "a", name: "A", code: "A", marketplace: "FLIPKART" }, { id: "b", name: "B", code: "B", marketplace: "FLIPKART" }] });
  await db.user.createMany({ data: [
    { id: "worker", username: "concurrent-worker", passwordHash: "x", name: "Worker", role: "PICKER", accountId: "a", canPick: true },
    { id: "other", username: "concurrent-other", passwordHash: "x", name: "Other", role: "PICKER", accountId: "a", canPick: true }
  ] });
  await db.uploadBatch.create({ data: { id: "batch", accountId: "a", fileName: "synthetic.csv" } });
  await db.order.create({ data: { id: "order", accountId: "a", batchId: "batch", marketplace: "FLIPKART", awb: "A", sku: "SKU", qty: 1, orderNo: "O" } });
  await db.workTask.create({ data: { id: "pick", accountId: "a", sourceType: "ORDER", orderId: "order", stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, status: "READY", workCardSnapshotJson: JSON.stringify({ sellerSku: "SKU" }), routeSnapshotJson: JSON.stringify(createWorkRouteSnapshot({ processRoute: "PICK_PACK", currentStage: "PICK" })) } });
  await rebuildWorkGroupProjection({ accountId: "a", sourceType: "ORDER", stage: "PICK" }, db);
  const card = (await getGroupedWork({ actorUserId: "worker", accountId: "a", stage: "PICK", sourceType: "ORDER" }, db)).cards[0];
  const request = { actorUserId: "worker", selectedAccountId: "a", sourceType: "ORDER" as const, stage: "PICK" as const, groupKey: card.groupKey, expectedGroupVersion: card.groupVersion, useRecommendedNextStage: true, clientRequestId: "twenty-identical" };
  const results = await Promise.all(Array.from({ length: 20 }, () => completeGroupedStage(request, db)));
  assert.equal(results.filter(result => !result.idempotent).length, 1, "Twenty identical requests perform one mutation.");
  assert.equal(results.filter(result => result.idempotent).length, 19, "Nineteen requests replay the durable result.");
  assert.equal(await db.workflowActionReceipt.count({ where: { accountId: "a", actorUserId: "worker", requestKind: "GROUP_COMPLETE", clientRequestId: "twenty-identical", status: "COMPLETED" } }), 1);
  assert.equal(await db.workTask.count({ where: { orderId: "order", stage: "PACK" } }), 1, "Concurrent replay creates one downstream task.");
  await assert.rejects(() => completeGroupedStage({ ...request, actorUserId: "other" }, db), /changed|refreshed/i, "Another actor cannot replay the first actor's receipt.");
  await db.user.update({ where: { id: "worker" }, data: { accountId: "b" } });
  await assert.rejects(() => completeGroupedStage(request, db), /not assigned/i, "Removed account access is checked before replay.");
} finally {
  try { await cleanup(); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EPERM")) throw error; }
}
console.log("Twenty-request grouped action concurrency and authorization tests passed.");
