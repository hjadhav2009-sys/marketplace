import type { Marketplace } from "@prisma/client";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";
import type { PickSourceSummary } from "./pick-workspace";

export const ASSEMBLY_SOURCES = ["ORDER", "CONSIGNMENT"] as const;
export type AssemblySource = (typeof ASSEMBLY_SOURCES)[number];
export type AssemblySummary = Record<AssemblySource, PickSourceSummary>;

export function supportedAssemblySources(marketplace: Marketplace): AssemblySource[] {
  const capabilities = marketplaceCapabilities(marketplace);
  return ASSEMBLY_SOURCES.filter((source) => source === "ORDER" ? capabilities.dailyOrders : capabilities.consignments);
}

export function assemblySourceLabel(source: AssemblySource) {
  return source === "ORDER" ? "Customer Orders" : "Consignments";
}

export function resolveAssemblySource(input: { requestedSource?: string; summary: AssemblySummary; supportedSources: readonly AssemblySource[] }) {
  const supportedSources = [...input.supportedSources];
  const activeSources = supportedSources.filter((source) => input.summary[source].cardCount > 0);
  const requestedSource = ASSEMBLY_SOURCES.includes(input.requestedSource as AssemblySource)
    && supportedSources.includes(input.requestedSource as AssemblySource)
    ? input.requestedSource as AssemblySource
    : null;
  const selectedSource = requestedSource
    ?? (activeSources.length === 1 ? activeSources[0] : null)
    ?? (activeSources.length > 1 ? null : supportedSources.length === 1 ? supportedSources[0] : null);
  return { activeSources, requestedSource, selectedSource, supportedSources };
}

export function combinedAssemblyMetrics(summary: AssemblySummary, sources: readonly AssemblySource[]) {
  return sources.reduce((total, source) => ({
    openWork: total.openWork + summary[source].cardCount,
    requiredQuantity: total.requiredQuantity + summary[source].requiredQuantity,
    problems: total.problems + summary[source].problems,
    assignedToMe: total.assignedToMe + summary[source].assignedToMe,
  }), { openWork: 0, requiredQuantity: 0, problems: 0, assignedToMe: 0 });
}
