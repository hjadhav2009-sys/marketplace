import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { buildOrderAssemblyMetadata } from "./order-assembly-metadata";

type Client = PrismaClient | Prisma.TransactionClient;
type PolicyOrder = { id: string; accountId: string; sku: string; productDescription?: string | null; imageUrl?: string | null };

type MatchedListing = {
  id: string;
  sellerSkuId: string;
  productTitle: string | null;
  mainImageUrl: string | null;
  processRules: Array<{
    id: string;
    route: "PICK_PACK" | "PICK_MARK_PACK" | "PICK_ASSEMBLE_PACK" | "PICK_MARK_ASSEMBLE_PACK";
    assemblyRequired: boolean;
    assemblyTitle: string | null;
    assemblyInstructions: string | null;
    assemblyImageUrl: string | null;
  }>;
};

export type OrderAssemblyPolicy =
  | { state: "NO_RULE"; orderId: string; listing?: MatchedListing }
  | { state: "READY_MADE"; orderId: string; listing: MatchedListing; rule: MatchedListing["processRules"][number] }
  | { state: "ASSEMBLY_REQUIRED"; orderId: string; listing: MatchedListing; rule: MatchedListing["processRules"][number] }
  | { state: "AMBIGUOUS_LISTING"; orderId: string }
  | { state: "UNSUPPORTED_ROUTE"; orderId: string; listing: MatchedListing; rule: MatchedListing["processRules"][number] }
  | { state: "INVALID_RULE"; orderId: string; listing: MatchedListing; rule?: MatchedListing["processRules"][number] };

const identifierTypes = ["SELLER_SKU", "INTERNAL_SKU"] as const;

export async function resolveOrderAssemblyPolicies(input: { accountId: string; orders: PolicyOrder[] }, client: Client = prisma) {
  const orders = input.orders.filter((order) => order.accountId === input.accountId);
  const lookups = [...new Map(orders.flatMap((order) => identifierTypes.flatMap((identifierType) => {
    const normalizedValue = normalizeListingIdentifier(identifierType, order.sku);
    return normalizedValue ? [[`${identifierType}:${normalizedValue}`, { identifierType, normalizedValue }] as const] : [];
  }))).values()];
  const rows = lookups.length ? await client.marketplaceListingIdentifier.findMany({
    where: { accountId: input.accountId, active: true, OR: lookups },
    select: {
      identifierType: true,
      normalizedValue: true,
      marketplaceListing: {
        select: {
          id: true, sellerSkuId: true, productTitle: true, mainImageUrl: true,
          processRules: { where: { active: true }, select: { id: true, route: true, assemblyRequired: true, assemblyTitle: true, assemblyInstructions: true, assemblyImageUrl: true }, take: 2, orderBy: { updatedAt: "desc" } }
        }
      }
    },
    take: Math.min(Math.max(lookups.length * 25, 25), 5_000)
  }) : [];
  const byIdentifier = new Map<string, MatchedListing[]>();
  for (const row of rows) {
    const key = `${row.identifierType}:${row.normalizedValue}`;
    const current = byIdentifier.get(key) ?? [];
    if (!current.some((listing) => listing.id === row.marketplaceListing.id)) current.push(row.marketplaceListing);
    byIdentifier.set(key, current);
  }

  const result = new Map<string, OrderAssemblyPolicy>();
  for (const order of orders) {
    let candidates: MatchedListing[] = [];
    for (const identifierType of identifierTypes) {
      const normalized = normalizeListingIdentifier(identifierType, order.sku);
      if (!normalized) continue;
      candidates = byIdentifier.get(`${identifierType}:${normalized}`) ?? [];
      if (candidates.length) break;
    }
    if (candidates.length > 1) { result.set(order.id, { state: "AMBIGUOUS_LISTING", orderId: order.id }); continue; }
    const listing = candidates[0];
    if (!listing) { result.set(order.id, { state: "NO_RULE", orderId: order.id }); continue; }
    if (listing.processRules.length > 1) { result.set(order.id, { state: "INVALID_RULE", orderId: order.id, listing }); continue; }
    const rule = listing.processRules[0];
    if (!rule) { result.set(order.id, { state: "NO_RULE", orderId: order.id, listing }); continue; }
    if (rule.route === "PICK_PACK") { result.set(order.id, { state: "READY_MADE", orderId: order.id, listing, rule }); continue; }
    if (rule.route !== "PICK_ASSEMBLE_PACK") { result.set(order.id, { state: "UNSUPPORTED_ROUTE", orderId: order.id, listing, rule }); continue; }
    try {
      buildOrderAssemblyMetadata({ source: "PROCESS_RULE", marketplaceListingId: listing.id, processRuleId: rule.id, assemblyTitle: rule.assemblyTitle ?? "Assembly", assemblyInstructions: rule.assemblyInstructions ?? rule.assemblyTitle ?? "", assemblyImageUrl: rule.assemblyImageUrl ?? undefined, sellerSkuSnapshot: order.sku, productTitleSnapshot: listing.productTitle ?? order.productDescription ?? undefined, productImageSnapshot: listing.mainImageUrl ?? order.imageUrl ?? undefined, requestedByUserId: "policy-validation", requiredByRule: true });
      if (!rule.assemblyRequired) throw new Error("Assembly flag missing");
      result.set(order.id, { state: "ASSEMBLY_REQUIRED", orderId: order.id, listing, rule });
    } catch {
      result.set(order.id, { state: "INVALID_RULE", orderId: order.id, listing, rule });
    }
  }
  return result;
}

export async function resolveOrderAssemblyPolicy(order: PolicyOrder, client: Client = prisma) {
  return (await resolveOrderAssemblyPolicies({ accountId: order.accountId, orders: [order] }, client)).get(order.id) ?? { state: "NO_RULE" as const, orderId: order.id };
}
