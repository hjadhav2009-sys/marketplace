import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

const orderPackScopeSelect = {
  id: true,
  accountId: true,
  marketplace: true,
  trackingId: true,
  awb: true,
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
      primaryOrder.marketplace === "FLIPKART" && primaryOrder.trackingId
        ? {
            accountId: input.accountId,
            marketplace: "FLIPKART",
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
