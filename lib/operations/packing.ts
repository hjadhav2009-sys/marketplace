import type { PackStatus } from "@prisma/client";

export function canConfirmPacked(order: { packStatus: PackStatus }) {
  return order.packStatus === "READY";
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
