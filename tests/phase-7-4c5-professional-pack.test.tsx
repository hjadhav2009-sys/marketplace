import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProcessRoute, WorkStage } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { createWorkRouteSnapshot } from "../src/lib/workflow/dynamic-route";
import { completeWorkTask, incrementWorkTaskProgress, setWorkTaskProgress } from "../src/lib/workflow/task-store";
import { packCustomerOrderShipmentSafely } from "../src/lib/workflow/order-pack-scope";
import { assertWorkerAccountAccess } from "../src/lib/workflow/worker-access";
import { navigationForUser, type NavigationUser } from "../lib/app-navigation";
import { PackReadiness } from "../components/work-card/PackReadiness";
import { resolvePackSource, supportedPackSources, type PackSummary } from "../src/lib/workflow/pack-workspace";
import { applyUniversalCandidateAction } from "../src/lib/workflow/universal-actions";

const preflight = process.env.C5_PREFLIGHT === "1";
const { db, cleanup } = createTempWorkflowDb("phase-7-4c5-professional-pack");
const accountId = "c5-account";
const stagesByRoute: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"],
};

function packSnapshot(route: ProcessRoute) {
  const stages = stagesByRoute[route];
  return JSON.stringify({
    ...createWorkRouteSnapshot({ processRoute: route, currentStage: "PACK" }),
    actualStages: stages,
    completedStages: stages.filter((stage) => stage !== "PACK"),
    selectedNextStage: "PACK",
    decisions: [{ fromStage: "PICK", toStage: stages[1], actorUserId: "picker", decidedAt: "2026-01-01T00:00:00.000Z", reason: "DEFAULT" }],
    routeSnapshotVersion: 3,
    savedProcessRoute: route,
    savedProcessRuleId: `rule-${route}`,
  });
}

function assertFinalSnapshot(value: string | null, route: ProcessRoute, routeVersion = 2) {
  const parsed = JSON.parse(value ?? "{}");
  assert.deepEqual(parsed.actualStages, stagesByRoute[route]);
  assert.deepEqual(parsed.completedStages, stagesByRoute[route]);
  assert.equal(parsed.currentStage, "PACK");
  assert.equal("selectedNextStage" in parsed, false);
  assert.equal(parsed.routeVersion, routeVersion);
  assert.equal(parsed.savedProcessRuleId, `rule-${route}`);
  assert.equal(parsed.decisions.length, 1);
}

async function seedConsignment(route: ProcessRoute, serial: number) {
  const batchId = `consignment-batch-${serial}`;
  const lineId = `consignment-line-${serial}`;
  const snapshot = packSnapshot(route);
  await db.consignmentBatch.create({ data: { id: batchId, accountId, marketplace: "FLIPKART", externalConsignmentNumber: `C5-${serial}`, displayName: `C5-${serial}`, status: "ACTIVE", sourceFileName: "synthetic.csv", sourceFileSha256: `c5-${serial}` } });
  await db.consignmentLine.create({ data: { id: lineId, consignmentBatchId: batchId, accountId, rowNumber: 1, sellerSkuSource: `CONSIGNMENT-${serial}`, sellerSkuSnapshot: `CONSIGNMENT-${serial}`, requiredQuantity: 2, matchStatus: "OWNER_SELECTED", activated: true, processRoute: route } });
  await db.workTask.createMany({ data: stagesByRoute[route].map((stage, index) => ({
    id: `${lineId}-${stage.toLowerCase()}`,
    accountId,
    sourceType: "CONSIGNMENT" as const,
    consignmentLineId: lineId,
    stage,
    sequenceNumber: index + 1,
    requiredQuantity: 2,
    completedQuantity: stage === "PACK" ? 0 : 2,
    status: stage === "PACK" ? "READY" as const : "COMPLETED" as const,
    completedAt: stage === "PACK" ? undefined : new Date(0),
    completedByUserId: stage === "PACK" ? undefined : "picker",
    routeSnapshotJson: snapshot,
  })) });
  return { lineId, packTaskId: `${lineId}-pack` };
}

