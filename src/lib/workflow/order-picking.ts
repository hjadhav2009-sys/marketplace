import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { createAutomaticAssemblyTasksAfterPick } from "./order-assembly";
import { assertWorkerAccountAccess } from "./worker-access";

export type CustomerOrderPickSource = "picker-group" | "picker-card" | "universal-scan" | "mobile-api";

export async function markCustomerOrdersPickedSafely(input: {
  actorUserId: string;
  accountId: string;
  where: Prisma.OrderWhereInput;
  source: CustomerOrderPickSource;
  expectedStatus?: string;
  clientRequestId?: string;
}, client: PrismaClient = prisma) {
  const initial = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!hasWorkPermission(initial.user, "canPick")) throw new Error("Order picking permission is required.");
  return client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!hasWorkPermission(user, "canPick")) throw new Error("Order picking permission is required.");
    const orders = await tx.order.findMany({
      where: { accountId: input.accountId, AND: [input.where], packStatus: { not: "PACKED" } },
      select: { id: true, accountId: true, sku: true, qty: true, productDescription: true, imageUrl: true, pickStatus: true, packStatus: true }
    });
    if (input.expectedStatus && orders.some((order) => order.pickStatus !== input.expectedStatus && order.pickStatus !== "PICKED")) throw new Error("Order changed; scan again before acting.");
    const ready = orders.filter((order) => order.pickStatus === "READY" && order.packStatus === "READY");
    if (!ready.length) return { updatedCount: 0, assemblyTaskCount: 0, reviewCount: 0, idempotent: orders.some((order) => order.pickStatus === "PICKED") };
    const changed = await tx.order.updateMany({ where: { id: { in: ready.map((order) => order.id) }, accountId: input.accountId, pickStatus: "READY", packStatus: "READY" }, data: { pickStatus: "PICKED" } });
    if (changed.count !== ready.length) throw new Error("Order changed; refresh before picking.");
    const assembly = await createAutomaticAssemblyTasksAfterPick(tx, { actorUserId: user.id, accountId: input.accountId, orders: ready });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: input.source === "mobile-api" ? "MOBILE_SKU_GROUP_PICKED" : input.source === "universal-scan" ? "UNIVERSAL_ORDER_PICKED" : "SKU_GROUP_PICKED", entityType: "Order", metadata: JSON.stringify({ source: input.source, updatedRows: changed.count, assemblyTasksCreated: assembly.createdCount, assemblyReviewCount: assembly.reviewCount, clientRequestId: input.clientRequestId?.slice(0, 160) }) } });
    return { updatedCount: changed.count, assemblyTaskCount: assembly.createdCount, reviewCount: assembly.reviewCount, idempotent: false };
  });
}
