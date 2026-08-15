import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { selectableForwardStages } from "../src/lib/workflow/work-route-presentation";
import { setWorkTaskProgress } from "../src/lib/workflow/task-store";

// Historical pre-fix evidence. Its assertions intentionally describe the vulnerable result at
// commit 63c88acdcd21b726bf8ce1f677fb4e8d20a7dd06. After C3A, run the passing safety regression
// instead: npm.cmd run phase7.4c3a:test.

const temporaryDirectory = resolve(process.cwd(), ".codex-tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const databaseFile = resolve(temporaryDirectory, "phase-7-4c3-mark-progress-bypass.db");
rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });

const sqlite = new DatabaseSync(databaseFile);
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const migration of readdirSync(resolve("prisma/migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  sqlite.exec(readFileSync(join("prisma/migrations", migration, "migration.sql"), "utf8"));
}
sqlite.close();

const db = new PrismaClient({ datasourceUrl: `file:${databaseFile.replace(/\\/g, "/")}` });

try {
  await db.account.create({
    data: { id: "account", name: "Synthetic C3", code: "C3", marketplace: "FLIPKART" },
  });
  await db.user.create({
    data: {
      id: "marker",
      username: "c3-marker",
      passwordHash: "synthetic",
      name: "C3 Marker",
      role: "PICKER",
      active: true,
      accountId: "account",
      canMark: true,
    },
  });
  await db.marketplaceListing.create({
    data: {
      id: "listing",
      accountId: "account",
      marketplace: "FLIPKART",
      sku: "C3-SKU",
      sellerSkuId: "C3-SKU",
      productTitle: "Synthetic Mark bypass proof",
    },
  });
  await db.consignmentBatch.create({
    data: {
      id: "batch",
      accountId: "account",
      marketplace: "FLIPKART",
      externalConsignmentNumber: "C3-BYPASS",
      displayName: "Synthetic C3 bypass",
      status: "ACTIVE",
      sourceFileName: "synthetic.csv",
      sourceFileSha256: "synthetic-c3",
    },
  });
  await db.consignmentLine.create({
    data: {
      id: "line",
      consignmentBatchId: "batch",
      accountId: "account",
      rowNumber: 1,
      sellerSkuSource: "C3-SKU",
      sellerSkuSnapshot: "C3-SKU",
      requiredQuantity: 6,
      marketplaceListingId: "listing",
      matchStatus: "OWNER_SELECTED",
      processRoute: "PICK_MARK_PACK",
      activated: true,
    },
  });

  const routeSnapshotJson = JSON.stringify({
    version: 2,
    processRoute: "PICK_MARK_PACK",
    routeVersion: 1,
    currentStage: "MARK",
    actualStages: ["PICK", "MARK"],
    completedStages: ["PICK"],
    decisions: [],
  });
  await db.workTask.createMany({
    data: [
      {
        id: "mark",
        accountId: "account",
        sourceType: "CONSIGNMENT",
        consignmentLineId: "line",
        stage: "MARK",
        sequenceNumber: 2,
        requiredQuantity: 6,
        status: "READY",
        metadataJson: JSON.stringify({ processRoute: "PICK_MARK_PACK" }),
        routeSnapshotJson,
      },
      {
        id: "pack",
        accountId: "account",
        sourceType: "CONSIGNMENT",
        consignmentLineId: "line",
        stage: "PACK",
        sequenceNumber: 3,
        requiredQuantity: 6,
        status: "LOCKED",
        routeSnapshotJson,
      },
    ],
  });

  assert.deepEqual(
    selectableForwardStages("MARK", ["PICK", "MARK"], ["PICK"]),
    ["ASSEMBLE", "PACK"],
    "The approved card model presents a genuine Mark routing choice.",
  );

  const result = await setWorkTaskProgress({
    taskId: "mark",
    accountId: "account",
    actorUserId: "marker",
    expectedQuantity: 0,
    targetQuantity: 6,
    action: "set",
    clientRequestId: "crafted-generic-full-mark",
  }, db);

  assert.deepEqual(result, { completedQuantity: 6, completed: true, idempotent: false });
  assert.deepEqual(
    await db.workTask.findUniqueOrThrow({ where: { id: "mark" }, select: { status: true, completedQuantity: true } }),
    { status: "COMPLETED", completedQuantity: 6 },
    "The generic progress endpoint completed Mark without the Process Flow action.",
  );
  assert.equal(
    (await db.workTask.findUniqueOrThrow({ where: { id: "pack" }, select: { status: true } })).status,
    "READY",
    "The generic progress endpoint silently selected the existing Pack sequence.",
  );
  assert.equal(await db.workTask.count({ where: { consignmentLineId: "line", stage: "ASSEMBLE" } }), 0);
  assert.equal(await db.workRouteDecision.count({ where: { taskId: "mark" } }), 0, "No route decision was recorded.");
  assert.equal(
    await db.auditLog.count({ where: { entityId: "mark", action: "WORK_STAGE_COMPLETED_AND_ROUTED" } }),
    0,
    "The routed-stage audit event was bypassed.",
  );
  const genericLog = await db.workActionLog.findFirstOrThrow({
    where: { taskId: "mark", clientRequestId: "crafted-generic-full-mark" },
  });
  assert.equal(genericLog.requestKind, "SET_PROGRESS");
  assert.equal(genericLog.action, "TASK_COMPLETED");
} finally {
  await db.$disconnect();
  try {
    rmSync(databaseFile, { force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows may release the disposable SQLite file after process exit.
  }
}

console.log("REPRODUCED: generic exact-full Mark progress bypasses the required Process Flow decision.");
