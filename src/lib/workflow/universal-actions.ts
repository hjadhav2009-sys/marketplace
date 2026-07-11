import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { claimWorkTask, completeWorkTask, incrementWorkTaskProgress } from "./task-store";
import { getAuthorizedWorkAccounts } from "./universal-resolver";
import { assertOrderPackScopeEligible, maskOperationalCode, resolveOrderPackScope } from "./order-pack-scope";

type Client = PrismaClient;
export type UniversalCandidateAction = "ORDER_PICK" | "ORDER_PACK" | "TASK_CLAIM" | "TASK_INCREMENT" | "TASK_COMPLETE";
const UNIVERSAL_ACTIONS = new Set<UniversalCandidateAction>(["ORDER_PICK", "ORDER_PACK", "TASK_CLAIM", "TASK_INCREMENT", "TASK_COMPLETE"]);

export async function applyUniversalCandidateAction(input: {
  actorUserId: string;
  accountId: string;
  sourceId: string;
  action: UniversalCandidateAction;
  expectedQuantity?: number;
  expectedStatus?: string;
  clientRequestId: string;
}, client: Client = prisma) {
  if (!UNIVERSAL_ACTIONS.has(input.action) || !input.clientRequestId.trim()) throw new Error("Universal action request is invalid.");
  const scope = await getAuthorizedWorkAccounts(input.actorUserId, client);
  if (!scope.accounts.some((account) => account.id === input.accountId)) throw new Error("This account is no longer assigned to you.");

  if (input.action.startsWith("TASK_")) {
    if (input.action === "TASK_CLAIM") return claimWorkTask({ taskId: input.sourceId, accountId: input.accountId, actorUserId: input.actorUserId, clientRequestId: input.clientRequestId }, client);
    if (input.action === "TASK_INCREMENT") return incrementWorkTaskProgress({ taskId: input.sourceId, accountId: input.accountId, actorUserId: input.actorUserId, expectedQuantity: input.expectedQuantity ?? -1, increment: 1, clientRequestId: input.clientRequestId }, client);
    return completeWorkTask({ taskId: input.sourceId, accountId: input.accountId, actorUserId: input.actorUserId, expectedQuantity: input.expectedQuantity ?? -1, clientRequestId: input.clientRequestId }, client);
  }

  const order = await client.order.findFirst({
    where: { id: input.sourceId, accountId: input.accountId },
    select: { id: true, accountId: true, awb: true, trackingId: true, marketplace: true, pickStatus: true, packStatus: true }
  });
  if (!order) throw new Error("Order is no longer available in this account.");

  if (input.action === "ORDER_PICK") {
    if (!hasWorkPermission(scope.user, "canPick")) throw new Error("Order picking permission is required.");
    if (order.pickStatus === "PICKED") return { updatedCount: 0, idempotent: true };
    if (input.expectedStatus && order.pickStatus !== input.expectedStatus) throw new Error("Order changed; scan again before acting.");
    const updated = await client.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id: order.id, accountId: input.accountId, pickStatus: "READY", packStatus: { not: "PACKED" } }, data: { pickStatus: "PICKED" } });
      if (!changed.count) return 0;
      await tx.auditLog.create({ data: { userId: scope.user.id, accountId: input.accountId, action: "UNIVERSAL_ORDER_PICKED", entityType: "Order", entityId: order.id, metadata: JSON.stringify({ source: "universal-scan" }) } });
      return changed.count;
    });
    if (!updated) throw new Error("Order changed; scan again before acting.");
    return { updatedCount: updated, idempotent: false };
  }

  if (!hasWorkPermission(scope.user, "canPack")) throw new Error("Order packing permission is required.");
  if (order.packStatus === "PACKED") return { updatedCount: 0, idempotent: true };
  const updated = await client.$transaction(async (tx) => {
    const transactionScope = await getAuthorizedWorkAccounts(input.actorUserId, tx);
    if (!transactionScope.accounts.some((account) => account.id === input.accountId)) {
      throw new Error("This account is no longer assigned to you.");
    }
    if (!hasWorkPermission(transactionScope.user, "canPack")) throw new Error("Order packing permission is required.");

    const shipmentScope = await resolveOrderPackScope({ accountId: input.accountId, orderId: input.sourceId }, tx);
    if (shipmentScope.primaryOrder.packStatus === "PACKED") return 0;
    if (input.expectedStatus && shipmentScope.primaryOrder.packStatus !== input.expectedStatus) {
      throw new Error("Order changed; scan again before acting.");
    }
    assertOrderPackScopeEligible(shipmentScope);

    const shipmentIds = shipmentScope.shipmentOrders.map((item) => item.id);
    const changed = await tx.order.updateMany({
      where: {
        id: { in: shipmentIds },
        accountId: input.accountId,
        pickStatus: "PICKED",
        packStatus: "READY",
        status: { not: "PROBLEM" }
      },
      data: { status: "PACKED", packStatus: "PACKED", packedAt: new Date() }
    });
    if (changed.count !== shipmentIds.length) throw new Error("Shipment changed; scan again before packing.");

    await tx.scanLog.createMany({
      data: shipmentScope.shipmentOrders.map((item) => ({
        accountId: input.accountId,
        orderId: item.id,
        awb: item.trackingId ?? item.awb,
        outcome: "PACKED" as const,
        scannedById: transactionScope.user.id,
        note: "Universal scanner explicit pack action."
      }))
    });
    await tx.auditLog.create({
      data: {
        userId: transactionScope.user.id,
        accountId: input.accountId,
        action: "UNIVERSAL_ORDER_PACKED",
        entityType: "OrderShipment",
        entityId: shipmentScope.primaryOrder.id,
        metadata: JSON.stringify({
          source: "universal-scan",
          shipmentCount: changed.count,
          totalQuantity: shipmentScope.totalQuantity,
          trackingIdMasked: maskOperationalCode(shipmentScope.primaryOrder.trackingId)
        })
      }
    });
    return changed.count;
  });
  return { updatedCount: updated, idempotent: updated === 0 };
}
