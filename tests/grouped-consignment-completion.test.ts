import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { getGroupedWork } from "../src/lib/workflow/grouped-work";
import { completeGroupedStage } from "../src/lib/workflow/grouped-transition";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
const {db,cleanup}=createTempWorkflowDb("grouped-consignment-completion");
try {
  await db.account.create({ data: { id: "a", name: "A", code: "A", marketplace: "FLIPKART" } });
  await db.user.create({ data: { id: "w", username: "consignment-packer", passwordHash: "x", name: "Worker", role: "PACKER", accountId: "a", canPack: true } });
  await db.consignmentBatch.create({ data: { id: "b", accountId: "a", marketplace: "FLIPKART", externalConsignmentNumber: "C", displayName: "C", status: "ACTIVE", sourceFileName: "test.csv", sourceFileSha256: "x" } });
  for (let index = 0; index < 2; index++) {
    await db.consignmentLine.create({ data: { id: `l${index}`, consignmentBatchId: "b", accountId: "a", rowNumber: index + 1, sellerSkuSource: "SKU", sellerSkuSnapshot: "SKU", requiredQuantity: 1, matchStatus: "OWNER_SELECTED", activated: true, processRoute: "PICK_PACK" } });
    await db.workTask.create({ data: { id: `p${index}`, accountId: "a", sourceType: "CONSIGNMENT", consignmentLineId: `l${index}`, stage: "PICK", sequenceNumber: 1, requiredQuantity: 1, completedQuantity: 1, status: "COMPLETED", completedAt: new Date() } });
    await db.workTask.create({ data: { id: `t${index}`, accountId: "a", sourceType: "CONSIGNMENT", consignmentLineId: `l${index}`, stage: "PACK", sequenceNumber: 2, requiredQuantity: 1, status: "READY", workCardSnapshotJson: JSON.stringify({ sellerSku: "SKU" }), routeSnapshotJson: JSON.stringify(createWorkRouteSnapshot({ processRoute: "PICK_PACK", currentStage: "PACK" })) } });
  }
  const result = await getGroupedWork({ actorUserId: "w", accountId: "a", stage: "PACK", sourceType: "CONSIGNMENT" }, db);
  const card = result.cards[0];
  await completeGroupedStage({ actorUserId: "w", selectedAccountId: "a", sourceType: "CONSIGNMENT", stage: "PACK", groupKey: card.groupKey, expectedGroupVersion: card.groupVersion, clientRequestId: "complete" }, db);
  const batch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: "b" } });
  assert.equal(batch.status, "COMPLETED");
  assert.ok(batch.completedAt);
  assert.equal(await db.consignmentLine.count({ where: { consignmentBatchId: "b", completedAt: { not: null } } }), 2);
} finally {
  await cleanup();
}
console.log("Grouped consignment completion tests passed.");
