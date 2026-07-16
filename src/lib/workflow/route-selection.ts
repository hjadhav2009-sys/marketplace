import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type ProcessRoute, type WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assertWorkerAccountAccess } from "./worker-access";

type Client = PrismaClient;
type Transaction = Prisma.TransactionClient;

export const POST_PICK_ROUTES = ["DIRECT_PACK", "MARK", "ASSEMBLE", "MARK_ASSEMBLE"] as const;
export type PostPickRoute = (typeof POST_PICK_ROUTES)[number];

const ROUTE_TO_PROCESS: Record<PostPickRoute, ProcessRoute> = {
  DIRECT_PACK: "PICK_PACK",
  MARK: "PICK_MARK_PACK",
  ASSEMBLE: "PICK_ASSEMBLE_PACK",
  MARK_ASSEMBLE: "PICK_MARK_ASSEMBLE_PACK"
};

const ROUTE_STAGES: Record<PostPickRoute, WorkStage[]> = {
  DIRECT_PACK: ["PACK"],
  MARK: ["MARK", "PACK"],
  ASSEMBLE: ["ASSEMBLE", "PACK"],
  MARK_ASSEMBLE: ["MARK", "ASSEMBLE", "PACK"]
};

type RouteMetadata = {
  version: 1;
  routeChoice: PostPickRoute;
  processRoute: ProcessRoute;
  requestFingerprint: string;
};

function routeMetadata(value: string | null): RouteMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RouteMetadata>;
    return parsed.version === 1 && POST_PICK_ROUTES.includes(parsed.routeChoice as PostPickRoute) ? parsed as RouteMetadata : null;
  } catch {
    return null;
  }
}

function fingerprint(input: { sourceType: "ORDER" | "CONSIGNMENT"; sourceIds: string[]; route: PostPickRoute }) {
  return createHash("sha256").update(JSON.stringify({ ...input, sourceIds: [...input.sourceIds].sort() })).digest("hex");
}

function assertRoute(value: string): asserts value is PostPickRoute {
  if (!POST_PICK_ROUTES.includes(value as PostPickRoute)) throw new Error("Select a valid next route.");
}

async function routeTransaction<T>(client: Client, mutation: (tx: Transaction) => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await client.$transaction(mutation); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2002", "P2028", "P2034"].includes(error.code) || /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
      if (!transient) throw error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new Error(lastError instanceof Error && /database is locked/i.test(lastError.message) ? "Work is busy; retry the action." : "Route selection conflicted; refresh and retry.");
}

async function replaceDownstreamTasks(tx: Transaction, input: {
  accountId: string;
  actorUserId: string;
  sourceType: "ORDER" | "CONSIGNMENT";
  sourceId: string;
  quantity: number;
  route: PostPickRoute;
  requestFingerprint: string;
}) {
  const sourceWhere = input.sourceType === "ORDER" ? { orderId: input.sourceId } : { consignmentLineId: input.sourceId };
  const existing = await tx.workTask.findMany({ where: { accountId: input.accountId, ...sourceWhere, stage: { not: "PICK" } } });
  if (existing.some((task) => task.status !== "LOCKED" && task.status !== "READY" || task.completedQuantity > 0 || task.startedAt)) {
    throw new Error("Downstream work has already started; the route can no longer be changed.");
  }
  if (existing.length) await tx.workTask.deleteMany({ where: { id: { in: existing.map((task) => task.id) } } });

  const metadataJson = JSON.stringify({ version: 1, routeChoice: input.route, processRoute: ROUTE_TO_PROCESS[input.route], requestFingerprint: input.requestFingerprint } satisfies RouteMetadata);
  const stages = ROUTE_STAGES[input.route];
  for (let index = 0; index < stages.length; index += 1) {
    await tx.workTask.create({ data: {
      accountId: input.accountId,
      sourceType: input.sourceType,
      orderId: input.sourceType === "ORDER" ? input.sourceId : null,
      consignmentLineId: input.sourceType === "CONSIGNMENT" ? input.sourceId : null,
      stage: stages[index],
      sequenceNumber: index + 2,
      requiredQuantity: input.quantity,
      status: index === 0 ? "READY" : "LOCKED",
      metadataJson
    } });
  }
}

