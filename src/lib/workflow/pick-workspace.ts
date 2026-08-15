import type { Marketplace } from "@prisma/client";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";

export const PICK_SOURCES = ["ORDER", "CONSIGNMENT"] as const;
export type PickSource = (typeof PICK_SOURCES)[number];

export type PickSourceSummary = {
  cardCount: number;
  itemCount: number;
  requiredQuantity: number;
  problems: number;
  assignedToMe: number;
  oldestWaitingAt: string | null;
  projectionUnavailable: boolean;
  projectionState: string;
};

export type PickSummary = Record<PickSource, PickSourceSummary>;

export function supportedPickSources(marketplace: Marketplace): PickSource[] {
  const capabilities = marketplaceCapabilities(marketplace);
  return PICK_SOURCES.filter((source) => source === "ORDER" ? capabilities.dailyOrders : capabilities.consignments);
}

export function pickSourceLabel(source: PickSource) {
  return source === "ORDER" ? "Customer Orders" : "Consignments";
}

export function resolvePickSource(input: {
  requestedSource?: string;
  summary: PickSummary;
  supportedSources: readonly PickSource[];
}) {
  const supportedSources = [...input.supportedSources];
  const activeSources = supportedSources.filter((source) => input.summary[source].cardCount > 0);
  const requestedSource = PICK_SOURCES.includes(input.requestedSource as PickSource)
    && supportedSources.includes(input.requestedSource as PickSource)
    ? input.requestedSource as PickSource
    : null;

  const selectedSource = requestedSource
    ?? (activeSources.length === 1 ? activeSources[0] : null)
    ?? (activeSources.length > 1 ? supportedSources.find((source) => activeSources.includes(source)) ?? activeSources[0] : null)
    ?? (supportedSources.length === 1 ? supportedSources[0] : null);

  return { activeSources, requestedSource, selectedSource, supportedSources };
}
