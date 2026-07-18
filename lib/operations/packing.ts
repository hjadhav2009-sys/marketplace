import type { PackStatus } from "@prisma/client";

export type ConfirmPackedScopeOrder = {
  id: string;
  accountId: string;
  marketplace?: string | null;
  trackingId?: string | null;
  packStatus: PackStatus;
};

export function canConfirmPacked(order: { packStatus: PackStatus }) {
  return order.packStatus === "READY";
}

/** @deprecated Read-only scope compatibility only. Packing mutations must use packCustomerOrderShipmentSafely. */
export function buildConfirmPackedOrderWhere(order: { id: string; marketplace?: string | null; trackingId?: string | null }, accountId: string) {
  return ["FLIPKART", "AMAZON"].includes(order.marketplace ?? "") && order.trackingId
    ? {
        accountId,
        marketplace: order.marketplace,
        trackingId: order.trackingId,
        packStatus: "READY" as const
      }
    : {
        id: order.id,
        accountId,
        packStatus: "READY" as const
      };
}

export function isInConfirmPackedScope(target: ConfirmPackedScopeOrder, candidate: ConfirmPackedScopeOrder) {
  if (candidate.packStatus !== "READY" || candidate.accountId !== target.accountId) {
    return false;
  }

  if (["FLIPKART", "AMAZON"].includes(target.marketplace ?? "") && target.trackingId) {
    return candidate.marketplace === target.marketplace && candidate.trackingId === target.trackingId;
  }

  return candidate.id === target.id;
}

export function selectConfirmPackedOrderIds(target: ConfirmPackedScopeOrder, candidates: ConfirmPackedScopeOrder[]) {
  return candidates.filter((candidate) => isInConfirmPackedScope(target, candidate)).map((candidate) => candidate.id);
}

export function packingResultLabel(order: { packStatus: PackStatus }) {
  if (order.packStatus === "PACKED") {
    return "Already packed";
  }

  if (order.packStatus === "PROBLEM") {
    return "Problem order";
  }

  return "Ready to pack";
}
