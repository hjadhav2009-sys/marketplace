import type { Marketplace } from "@prisma/client";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";
import type { PickSourceSummary } from "./pick-workspace";

export const PACK_SOURCES = ["ORDER", "CONSIGNMENT"] as const;
export type PackSource = (typeof PACK_SOURCES)[number];
export type PackSummary = Record<PackSource, PickSourceSummary>;

export function supportedPackSources(marketplace: Marketplace): PackSource[] {
  const capabilities = marketplaceCapabilities(marketplace);
  return PACK_SOURCES.filter((source) => source === "ORDER" ? capabilities.dailyOrders : capabilities.consignments);
}

export function packSourceLabel(source: PackSource) {
  return source === "ORDER" ? "Customer Orders" : "Consignments";
}

export function resolvePackSource(input: { requestedSource?: string; summary: PackSummary; supportedSources: readonly PackSource[] }) {
  const supportedSources = [...input.supportedSources];
  const activeSources = supportedSources.filter((source) => input.summary[source].cardCount > 0);
  const requestedSource = PACK_SOURCES.includes(input.requestedSource as PackSource) && supportedSources.includes(input.requestedSource as PackSource)
    ? input.requestedSource as PackSource
    : null;
  const selectedSource = requestedSource
    ?? (activeSources.length === 1 ? activeSources[0] : null)
    ?? (activeSources.length > 1 ? null : supportedSources.length === 1 ? supportedSources[0] : null);
  return { activeSources, requestedSource, selectedSource, supportedSources };
}

export function combinedPackMetrics(summary: PackSummary, sources: readonly PackSource[]) {
  return sources.reduce((total, source) => ({
    openWork: total.openWork + summary[source].cardCount,
    requiredQuantity: total.requiredQuantity + summary[source].requiredQuantity,
    problems: total.problems + summary[source].problems,
    assignedToMe: total.assignedToMe + summary[source].assignedToMe,
  }), { openWork: 0, requiredQuantity: 0, problems: 0, assignedToMe: 0 });
}
