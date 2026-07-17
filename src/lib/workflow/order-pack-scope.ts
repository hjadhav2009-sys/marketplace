import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assertWorkerAccountAccess } from "./worker-access";
import { assertOrderAssemblyPackingEligible } from "./order-assembly";
import { refreshAffectedWorkGroups } from "./work-group-projection";

type Client = PrismaClient | Prisma.TransactionClient;

function explicitRoute(metadataJson: string | null) {
  if (!metadataJson) return null;
  try {
    const value = JSON.parse(metadataJson) as { version?: number; routeChoice?: string };
    return value.version === 1 && ["DIRECT_PACK", "MARK", "ASSEMBLE", "MARK_ASSEMBLE"].includes(value.routeChoice ?? "") ? value.routeChoice! : null;
  } catch { return null; }
}

async function assertExplicitRoutePackingEligible(accountId: string, orderIds: string[], client: Client) {
  const tasks = await client.workTask.findMany({ where: { accountId, sourceType: "ORDER", orderId: { in: orderIds } }, select: { id: true, orderId: true, stage: true, status: true, metadataJson: true } });
  const byOrder = new Map<string, typeof tasks>();
  for (const task of tasks) if (task.orderId) byOrder.set(task.orderId, [...(byOrder.get(task.orderId) ?? []), task]);
  const explicitOrderIds = new Set<string>();
  for (const orderId of orderIds) {
    const orderTasks = byOrder.get(orderId) ?? [];
    const route = explicitRoute(orderTasks.find((task) => task.stage === "PICK")?.metadataJson ?? null);
    if (!route) continue;
    explicitOrderIds.add(orderId);
    const required = route === "MARK_ASSEMBLE" ? ["MARK", "ASSEMBLE"] : route === "MARK" ? ["MARK"] : route === "ASSEMBLE" ? ["ASSEMBLE"] : [];
    for (const stage of required) {
      const task = orderTasks.find((candidate) => candidate.stage === stage);
      if (!task || !["COMPLETED", "SKIPPED"].includes(task.status)) throw new Error(`${stage === "MARK" ? "Marking" : "Assembly"} is required before packing.`);
    }
    const pack = orderTasks.find((task) => task.stage === "PACK");
    if (!pack || !["READY", "IN_PROGRESS"].includes(pack.status)) throw new Error("Packing route is not ready yet.");
  }
  return explicitOrderIds;
}

const orderPackScopeSelect = {
  id: true,
  accountId: true,
  marketplace: true,
  trackingId: true,
  awb: true,
  sku: true,
  qty: true,
  pickStatus: true,
  packStatus: true,
  status: true
} satisfies Prisma.OrderSelect;

export async function resolveOrderPackScope(
  input: { accountId: string; orderId: string },
  client: Client
) {
  const primaryOrder = await client.order.findFirst({
    where: { id: input.orderId, accountId: input.accountId },
    select: orderPackScopeSelect
  });

  if (!primaryOrder) throw new Error("Order is no longer available in this account.");

  const shipmentOrders = await client.order.findMany({
    where:
      ["FLIPKART", "AMAZON"].includes(primaryOrder.marketplace) && primaryOrder.trackingId
        ? {
            accountId: input.accountId,
            marketplace: primaryOrder.marketplace,
            trackingId: primaryOrder.trackingId,
            packStatus: { not: "PACKED" }
          }
        : {
            id: primaryOrder.id,
            accountId: input.accountId,
            packStatus: { not: "PACKED" }
          },
    select: orderPackScopeSelect,
    orderBy: { id: "asc" }
  });

  const unpickedCount = shipmentOrders.filter((order) => order.pickStatus !== "PICKED").length;
  const problemCount = shipmentOrders.filter(
    (order) => order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM"
  ).length;
  const allReadyToPack = shipmentOrders.every((order) => order.packStatus === "READY");

  return {
    primaryOrder,
    shipmentOrders,
    shipmentOrderCount: shipmentOrders.length,
    totalQuantity: shipmentOrders.reduce((total, order) => total + order.qty, 0),
    allPicked: unpickedCount === 0,
    unpickedCount,
    problemCount,
    packable: shipmentOrders.length > 0 && unpickedCount === 0 && problemCount === 0 && allReadyToPack
  };
}

export function assertOrderPackScopeEligible(scope: Awaited<ReturnType<typeof resolveOrderPackScope>>) {
  if (scope.problemCount > 0) throw new Error("Shipment contains problem work.");
  if (scope.unpickedCount > 0) {
    throw new Error(`Shipment cannot be packed: ${scope.unpickedCount} item(s) are still waiting for picking.`);
  }
  if (!scope.packable) throw new Error("Shipment changed; scan again before packing.");
}

export function maskOperationalCode(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 4 ? value : `...${value.slice(-4)}`;
}