async function completePickTask(tx: Transaction, input: {
  accountId: string;
  actorUserId: string;
  sourceType: "ORDER" | "CONSIGNMENT";
  sourceId: string;
  quantity: number;
  route: PostPickRoute;
  requestFingerprint: string;
  clientRequestId?: string;
  existingTaskId?: string;
}) {
  const sourceWhere = input.sourceType === "ORDER" ? { orderId: input.sourceId } : { consignmentLineId: input.sourceId };
  let pick = input.existingTaskId
    ? await tx.workTask.findFirst({ where: { id: input.existingTaskId, accountId: input.accountId, sourceType: input.sourceType, stage: "PICK", ...sourceWhere } })
    : await tx.workTask.findFirst({ where: { accountId: input.accountId, sourceType: input.sourceType, stage: "PICK", ...sourceWhere } });

  const priorMetadata = routeMetadata(pick?.metadataJson ?? null);
  if (pick?.status === "COMPLETED") {
    if (priorMetadata?.routeChoice === input.route) return { taskId: pick.id, idempotent: true };
    throw new Error("Picking was already completed with a different route.");
  }
  if (pick && (pick.status === "PROBLEM" || pick.status === "CANCELLED" || pick.status === "SKIPPED")) throw new Error("Picking cannot be completed from its current state.");
  if (pick && pick.assignedUserId && pick.assignedUserId !== input.actorUserId) throw new Error("This picking work was taken by another worker.");

  await replaceDownstreamTasks(tx, input);
  const metadataJson = JSON.stringify({ version: 1, routeChoice: input.route, processRoute: ROUTE_TO_PROCESS[input.route], requestFingerprint: input.requestFingerprint } satisfies RouteMetadata);
  if (!pick) {
    pick = await tx.workTask.create({ data: {
      accountId: input.accountId, sourceType: input.sourceType,
      orderId: input.sourceType === "ORDER" ? input.sourceId : null,
      consignmentLineId: input.sourceType === "CONSIGNMENT" ? input.sourceId : null,
      stage: "PICK", sequenceNumber: 1, requiredQuantity: input.quantity,
      completedQuantity: input.quantity, status: "COMPLETED", assignedUserId: input.actorUserId,
      startedAt: new Date(), startedByUserId: input.actorUserId, completedAt: new Date(), completedByUserId: input.actorUserId,
      metadataJson
    } });
  } else {
    const changed = await tx.workTask.updateMany({ where: { id: pick.id, status: pick.status, completedQuantity: pick.completedQuantity }, data: {
      completedQuantity: pick.requiredQuantity, status: "COMPLETED", assignedUserId: pick.assignedUserId ?? input.actorUserId,
      startedAt: pick.startedAt ?? new Date(), startedByUserId: pick.startedByUserId ?? input.actorUserId,
      completedAt: new Date(), completedByUserId: input.actorUserId, metadataJson
    } });
    if (changed.count !== 1) throw new Error("Picking changed; refresh before choosing the route.");
  }
  await tx.workActionLog.create({ data: {
    accountId: input.accountId, taskId: pick.id, actorUserId: input.actorUserId, action: "TASK_COMPLETED",
    requestKind: input.clientRequestId ? "COMPLETE" : null, clientRequestId: input.clientRequestId || null,
    quantityBefore: pick.completedQuantity, quantityAfter: pick.requiredQuantity, metadataJson
  } });
  return { taskId: pick.id, idempotent: false };
}

export async function completeConsignmentPickWithRoute(input: {
  taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; route: string; clientRequestId?: string;
}, client: Client = prisma) {
  const route = input.route;
  assertRoute(route);
  return routeTransaction(client, async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!hasWorkPermission(user, "canPick")) throw new Error("Picking permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT", stage: "PICK" }, include: { consignmentLine: true } });
    if (!task?.consignmentLine || task.consignmentLine.accountId !== input.accountId) throw new Error("Picking task is unavailable.");
    if (task.completedQuantity !== input.expectedQuantity && task.status !== "COMPLETED") throw new Error("Picking changed; refresh before choosing the route.");
    const requestFingerprint = fingerprint({ sourceType: "CONSIGNMENT", sourceIds: [task.consignmentLine.id], route });
    const result = await completePickTask(tx, { accountId: input.accountId, actorUserId: user.id, sourceType: "CONSIGNMENT", sourceId: task.consignmentLine.id, quantity: task.requiredQuantity, route, requestFingerprint, clientRequestId: input.clientRequestId, existingTaskId: task.id });
    if (!result.idempotent) {
      await tx.consignmentLine.update({ where: { id: task.consignmentLine.id }, data: { processRoute: ROUTE_TO_PROCESS[route] } });
      await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "CONSIGNMENT_POST_PICK_ROUTE_SELECTED", entityType: "ConsignmentLine", entityId: task.consignmentLine.id, metadata: JSON.stringify({ route }) } });
    }
    return { ...result, route, processRoute: ROUTE_TO_PROCESS[route] };
  });
}

export async function completeOrderPickWithRoute(input: {
  orderIds: string[]; accountId: string; actorUserId: string; route: string; clientRequestId?: string;
}, client: Client = prisma) {
  const route = input.route;
  assertRoute(route);
  const uniqueIds = [...new Set(input.orderIds)].sort();
  if (!uniqueIds.length || uniqueIds.length > 500) throw new Error("Select between 1 and 500 order rows.");
  return routeTransaction(client, async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!hasWorkPermission(user, "canPick")) throw new Error("Picking permission is required.");
    const orders = await tx.order.findMany({ where: { id: { in: uniqueIds }, accountId: input.accountId } });
    if (orders.length !== uniqueIds.length) throw new Error("One or more orders are unavailable in the selected account.");
    if (orders.some((order) => order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PACKED")) throw new Error("Problem or packed orders cannot be routed.");
    const requestFingerprint = fingerprint({ sourceType: "ORDER", sourceIds: uniqueIds, route });
    let idempotent = true;
    for (const order of orders) {
      const result = await completePickTask(tx, { accountId: input.accountId, actorUserId: user.id, sourceType: "ORDER", sourceId: order.id, quantity: order.qty, route, requestFingerprint, clientRequestId: input.clientRequestId });
      idempotent = idempotent && result.idempotent;
    }
    if (!idempotent) {
      await tx.order.updateMany({ where: { id: { in: uniqueIds }, accountId: input.accountId }, data: { pickStatus: "PICKED", packStatus: "READY" } });
      await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "ORDER_POST_PICK_ROUTE_SELECTED", entityType: "OrderGroup", metadata: JSON.stringify({ route, orderCount: orders.length }) } });
    }
    return { updatedCount: idempotent ? 0 : orders.length, idempotent, route, processRoute: ROUTE_TO_PROCESS[route] };
  });
}

export function processRouteForPostPickRoute(route: PostPickRoute) { return ROUTE_TO_PROCESS[route]; }
