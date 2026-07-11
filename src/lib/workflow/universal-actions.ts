import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { claimWorkTask, completeWorkTask, incrementWorkTaskProgress } from "./task-store";
import { getAuthorizedWorkAccounts } from "./universal-resolver";
import { packCustomerOrderShipmentSafely } from "./order-pack-scope";

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
    const result = await client.$transaction(async (tx) => {
      const transactionScope = await getAuthorizedWorkAccounts(input.actorUserId, tx);
      if (!transactionScope.accounts.some((account) => account.id === input.accountId)) throw new Error("This account is no longer assigned to you.");
      if (!hasWorkPermission(transactionScope.user, "canPick")) throw new Error("Order picking permission is required.");
      const currentOrder = await tx.order.findFirst({ where: { id: input.sourceId, accountId: input.accountId }, select: { id: true, pickStatus: true, packStatus: true } });
      if (!currentOrder) throw new Error("Order is no longer available in this account.");
      if (currentOrder.pickStatus === "PICKED") return { updatedCount: 0, idempotent: true };
      if (input.expectedStatus && currentOrder.pickStatus !== input.expectedStatus) throw new Error("Order changed; scan again before acting.");
      const changed = await tx.order.updateMany({ where: { id: currentOrder.id, accountId: input.accountId, pickStatus: "READY", packStatus: { not: "PACKED" } }, data: { pickStatus: "PICKED" } });
      if (!changed.count) throw new Error("Order changed; scan again before acting.");
      await tx.auditLog.create({ data: { userId: transactionScope.user.id, accountId: input.accountId, action: "UNIVERSAL_ORDER_PICKED", entityType: "Order", entityId: currentOrder.id, metadata: JSON.stringify({ source: "universal-scan" }) } });
      return { updatedCount: changed.count, idempotent: false };
    });
    return result;
  }

  if (!hasWorkPermission(scope.user, "canPack")) throw new Error("Order packing permission is required.");
  if (order.packStatus === "PACKED") return { updatedCount: 0, idempotent: true };
  const result = await packCustomerOrderShipmentSafely({ actorUserId: input.actorUserId, accountId: input.accountId, orderId: input.sourceId, expectedStatus: input.expectedStatus, source: "universal-scan", clientRequestId: input.clientRequestId }, client);
  return { updatedCount: result.packedCount, idempotent: result.idempotent };
}
