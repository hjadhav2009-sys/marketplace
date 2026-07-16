import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { completeConsignmentPickWithRoute, completeOrderPickWithRoute, type PostPickRoute } from "../src/lib/workflow/route-selection";
import { packCustomerOrderShipmentSafely } from "../src/lib/workflow/order-pack-scope";

const root = resolve(process.cwd(), ".codex-tmp"); mkdirSync(root, { recursive: true });
const file = resolve(root, "production-flow.db"); rmSync(file, { force: true });
const sqlite = new DatabaseSync(file); sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve("prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) sqlite.exec(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${file.replace(/\\/g, "/")}` });
const routes: Array<[PostPickRoute, string[]]> = [["DIRECT_PACK", ["PICK", "PACK"]], ["MARK", ["PICK", "MARK", "PACK"]], ["ASSEMBLE", ["PICK", "ASSEMBLE", "PACK"]], ["MARK_ASSEMBLE", ["PICK", "MARK", "ASSEMBLE", "PACK"]]];

try {
  await db.account.createMany({ data: [{ id: "account", name: "Production Flow", code: "PF", companyName: "Fake", marketplace: "FLIPKART" }, { id: "other", name: "Other", code: "OT", companyName: "Fake", marketplace: "FLIPKART" }] });
  await db.user.createMany({ data: [{ id: "owner", username: "owner-flow", passwordHash: "fake", name: "Owner", role: "OWNER", active: true }, { id: "picker", username: "picker-flow", passwordHash: "fake", name: "Picker", role: "PICKER", active: true, accountId: "account", canPick: true }, { id: "packer", username: "packer-flow", passwordHash: "fake", name: "Packer", role: "PACKER", active: true, accountId: "account", canPack: true }] });
  await db.uploadBatch.create({ data: { id: "upload", accountId: "account", fileName: "fake.csv" } });
  for (const [index, [route, stages]] of routes.entries()) {
    const orderId = `order-${index}`;
    await db.order.create({ data: { id: orderId, accountId: "account", batchId: "upload", marketplace: "FLIPKART", awb: `AWB-${index}`, trackingId: `TRACK-${index}`, orderItemId: `ITEM-${index}`, sku: `SKU-${index}`, qty: 2, orderNo: `ORDER-${index}`, pickStatus: "READY", packStatus: "READY", status: "READY" } });
    const first = await completeOrderPickWithRoute({ orderIds: [orderId], accountId: "account", actorUserId: "picker", route, clientRequestId: `order-route-${index}` }, db);
    const replay = await completeOrderPickWithRoute({ orderIds: [orderId], accountId: "account", actorUserId: "picker", route, clientRequestId: `order-route-${index}` }, db);
    assert.equal(first.idempotent, false); assert.equal(replay.idempotent, true);
    assert.deepEqual((await db.workTask.findMany({ where: { orderId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.stage), stages);
    await assert.rejects(() => completeOrderPickWithRoute({ orderIds: [orderId], accountId: "account", actorUserId: "picker", route: route === "DIRECT_PACK" ? "MARK" : "DIRECT_PACK" }, db), /different route/i);
  }

  await db.consignmentBatch.create({ data: { id: "batch", accountId: "account", marketplace: "FLIPKART", externalConsignmentNumber: "CN-1", displayName: "Fake", status: "ACTIVE", sourceFileName: "fake.csv", sourceFileSha256: "fake" } });
  for (const [index, [route, stages]] of routes.entries()) {
    const lineId = `line-${index}`, taskId = `pick-${index}`;
    await db.consignmentLine.create({ data: { id: lineId, consignmentBatchId: "batch", accountId: "account", rowNumber: index + 2, sellerSkuSource: `CSKU-${index}`, requiredQuantity: 3, matchStatus: "OWNER_SELECTED", activated: true } });
    await db.workTask.create({ data: { id: taskId, accountId: "account", sourceType: "CONSIGNMENT", consignmentLineId: lineId, stage: "PICK", sequenceNumber: 1, requiredQuantity: 3, status: "READY" } });
    await completeConsignmentPickWithRoute({ taskId, accountId: "account", actorUserId: "owner", expectedQuantity: 0, route, clientRequestId: `consignment-route-${index}` }, db);
    assert.deepEqual((await db.workTask.findMany({ where: { consignmentLineId: lineId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.stage), stages);
  }

  await assert.rejects(() => completeOrderPickWithRoute({ orderIds: ["order-0"], accountId: "other", actorUserId: "owner", route: "DIRECT_PACK" }, db), /unavailable/i);
  await packCustomerOrderShipmentSafely({ actorUserId: "packer", accountId: "account", orderId: "order-0", source: "packing-detail" }, db);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: "order-0" } })).packStatus, "PACKED");
  await assert.rejects(() => packCustomerOrderShipmentSafely({ actorUserId: "packer", accountId: "account", orderId: "order-1", source: "packing-detail" }, db), /Marking is required/i);
} finally { await db.$disconnect(); rmSync(file, { force: true }); }
console.log("Production flow temporary-database tests passed.");
