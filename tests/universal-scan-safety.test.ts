import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyUniversalCandidateAction } from "../src/lib/workflow/universal-actions";
import { canViewCustomerOrderProblem, highestPriorityIdentifierType, resolveUniversalWork } from "../src/lib/workflow/universal-resolver";

const tempDirectory = resolve(process.cwd(), ".codex-tmp");
mkdirSync(tempDirectory, { recursive: true });
const databaseFile = resolve(tempDirectory, "universal-scan-safety.db");
rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });
const sqlite = new DatabaseSync(databaseFile);
sqlite.exec("PRAGMA foreign_keys=ON;");
const migrations = resolve(process.cwd(), "prisma", "migrations");
for (const name of readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
  sqlite.exec(readFileSync(join(migrations, name, "migration.sql"), "utf8"));
}
sqlite.close();
const db = new PrismaClient({ datasourceUrl: `file:${databaseFile.replace(/\\/g, "/")}` });

const order = (id: string, trackingId: string, pickStatus: "READY" | "PICKED" | "PROBLEM", packStatus: "READY" | "PACKED" | "PROBLEM", qty = 1) => ({
  id,
  accountId: "account",
  batchId: "upload",
  marketplace: "FLIPKART",
  awb: `AWB-${id}`,
  trackingId,
  shipmentId: `SHIP-${trackingId}`,
  orderItemId: `ITEM-${id}`,
  sku: `SKU-${id}`,
  qty,
  orderNo: `ORDER-${id}`,
  pickStatus,
  packStatus,
  status: packStatus === "PACKED" ? "PACKED" as const : packStatus === "PROBLEM" ? "PROBLEM" as const : "READY" as const,
  packedAt: packStatus === "PACKED" ? new Date() : null
});

