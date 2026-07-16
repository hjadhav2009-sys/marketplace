import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { claimWorkTask, completeWorkTask, incrementWorkTaskProgress } from "./task-store";
import { getAuthorizedWorkAccounts } from "./universal-resolver";
import { packCustomerOrderShipmentSafely } from "./order-pack-scope";
import { claimOrderAssemblyTask, completeOrderAssemblyTask, reportOrderAssemblyProblem, sendOrderToAssembly } from "./order-assembly";
import { completePickWithNextRoute } from "./route-selection";
import { markCustomerOrdersPickedSafely } from "./order-picking";
import { completeOrderMarkingTask } from "./order-route-tasks";

type Client = PrismaClient;
export type UniversalCandidateAction = "ORDER_PICK" | "ORDER_PICK_ROUTE" | "ORDER_MARK_COMPLETE" | "ORDER_PACK" | "ASSEMBLY_SEND" | "ASSEMBLY_CLAIM" | "ASSEMBLY_COMPLETE" | "ASSEMBLY_PROBLEM" | "TASK_PICK_ROUTE" | "TASK_CLAIM" | "TASK_INCREMENT" | "TASK_COMPLETE";
const UNIVERSAL_ACTIONS = new Set<UniversalCandidateAction>(["ORDER_PICK", "ORDER_PICK_ROUTE", "ORDER_MARK_COMPLETE", "ORDER_PACK", "ASSEMBLY_SEND", "ASSEMBLY_CLAIM", "ASSEMBLY_COMPLETE", "ASSEMBLY_PROBLEM", "TASK_PICK_ROUTE", "TASK_CLAIM", "TASK_INCREMENT", "TASK_COMPLETE"]);

export async function applyUniversalCandidateAction(input: {
  actorUserId: string;
  accountId: string;
  sourceId: string;
  action: UniversalCandidateAction;
  expectedQuantity?: number;
  expectedStatus?: string;
  clientRequestId: string;
  manualTitle?: string;
  manualInstructions?: string;
  manualImageUrl?: string;
  route?: string;
}, client: Client = prisma) {
  if (!UNIVERSAL_ACTIONS.has(input.action) || !input.clientRequestId.trim()) throw new Error("Universal action request is invalid.");
  const scope = await getAuthorizedWorkAccounts(input.actorUserId, client);
  if (!scope.accounts.some((account) => account.id === input.accountId)) throw new Error("This account is no longer assigned to you.");

  if (input.action === "ASSEMBLY_SEND") return sendOrderToAssembly({ actorUserId: input.actorUserId, accountId: input.accountId, orderId: input.sourceId, manualTitle: input.manualTitle, manualInstructions: input.manualInstructions, manualImageUrl: input.manualImageUrl, clientRequestId: input.clientRequestId }, client);
  if (input.action === "ASSEMBLY_CLAIM") return claimOrderAssemblyTask({ actorUserId: input.actorUserId, accountId: input.accountId, taskId: input.sourceId, clientRequestId: input.clientRequestId }, client);
  if (input.action === "ASSEMBLY_COMPLETE") return completeOrderAssemblyTask({ actorUserId: input.actorUserId, accountId: input.accountId, taskId: input.sourceId, expectedStatus: input.expectedStatus ?? "", clientRequestId: input.clientRequestId }, client);
  if (input.action === "ASSEMBLY_PROBLEM") return reportOrderAssemblyProblem({ actorUserId: input.actorUserId, accountId: input.accountId, taskId: input.sourceId, expectedStatus: input.expectedStatus ?? "", reason: "OTHER", note: "Reported from universal scanner.", clientRequestId: input.clientRequestId }, client);
  if (input.action === "TASK_PICK_ROUTE") return completePickWithNextRoute({ sourceType:"CONSIGNMENT", taskId: input.sourceId, accountId: input.accountId, actorUserId: input.actorUserId, expectedQuantity: input.expectedQuantity ?? -1, route: input.route ?? "", clientRequestId: input.clientRequestId }, client);
  if (input.action === "ORDER_PICK_ROUTE") return completePickWithNextRoute({ sourceType:"ORDER", orderIds: [input.sourceId], accountId: input.accountId, actorUserId: input.actorUserId, route: input.route ?? "", clientRequestId: input.clientRequestId }, client);
  if (input.action === "ORDER_MARK_COMPLETE") return completeOrderMarkingTask({ taskId: input.sourceId, accountId: input.accountId, actorUserId: input.actorUserId, expectedStatus: input.expectedStatus ?? "", clientRequestId: input.clientRequestId }, client);

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

  // Backward-compatible non-UI action for already deployed clients. New web UI always uses ORDER_PICK_ROUTE.
  if (input.action === "ORDER_PICK") {
    if (!hasWorkPermission(scope.user, "canPick")) throw new Error("Order picking permission is required.");
    if (order.pickStatus === "PICKED") return { updatedCount: 0, idempotent: true };
    const result = await markCustomerOrdersPickedSafely({ actorUserId: input.actorUserId, accountId: input.accountId, where: { id: input.sourceId }, source: "universal-scan", expectedStatus: input.expectedStatus, clientRequestId: input.clientRequestId }, client);
    return { updatedCount: result.updatedCount, idempotent: result.idempotent };
  }

  if (!hasWorkPermission(scope.user, "canPack")) throw new Error("Order packing permission is required.");
  if (order.packStatus === "PACKED") return { updatedCount: 0, idempotent: true };
  const result = await packCustomerOrderShipmentSafely({ actorUserId: input.actorUserId, accountId: input.accountId, orderId: input.sourceId, expectedStatus: input.expectedStatus, source: "universal-scan", clientRequestId: input.clientRequestId }, client);
  return { updatedCount: result.packedCount, idempotent: result.idempotent };
}
