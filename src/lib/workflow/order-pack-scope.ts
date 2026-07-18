import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assertWorkerAccountAccess } from "./worker-access";
import { refreshAffectedWorkGroups } from "./work-group-projection";
import { resolveOrderShipmentWorkflowPrerequisites } from "./workflow-prerequisites";
import { routeFingerprint } from "./dynamic-route";
import { beginWorkflowActionReceipt, completeWorkflowActionReceipt, withWorkflowActionRequestGate } from "./workflow-action-receipt";

type Client = PrismaClient | Prisma.TransactionClient;

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
            trackingId: primaryOrder.trackingId
          }
        : {
            id: primaryOrder.id,
            accountId: input.accountId
          },
    select: orderPackScopeSelect,
    orderBy: { id: "asc" }
  });

  const unpickedCount = shipmentOrders.filter((order) => order.pickStatus !== "PICKED").length;
  const problemCount = shipmentOrders.filter(
    (order) => order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM"
  ).length;
  const workflow = await resolveOrderShipmentWorkflowPrerequisites({ accountId: input.accountId, orderIds: shipmentOrders.map(order => order.id) }, client);

  return {
    primaryOrder,
    shipmentOrders,
    shipmentOrderCount: shipmentOrders.length,
    totalQuantity: shipmentOrders.reduce((total, order) => total + order.qty, 0),
    allPicked: unpickedCount === 0,
    unpickedCount,
    problemCount,
    workflow: workflow.package,
    packable: shipmentOrders.length > 0 && workflow.package.packReady && shipmentOrders.every(order => ["READY", "PACKED"].includes(order.packStatus))
  };
}

export function assertOrderPackScopeEligible(scope: Awaited<ReturnType<typeof resolveOrderPackScope>>) {
  if (scope.problemCount > 0) throw new Error("Shipment contains problem work.");
  if (scope.unpickedCount > 0) {
    throw new Error(`Shipment cannot be packed: ${scope.unpickedCount} item(s) are still waiting for picking.`);
  }
  if (scope.workflow.blocker) throw new Error(scope.workflow.blocker);
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
  const execute=async()=>{let last:unknown;for(let attempt=0;attempt<6;attempt++){try{return await client.$transaction(tx => packCustomerOrderShipmentSafelyInTransaction(input, tx));}catch(error){last=error;const transient=error instanceof Error&&(/database is locked|unique constraint|write conflict|P2002|P2034/i.test(error.message)||"code" in error&&["P2002","P2034"].includes(String((error as {code?:string}).code)));if(!transient||attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}throw last;};return input.clientRequestId?withWorkflowActionRequestGate([input.accountId,input.actorUserId,"ORDER_PACK",input.clientRequestId].join(":"),execute):execute();
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
    const receipt = input.clientRequestId ? await beginWorkflowActionReceipt<{ packedCount:number; skippedCount:number; scopedCount:number; totalQuantity:number; packTaskIds?:string[]; idempotent:boolean }>(tx, { accountId: input.accountId, actorUserId: access.user.id, requestKind: "ORDER_PACK", clientRequestId: input.clientRequestId, requestFingerprint: routeFingerprint({ orderId: input.orderId, expectedStatus: input.expectedStatus ?? null, source: input.source }), sourceType: "ORDER", stage: "PACK" }) : null;
    if (receipt?.replay) return { ...receipt.replay, idempotent: true };

    const scope = await resolveOrderPackScope({ accountId: input.accountId, orderId: input.orderId }, tx);
    if (scope.shipmentOrders.length === 0 || scope.shipmentOrders.every(order => order.packStatus === "PACKED")) {
      const result = { packedCount: 0, skippedCount: 0, scopedCount: 0, totalQuantity: 0, packTaskIds: [] as string[], idempotent: true };
      return receipt ? completeWorkflowActionReceipt(tx, receipt.receiptId, result) : result;
    }
    if (input.expectedStatus && scope.primaryOrder.packStatus !== input.expectedStatus) {
      throw new Error("Order changed; scan again before acting.");
    }
    assertOrderPackScopeEligible(scope);
    const verifiedOrderIds = scope.shipmentOrders.filter(order => order.packStatus !== "PACKED").map((order) => order.id);
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
      data: scope.shipmentOrders.filter(order => verifiedOrderIds.includes(order.id)).map((order) => ({
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

    const result = {
      packedCount: update.count,
      skippedCount: 0,
      scopedCount: verifiedOrderIds.length,
      totalQuantity: scope.totalQuantity,
      packTaskIds: packTasks.map(task => task.id),
      idempotent: false
    };
    return receipt ? completeWorkflowActionReceipt(tx, receipt.receiptId, result) : result;
}
