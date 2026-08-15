import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, type ProcessRoute } from "@prisma/client";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "../src/lib/workflow/route-provenance";
import { completePickWithNextRoute } from "../src/lib/workflow/route-selection";
import { setWorkTaskProgress } from "../src/lib/workflow/task-store";

const tmp = resolve(process.cwd(), ".codex-tmp");
mkdirSync(tmp, { recursive: true });
const file = resolve(tmp, "phase-7-4c2-mutation-safety.db");
rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 });
const sqlite = new DatabaseSync(file);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve("prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) sqlite.exec(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${file.replace(/\\/g, "/")}` });

const provenance = (route: ProcessRoute, explicit: boolean) => createImmutableRouteProvenance({ route, rule: explicit ? { id: `rule-${route}`, route } : undefined });
const routeSnapshot = (route: ProcessRoute, explicit: boolean) => JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: route, currentStage: "PICK" }), ...provenance(route, explicit) });
const cardSnapshot = (route: ProcessRoute, explicit: boolean, sku: string) => JSON.stringify({ sellerSku: sku, productTitle: `Synthetic ${sku}`, ...provenance(route, explicit) });

try {
  await db.account.createMany({ data: [
    { id: "account", name: "Synthetic C2", code: "C2", marketplace: "FLIPKART" },
    { id: "other-account", name: "Synthetic Other", code: "OTHER", marketplace: "FLIPKART" },
  ] });
  await db.user.createMany({ data: [
    { id: "picker", username: "c2-picker", passwordHash: "fake", name: "C2 Picker", role: "PICKER", active: true, accountId: "account", canPick: true },
    { id: "other-picker", username: "c2-other", passwordHash: "fake", name: "Other Picker", role: "PICKER", active: true, accountId: "other-account", canPick: true },
  ] });

  const orderRows = [
    { id: "order-pack", sku: "ORDER-PACK", route: "PICK_PACK" as const },
    { id: "order-mark", sku: "ORDER-MARK", route: "PICK_MARK_PACK" as const },
  ];
  for (const [index, order] of orderRows.entries()) {
    await db.order.create({ data: { id: order.id, accountId: "account", marketplace: "FLIPKART", awb: `AWB-${index}`, trackingId: `TRACK-${index}`, sku: order.sku, qty: 2, orderNo: `ORDER-${index}`, pickStatus: "READY", packStatus: "READY" } });
    await db.workTask.create({ data: { id: `${order.id}-pick`, accountId: "account", sourceType: "ORDER", orderId: order.id, stage: "PICK", sequenceNumber: 1, requiredQuantity: 2, status: "READY", workCardSnapshotJson: cardSnapshot(order.route, true, order.sku), routeSnapshotJson: routeSnapshot(order.route, true) } });
  }
  await db.order.create({ data: { id: "other-order", accountId: "other-account", marketplace: "FLIPKART", awb: "OTHER-AWB", sku: "OTHER", qty: 9, orderNo: "OTHER", pickStatus: "READY", packStatus: "READY" } });

  const orderPack = await completePickWithNextRoute({ sourceType: "ORDER", orderIds: ["order-pack"], accountId: "account", actorUserId: "picker", route: "DIRECT_PACK", clientRequestId: "c2-order-pack" }, db);
  assert.equal(orderPack.processRoute, "PICK_PACK");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { orderId: "order-pack", stage: "PACK" } })).status, "READY");

  const orderMark = await completePickWithNextRoute({ sourceType: "ORDER", orderIds: ["order-mark"], accountId: "account", actorUserId: "picker", route: "MARK", confirmMissingInstructions: true, clientRequestId: "c2-order-mark" }, db);
  assert.equal(orderMark.processRoute, "PICK_MARK_PACK");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { orderId: "order-mark", stage: "MARK" } })).status, "READY");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { orderId: "order-mark", stage: "PACK" } })).status, "LOCKED");

  await db.marketplaceListing.create({ data: { id: "listing", accountId: "account", marketplace: "FLIPKART", sku: "CONSIGNMENT", sellerSkuId: "CONSIGNMENT", productTitle: "Synthetic consignment" } });
  await db.consignmentBatch.create({ data: { id: "batch", accountId: "account", marketplace: "FLIPKART", externalConsignmentNumber: "C2-BATCH", displayName: "C2 Batch", status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: "c2" } });
  const lines = ["partial", "fallback", "override", "stale"];
  for (const [index, name] of lines.entries()) await db.consignmentLine.create({ data: { id: `line-${name}`, consignmentBatchId: "batch", accountId: "account", rowNumber: index + 1, sellerSkuSource: "CONSIGNMENT", sellerSkuSnapshot: "CONSIGNMENT", requiredQuantity: 4, marketplaceListingId: "listing", matchStatus: "OWNER_SELECTED", processRoute: name === "override" ? "PICK_PACK" : null, activated: true } });
  await db.workTask.createMany({ data: [
    { id: "partial-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-partial", stage: "PICK", sequenceNumber: 1, requiredQuantity: 4, status: "READY", routeSnapshotJson: routeSnapshot("PICK_PACK", false) },
    { id: "fallback-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-fallback", stage: "PICK", sequenceNumber: 1, requiredQuantity: 4, status: "READY", workCardSnapshotJson: cardSnapshot("PICK_PACK", false, "CONSIGNMENT"), routeSnapshotJson: routeSnapshot("PICK_PACK", false) },
    { id: "override-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-override", stage: "PICK", sequenceNumber: 1, requiredQuantity: 4, status: "READY", workCardSnapshotJson: cardSnapshot("PICK_PACK", true, "CONSIGNMENT"), routeSnapshotJson: routeSnapshot("PICK_PACK", true) },
    { id: "stale-pick", accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: "line-stale", stage: "PICK", sequenceNumber: 1, requiredQuantity: 4, completedQuantity: 1, status: "IN_PROGRESS", assignedUserId: "picker", routeSnapshotJson: routeSnapshot("PICK_PACK", false) },
  ] });

  const partial = await setWorkTaskProgress({ taskId: "partial-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, targetQuantity: 2, clientRequestId: "c2-partial" }, db);
  assert.equal(partial.completedQuantity, 2);
  assert.deepEqual(await db.workTask.findUniqueOrThrow({ where: { id: "partial-pick" }, select: { completedQuantity: true, status: true } }), { completedQuantity: 2, status: "IN_PROGRESS" });

  const fallbackInput = { sourceType: "CONSIGNMENT" as const, taskId: "fallback-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "DIRECT_PACK", clientRequestId: "c2-fallback" };
  const fallback = await completePickWithNextRoute(fallbackInput, db);
  assert.equal(fallback.decisionType, "SELECTED_FROM_SYSTEM_FALLBACK");
  assert.equal((await db.workTask.findFirstOrThrow({ where: { consignmentLineId: "line-fallback", stage: "PACK" } })).status, "READY");

  await assert.rejects(() => completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: "override-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "MARK", clientRequestId: "c2-override-unconfirmed" }, db), /reason|instructions/i);
  const override = await completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: "override-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "MARK", routeReason: "Marking required", confirmMissingInstructions: true, workerNote: "Synthetic C2 override", clientRequestId: "c2-override" }, db);
  assert.equal(override.decisionType, "OVERRIDDEN_SAVED_ROUTE");
  assert.deepEqual(override.missingInstructionStages, ["MARK"]);
  const decision = await db.workRouteDecision.findFirstOrThrow({ where: { taskId: "override-pick" } });
  assert.equal(decision.reason, "Marking required");

  const replay = await completePickWithNextRoute(fallbackInput, db);
  assert.equal(replay.idempotent, true);
  assert.equal(await db.workActionLog.count({ where: { taskId: "fallback-pick", clientRequestId: "c2-fallback" } }), 1);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "fallback-pick" } }), 1);
  await assert.rejects(() => completePickWithNextRoute({ sourceType: "CONSIGNMENT", taskId: "stale-pick", accountId: "account", actorUserId: "picker", expectedQuantity: 0, route: "DIRECT_PACK", clientRequestId: "c2-stale" }, db), /changed.*refresh/i);

  assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: "other-order" }, select: { pickStatus: true, qty: true } }), { pickStatus: "READY", qty: 9 });
  assert.equal(await db.workActionLog.count({ where: { accountId: "account", action: "TASK_COMPLETED" } }), 4, "Each completed Pick emits one authoritative receipt/log.");
} finally {
  await db.$disconnect();
  try { rmSync(file, { force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows may release SQLite after process exit. */ }
}

console.log("Phase 7.4C2 synthetic Pick mutation safety tests passed.");
