import type { Marketplace } from "@prisma/client";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";
import type { PickSourceSummary } from "./pick-workspace";

export const MARK_SOURCES = ["ORDER", "CONSIGNMENT"] as const;
export type MarkSource = (typeof MARK_SOURCES)[number];
export type MarkSummary = Record<MarkSource, PickSourceSummary>;

export function supportedMarkSources(marketplace: Marketplace): MarkSource[] {
  const capabilities = marketplaceCapabilities(marketplace);
  return MARK_SOURCES.filter((source) => source === "ORDER" ? capabilities.dailyOrders : capabilities.consignments);
}

export function markSourceLabel(source: MarkSource) {
  return source === "ORDER" ? "Customer Orders" : "Consignments";
}

export function resolveMarkSource(input: { requestedSource?: string; summary: MarkSummary; supportedSources: readonly MarkSource[] }) {
  const supportedSources = [...input.supportedSources];
  const activeSources = supportedSources.filter((source) => input.summary[source].cardCount > 0);
  const requestedSource = MARK_SOURCES.includes(input.requestedSource as MarkSource) && supportedSources.includes(input.requestedSource as MarkSource)
    ? input.requestedSource as MarkSource
    : null;
  const selectedSource = requestedSource ?? (activeSources.length === 1 ? activeSources[0] : null);
  return { activeSources, requestedSource, selectedSource, supportedSources };
}

export function combinedMarkMetrics(summary: MarkSummary, sources: readonly MarkSource[]) {
  return sources.reduce((total, source) => ({
    openWork: total.openWork + summary[source].cardCount,
    requiredQuantity: total.requiredQuantity + summary[source].requiredQuantity,
    problems: total.problems + summary[source].problems,
    assignedToMe: total.assignedToMe + summary[source].assignedToMe,
  }), { openWork: 0, requiredQuantity: 0, problems: 0, assignedToMe: 0 });
}