export type CustomerOrderPackSource = "universal-scan" | "packing-search-card" | "packing-detail" | "mobile-api" | "grouped-work";

function auditActionForSource(source: CustomerOrderPackSource) {
  if (source === "universal-scan") return "UNIVERSAL_ORDER_PACKED";
  if (source === "mobile-api") return "MOBILE_ORDER_PACKED";
  return "ORDER_PACKED";
}

export async function packCustomerOrderShipmentSafely(
  input: {
    actorUserId: string;
    accountId: string;
    orderId: string;
    expectedStatus?: string;
    source: CustomerOrderPackSource;
    clientRequestId?: string;
  },
  client: PrismaClient = prisma
) {
  const initialAccess = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!hasWorkPermission(initialAccess.user, "canPack")) throw new Error("Order packing permission is required.");
  return client.$transaction(tx => packCustomerOrderShipmentSafelyInTransaction(input, tx));
}

export async function packCustomerOrderShipmentSafelyInTransaction(
  input: {
    actorUserId: string;
    accountId: string;
    orderId: string;
    expectedStatus?: string;
    source: CustomerOrderPackSource;
    clientRequestId?: string;
  },
  tx: Prisma.TransactionClient
) {
    const access = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!hasWorkPermission(access.user, "canPack")) throw new Error("Order packing permission is required.");

    const scope = await resolveOrderPackScope({ accountId: input.accountId, orderId: input.orderId }, tx);
    if (scope.shipmentOrders.length === 0) {
      return { packedCount: 0, skippedCount: 0, scopedCount: 0, totalQuantity: 0, idempotent: true };
    }
    if (input.expectedStatus && scope.primaryOrder.packStatus !== input.expectedStatus) {
      throw new Error("Order changed; scan again before acting.");
    }
    assertOrderPackScopeEligible(scope);
    const explicitOrderIds = await assertExplicitRoutePackingEligible(input.accountId, scope.shipmentOrders.map((order) => order.id), tx);
    const legacyOrders = scope.shipmentOrders.filter((order) => !explicitOrderIds.has(order.id));
    if (legacyOrders.length) await assertOrderAssemblyPackingEligible({ accountId: input.accountId, orders: legacyOrders }, tx);

    const verifiedOrderIds = scope.shipmentOrders.map((order) => order.id);
    const update = await tx.order.updateMany({
      where: {
        id: { in: verifiedOrderIds },
        accountId: input.accountId,
        pickStatus: "PICKED",
        packStatus: "READY",
        status: { not: "PROBLEM" }
      },
      data: { status: "PACKED", packStatus: "PACKED", packedAt: new Date() }
    });
    if (update.count !== verifiedOrderIds.length) throw new Error("Shipment changed; scan again before packing.");
    const packTasks = await tx.workTask.findMany({ where: { accountId: input.accountId, sourceType: "ORDER", orderId: { in: verifiedOrderIds }, stage: "PACK", status: { in: ["READY", "IN_PROGRESS"] } }, select: { id: true, requiredQuantity: true } });
    const completedAt = new Date();
    for (const task of packTasks) await tx.workTask.update({ where: { id: task.id }, data: { status: "COMPLETED", completedQuantity: task.requiredQuantity, assignedUserId: access.user.id, startedAt: completedAt, startedByUserId: access.user.id, completedAt, completedByUserId: access.user.id, version: { increment: 1 } } });

    await tx.scanLog.createMany({
      data: scope.shipmentOrders.map((order) => ({
        accountId: input.accountId,
        orderId: order.id,
        awb: order.trackingId ?? order.awb,
        outcome: "PACKED" as const,
        scannedById: access.user.id,
        note: `Customer order packed from ${input.source}.`
      }))
    });
    await tx.auditLog.create({
      data: {
        userId: access.user.id,
        accountId: input.accountId,
        action: auditActionForSource(input.source),
        entityType: "OrderShipment",
        entityId: scope.primaryOrder.id,
        metadata: JSON.stringify({
          source: input.source,
          packedRowCount: update.count,
          totalQuantity: scope.totalQuantity,
          trackingIdMasked: maskOperationalCode(scope.primaryOrder.trackingId),
          clientRequestId: input.clientRequestId?.slice(0, 160) || undefined
        })
      }
    });
    await refreshAffectedWorkGroups({ accountId: input.accountId, sourceType: "ORDER", stages: ["PACK"], taskIds:packTasks.map(task=>task.id),orderIds:verifiedOrderIds }, tx);

    return {
      packedCount: update.count,
      skippedCount: 0,
      scopedCount: verifiedOrderIds.length,
      totalQuantity: scope.totalQuantity,
      packTaskIds: packTasks.map(task => task.id),
      idempotent: false
    };
}