async function seedOrder(route: ProcessRoute, serial: number) {
  const orderId = `order-${serial}`;
  const snapshot = packSnapshot(route);
  await db.order.create({ data: { id: orderId, accountId, batchId: "upload", marketplace: "FLIPKART", awb: `AWB-${serial}`, trackingId: `PACKAGE-${serial}`, sku: `ORDER-SKU-${serial}`, qty: 3, orderNo: `ORDER-${serial}`, pickStatus: "PICKED", packStatus: "READY" } });
  await db.workTask.createMany({ data: stagesByRoute[route].map((stage, index) => ({
    id: `${orderId}-${stage.toLowerCase()}`,
    accountId,
    sourceType: "ORDER" as const,
    orderId,
    stage,
    sequenceNumber: index + 1,
    requiredQuantity: 3,
    completedQuantity: stage === "PACK" ? 0 : 3,
    status: stage === "PACK" ? "READY" as const : "COMPLETED" as const,
    completedAt: stage === "PACK" ? undefined : new Date(0),
    completedByUserId: stage === "PACK" ? undefined : "picker",
    routeSnapshotJson: snapshot,
  })) });
  return { orderId, packTaskId: `${orderId}-pack` };
}

try {
  await db.account.create({ data: { id: accountId, name: "C5", code: "C5", marketplace: "FLIPKART" } });
  await db.user.createMany({ data: [
    { id: "picker", username: "c5-picker", passwordHash: "synthetic", name: "Picker", role: "PICKER", accountId, canPick: true, active: true },
    { id: "packer", username: "c5-packer", passwordHash: "synthetic", name: "Packer", role: "PACKER", accountId, canPack: true, active: true },
    { id: "other-packer", username: "c5-other-packer", passwordHash: "synthetic", name: "Other Packer", role: "PACKER", accountId, canPack: true, active: true },
    { id: "no-pack", username: "c5-no-pack", passwordHash: "synthetic", name: "No Pack", role: "PICKER", accountId, active: true },
  ] });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: "packer" } })).active, true);
  await assertWorkerAccountAccess("packer", accountId, db);
  await db.uploadBatch.create({ data: { id: "upload", accountId, fileName: "synthetic.csv" } });

  const generic = await seedConsignment("PICK_PACK", 1);
  await assert.rejects(() => setWorkTaskProgress({ taskId: generic.packTaskId, accountId, actorUserId: "packer", expectedQuantity: 0, targetQuantity: 1 }, db), /authoritative Pack Completed/i);
  await assert.rejects(() => incrementWorkTaskProgress({ taskId: generic.packTaskId, accountId, actorUserId: "packer", expectedQuantity: 0, increment: 1 }, db), /authoritative Pack Completed/i);

  const consignment = await seedConsignment("PICK_MARK_ASSEMBLE_PACK", 2);
  const consignmentInput = { taskId: consignment.packTaskId, accountId, actorUserId: "packer", expectedQuantity: 0, clientRequestId: "c5-consignment-pack" };
  await completeWorkTask(consignmentInput, db);
  const consignmentTasks = await db.workTask.findMany({ where: { consignmentLineId: consignment.lineId }, orderBy: { sequenceNumber: "asc" } });

  const order = await seedOrder("PICK_MARK_PACK", 1);
  const orderInput = { actorUserId: "packer", accountId, orderId: order.orderId, source: "packing-detail" as const, clientRequestId: "c5-order-pack" };
  await packCustomerOrderShipmentSafely(orderInput, db);
  const orderTasks = await db.workTask.findMany({ where: { orderId: order.orderId }, orderBy: { sequenceNumber: "asc" } });

  if (preflight) {
    const finalTruthStale = [...consignmentTasks, ...orderTasks].some((task) => {
      const parsed = JSON.parse(task.routeSnapshotJson ?? "{}");
      return !parsed.completedStages?.includes("PACK") || "selectedNextStage" in parsed;
    });
    assert.equal(finalTruthStale, true);
    assert.equal(await db.workChangeEvent.count({ where: { stage: "PACK", eventType: "STAGE_COMPLETED" } }), 0);
    console.log("CONFIRMED_FINAL_PACK_ROUTE_SNAPSHOT_GAP");
    console.log("CONFIRMED_DIRECT_PACK_LIVE_EVENT_GAP");
  } else {
    for (const task of consignmentTasks) assertFinalSnapshot(task.routeSnapshotJson, "PICK_MARK_ASSEMBLE_PACK");
    for (const task of orderTasks) assertFinalSnapshot(task.routeSnapshotJson, "PICK_MARK_PACK");
    const consignmentBeforeReplay = consignmentTasks.map((task) => task.routeSnapshotJson);
    const orderBeforeReplay = orderTasks.map((task) => task.routeSnapshotJson);
    assert.equal((await completeWorkTask(consignmentInput, db)).idempotent, true);
    assert.equal((await packCustomerOrderShipmentSafely(orderInput, db)).idempotent, true);
    assert.deepEqual((await db.workTask.findMany({ where: { consignmentLineId: consignment.lineId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.routeSnapshotJson), consignmentBeforeReplay);
    assert.deepEqual((await db.workTask.findMany({ where: { orderId: order.orderId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.routeSnapshotJson), orderBeforeReplay);
    let serial = 10;
    for (const route of Object.keys(stagesByRoute) as ProcessRoute[]) {
      const nextConsignment = await seedConsignment(route, serial);
      const consignmentRequest = { taskId: nextConsignment.packTaskId, accountId, actorUserId: "packer", expectedQuantity: 0, clientRequestId: `c5-consignment-${route}` };
      await completeWorkTask(consignmentRequest, db);
      const consignmentRows = await db.workTask.findMany({ where: { consignmentLineId: nextConsignment.lineId }, orderBy: { sequenceNumber: "asc" } });
      for (const task of consignmentRows) assertFinalSnapshot(task.routeSnapshotJson, route);
      const consignmentBytes = consignmentRows.map((task) => task.routeSnapshotJson);
      assert.equal((await completeWorkTask(consignmentRequest, db)).idempotent, true);
      assert.deepEqual((await db.workTask.findMany({ where: { consignmentLineId: nextConsignment.lineId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.routeSnapshotJson), consignmentBytes);
      assert.equal((await db.consignmentLine.findUniqueOrThrow({ where: { id: nextConsignment.lineId } })).completedAt instanceof Date, true);
      assert.equal((await db.consignmentBatch.findUniqueOrThrow({ where: { id: `consignment-batch-${serial}` } })).status, "COMPLETED");

      const nextOrder = await seedOrder(route, serial);
      const orderRequest = { actorUserId: "packer", accountId, orderId: nextOrder.orderId, source: "packing-detail" as const, clientRequestId: `c5-order-${route}` };
      await packCustomerOrderShipmentSafely(orderRequest, db);
      const orderRows = await db.workTask.findMany({ where: { orderId: nextOrder.orderId }, orderBy: { sequenceNumber: "asc" } });
      for (const task of orderRows) assertFinalSnapshot(task.routeSnapshotJson, route);
      const orderBytes = orderRows.map((task) => task.routeSnapshotJson);
      assert.equal((await packCustomerOrderShipmentSafely(orderRequest, db)).idempotent, true);
      assert.deepEqual((await db.workTask.findMany({ where: { orderId: nextOrder.orderId }, orderBy: { sequenceNumber: "asc" } })).map((task) => task.routeSnapshotJson), orderBytes);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: nextOrder.orderId } })).packStatus, "PACKED");
      serial += 1;
    }

    for (const suffix of ["a", "b"]) {
      await db.order.create({ data: { id: `conflict-${suffix}`, accountId, batchId: "upload", marketplace: "FLIPKART", awb: `CONFLICT-${suffix}`, trackingId: "PACKAGE-CONFLICT", sku: `CONFLICT-${suffix}`, qty: 1, orderNo: `CONFLICT-${suffix}`, pickStatus: "PICKED", packStatus: "READY" } });
      await db.workTask.create({ data: { id: `conflict-${suffix}-pack`, accountId, sourceType: "ORDER", orderId: `conflict-${suffix}`, stage: "PACK", sequenceNumber: 2, requiredQuantity: 1, status: "READY", assignedUserId: suffix === "a" ? "packer" : "other-packer", routeSnapshotJson: packSnapshot("PICK_PACK") } });
    }
    await assert.rejects(() => packCustomerOrderShipmentSafely({ actorUserId: "packer", accountId, orderId: "conflict-a", source: "packing-detail", clientRequestId: "c5-conflict" }, db), /assignment conflict/i);
    assert.equal(await db.order.count({ where: { trackingId: "PACKAGE-CONFLICT", packStatus: "PACKED" } }), 0);

    const denied = await seedOrder("PICK_PACK", 90);
    await assert.rejects(() => packCustomerOrderShipmentSafely({ actorUserId: "no-pack", accountId, orderId: denied.orderId, source: "packing-detail" }, db), /permission/i);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: denied.orderId } })).packStatus, "READY");

    const scanner = await seedOrder("PICK_PACK", 91);
    const scannerResult = await applyUniversalCandidateAction({ actorUserId: "packer", accountId, sourceId: scanner.orderId, action: "ORDER_PACK", expectedStatus: "PACK_READY", expectedQuantity: 0, clientRequestId: "c5-universal-order-pack" }, db);
    assert.equal("updatedCount" in scannerResult ? scannerResult.updatedCount : null, 1, "Scanner PACK_READY is translated to the stored READY status at the authoritative boundary.");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: scanner.orderId } })).packStatus, "PACKED");

    const navUser: NavigationUser = { role: "PACKER", canPick: false, canPack: true, canReportProblem: false, canMark: false, canAssemble: false, canManageMarkingLibrary: false, canManageProcessRules: false, canViewAllWork: false, canViewConsignments: false, canImportConsignments: false, canManageConsignments: false };
    const navHrefs = navigationForUser(navUser).map((link) => link.href);
    assert.equal(navHrefs.filter((href) => href === "/work/pack").length, 1);
    assert.equal(navHrefs.includes("/packing"), false);
    assert.equal(navHrefs.includes("/work/consignments/pack"), false);
    assert.equal(navHrefs.includes("/work/scan"), true);

    const empty = { cardCount: 0, itemCount: 0, requiredQuantity: 0, problems: 0, assignedToMe: 0, oldestWaitingAt: null, projectionUnavailable: false, projectionState: "READY" };
    const summary = { ORDER: { ...empty, cardCount: 2 }, CONSIGNMENT: { ...empty, cardCount: 1 } } as PackSummary;
    assert.deepEqual(supportedPackSources("AMAZON"), ["CONSIGNMENT"]);
    assert.equal(resolvePackSource({ requestedSource: "ORDER", summary, supportedSources: supportedPackSources("AMAZON") }).selectedSource, "CONSIGNMENT");
    assert.equal(resolvePackSource({ requestedSource: "CONSIGNMENT", summary, supportedSources: supportedPackSources("FLIPKART") }).selectedSource, "CONSIGNMENT");

    const readinessMarkup = renderToStaticMarkup(<PackReadiness model={{ packReady: true, blocker: null, stages: { PICK: { state: "SATISFIED", required: true, requiredCount: 3, totalCount: 3 }, MARK: { state: "SATISFIED", required: true, requiredCount: 1, totalCount: 3 }, ASSEMBLE: { state: "SATISFIED", required: true, requiredCount: 1, totalCount: 3 }, PACK: { state: "PENDING", required: true, requiredCount: 3, totalCount: 3 } } }} />);
    assert.match(readinessMarkup, /Package readiness/);
    assert.match(readinessMarkup, /Complete where required/);
    assert.match(readinessMarkup, /Ready/);

    const packCardSource = readFileSync("app/work/pack/PackWorkCard.tsx", "utf8");
    const workspaceSource = readFileSync("app/work/pack/PackWorkspace.tsx", "utf8");
    const quickSource = readFileSync("components/work-card/GroupedQuickActions.tsx", "utf8");
    const legacySource = readFileSync("app/work/consignments/pack/page.tsx", "utf8");
    assert.match(workspaceSource, /title="Packing"/);
    assert.match(packCardSource, />Pack Completed</);
    assert.doesNotMatch(packCardSource, /Partial Quantity|WorkRouteDialog|Change Process Flow/);
    assert.match(packCardSource, /assignmentConflict/);
    assert.match(quickSource, /Underlying order items/);
    assert.match(quickSource, /Package readiness/);
    assert.match(legacySource, /status && query\.status !== "active"/);
    assert.match(legacySource, /redirect\(`\/work\/pack\?\$\{destination\.toString\(\)\}`\)/);

    assert.equal(await db.workChangeEvent.count({ where: { stage: "PACK", eventType: "STAGE_COMPLETED" } }), 11);
    console.log("Phase 7.4C5 professional Pack regressions passed.");
  }
} finally {
  await cleanup();
}