try {
  await db.account.create({ data: { id: "account", name: "Fake Account", code: "FAKE", companyName: "Fake Company", marketplace: "FLIPKART", active: true } });
  await db.user.createMany({ data: [
    { id: "owner", username: "owner", passwordHash: "fake", name: "Owner", role: "OWNER", active: true, accountId: "account" },
    { id: "worker", username: "worker", passwordHash: "fake", name: "Worker", role: "PICKER", active: true, accountId: "account", canPick: true, canPack: true, canMark: true },
    { id: "reporter", username: "reporter", passwordHash: "fake", name: "Reporter", role: "PICKER", active: true, accountId: "account", canReportProblem: true },
    { id: "other-reporter", username: "other-reporter", passwordHash: "fake", name: "Other Reporter", role: "PICKER", active: true, accountId: "account", canReportProblem: true },
    { id: "packer", username: "packer", passwordHash: "fake", name: "Packer", role: "PACKER", active: true, accountId: "account", canPack: true },
    { id: "viewer", username: "viewer", passwordHash: "fake", name: "Viewer", role: "PICKER", active: true, accountId: "account", canViewAllWork: true }
  ] });
  await db.uploadBatch.create({ data: { id: "upload", accountId: "account", fileName: "fake.csv" } });
  await db.order.createMany({ data: [
    order("group-a", "TRACK-GROUP", "PICKED", "READY", 1),
    order("group-b", "TRACK-GROUP", "PICKED", "READY", 2),
    order("group-c", "TRACK-GROUP", "PICKED", "READY", 3),
    order("mixed-a", "TRACK-MIXED", "PICKED", "READY"),
    order("mixed-b", "TRACK-MIXED", "READY", "READY"),
    order("problem-a", "TRACK-PROBLEM", "PICKED", "READY"),
    order("problem-b", "TRACK-PROBLEM", "PROBLEM", "PROBLEM"),
    order("partial-a", "TRACK-PARTIAL", "PICKED", "READY"),
    order("partial-b", "TRACK-PARTIAL", "PICKED", "PACKED"),
    order("concurrent-a", "TRACK-CONCURRENT", "PICKED", "READY"),
    order("same-sku-a", "TRACK-SAME-A", "READY", "READY"),
    { ...order("same-sku-b", "TRACK-SAME-B", "READY", "READY"), sku: "SKU-same-sku-a" },
    order("problem-visible", "TRACK-VISIBLE", "PROBLEM", "PROBLEM")
  ] });
  await db.problemOrder.create({ data: { id: "reported-problem", accountId: "account", orderId: "problem-visible", reason: "FAKE", status: "OPEN", reportedById: "reporter" } });

  const grouped = await resolveUniversalWork({ actorUserId: "worker", code: "TRACK-GROUP", intent: "PACK" }, db);
  const groupCandidates = grouped.candidates.filter((candidate) => candidate.actionType === "ORDER_PACK");
  assert.equal(groupCandidates.length, 1, "One Tracking ID produces one shipment pack candidate");
  assert.equal(groupCandidates[0].sourceType, "CUSTOMER_ORDER_SHIPMENT");
  assert.equal(groupCandidates[0].shipmentItemCount, 3);
  assert.equal(groupCandidates[0].shipmentTotalQuantity, 6);
  assert.equal(groupCandidates[0].canAct, true);
  const groupedResult = await applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: groupCandidates[0].sourceId, action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "group-pack" }, db);
  assert.ok("updatedCount" in groupedResult);
  assert.equal(groupedResult.updatedCount, 3);
  assert.equal(await db.order.count({ where: { trackingId: "TRACK-GROUP", packStatus: "PACKED" } }), 3);
  assert.equal(await db.scanLog.count({ where: { order: { trackingId: "TRACK-GROUP" } } }), 3, "Scan logs exist only for packed rows");
  const groupAudit = await db.auditLog.findFirstOrThrow({ where: { action: "UNIVERSAL_ORDER_PACKED", entityId: groupCandidates[0].sourceId } });
  const groupMetadata = JSON.parse(groupAudit.metadata ?? "{}") as Record<string, unknown>;
  assert.equal(groupMetadata.shipmentCount, 3);
  assert.equal(groupMetadata.totalQuantity, 6);
  assert.equal(String(groupMetadata.trackingIdMasked).includes("TRACK-GROUP"), false, "Audit masks Tracking ID");

  const mixed = await resolveUniversalWork({ actorUserId: "worker", code: "TRACK-MIXED", intent: "PACK" }, db);
  assert.equal(mixed.candidates.filter((candidate) => candidate.actionType === "ORDER_PACK").length, 1);
  assert.equal(mixed.candidates.find((candidate) => candidate.actionType === "ORDER_PACK")?.unpickedItemCount, 1);
  await assert.rejects(() => applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: "mixed-a", action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "mixed-pack" }, db), /still waiting for picking/i);
  assert.equal(await db.order.count({ where: { trackingId: "TRACK-MIXED", packStatus: "PACKED" } }), 0, "Mixed shipment packs no rows");

  await assert.rejects(() => applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: "problem-a", action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "problem-pack" }, db), /problem work/i);
  assert.equal(await db.order.count({ where: { trackingId: "TRACK-PROBLEM", packStatus: "PACKED" } }), 0, "Problem shipment packs no rows");

  const partial = await applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: "partial-a", action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "partial-pack" }, db);
  assert.ok("updatedCount" in partial);
  assert.equal(partial.updatedCount, 1, "Already packed siblings remain untouched");
  assert.equal(await db.scanLog.count({ where: { order: { trackingId: "TRACK-PARTIAL" } } }), 1);

  const concurrent = await Promise.allSettled([
    applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: "concurrent-a", action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "concurrent-1" }, db),
    applyUniversalCandidateAction({ actorUserId: "worker", accountId: "account", sourceId: "concurrent-a", action: "ORDER_PACK", expectedStatus: "READY", clientRequestId: "concurrent-2" }, db)
  ]);
  assert.ok(concurrent.some((result) => result.status === "fulfilled"));
  assert.equal(await db.order.count({ where: { id: "concurrent-a", packStatus: "PACKED" } }), 1);
  assert.equal(await db.scanLog.count({ where: { orderId: "concurrent-a" } }), 1, "Concurrent pack mutates and logs once");

  const sameSku = await resolveUniversalWork({ actorUserId: "worker", code: "SKU-same-sku-a", intent: "PICK" }, db);
  const pickCandidates = sameSku.candidates.filter((candidate) => candidate.actionType === "ORDER_PICK");
  assert.equal(pickCandidates.length, 2);
  assert.notEqual(pickCandidates[0].awb, pickCandidates[1].awb, "Same-SKU cards expose distinct AWBs");
  assert.ok(pickCandidates.every((candidate) => candidate.orderNumber && candidate.shipmentId));

  const reporterProblem = await resolveUniversalWork({ actorUserId: "reporter", code: "TRACK-VISIBLE" }, db);
  assert.ok(reporterProblem.candidates.some((candidate) => candidate.actionType === "PROBLEM"), "Reporter sees own problem");
  const otherProblem = await resolveUniversalWork({ actorUserId: "other-reporter", code: "TRACK-VISIBLE" }, db);
  assert.equal(otherProblem.candidates.some((candidate) => candidate.actionType === "PROBLEM"), false, "Reporting permission alone does not reveal another worker's problem");
  assert.ok((await resolveUniversalWork({ actorUserId: "owner", code: "TRACK-VISIBLE" }, db)).candidates.some((candidate) => candidate.actionType === "PROBLEM"));
  assert.ok((await resolveUniversalWork({ actorUserId: "packer", code: "TRACK-VISIBLE" }, db)).candidates.some((candidate) => candidate.actionType === "PROBLEM"));
  assert.ok((await resolveUniversalWork({ actorUserId: "viewer", code: "TRACK-VISIBLE" }, db)).candidates.some((candidate) => candidate.actionType === "PROBLEM"));
  assert.equal(canViewCustomerOrderProblem({ id: "other", role: "PICKER", canPack: false, canViewAllWork: false }, { reportedByIds: ["reporter"] }), false);

  assert.equal(highestPriorityIdentifierType([{ identifierType: "FSN" }, { identifierType: "SELLER_SKU" }, { identifierType: "FNSKU" }]), "FNSKU");
  assert.equal(highestPriorityIdentifierType([{ identifierType: "FSN" }, { identifierType: "SELLER_SKU" }]), "SELLER_SKU");
  for (let index = 0; index < 5; index += 1) {
    assert.equal(highestPriorityIdentifierType([{ identifierType: "FSN" }, { identifierType: "FNSKU" }, { identifierType: "SELLER_SKU" }]), "FNSKU", "Identifier reason remains deterministic");
  }

  await db.consignmentBatch.create({ data: { id: "crowded-batch", accountId: "account", marketplace: "FLIPKART", externalConsignmentNumber: "CROWDED-BATCH", displayName: "Fake crowded batch", status: "ACTIVE", sourceFileName: "fake.csv", sourceFileSha256: "fake-sha" } });
  const crowdedLines = Array.from({ length: 105 }, (_, index) => ({ id: `crowded-line-${index}`, consignmentBatchId: "crowded-batch", accountId: "account", rowNumber: index + 1, requiredQuantity: 1, matchStatus: "EXACT_SKU" as const, processRoute: "PICK_PACK" as const, activated: true, sellerSkuSnapshot: "CROWDED-SKU" }));
  await db.consignmentLine.createMany({ data: crowdedLines });
  await db.workTask.createMany({ data: crowdedLines.map((line, index) => ({ id: `crowded-task-${index.toString().padStart(3, "0")}`, accountId: "account", sourceType: "CONSIGNMENT" as const, consignmentLineId: line.id, stage: "PICK" as const, sequenceNumber: 1, requiredQuantity: 1, status: "READY" as const, assignedUserId: index === 104 ? "worker" : null })) });
  const crowded = await resolveUniversalWork({ actorUserId: "worker", code: "CROWDED-SKU", intent: "PICK", limit: 10 }, db);
  assert.ok(crowded.candidates.some((candidate) => candidate.taskId === "crowded-task-104"), "Assigned exact task survives prefetch result bounding");
} finally {
  await db.$disconnect();
  try { rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}

console.log("Universal scanner shipment safety tests passed.");
