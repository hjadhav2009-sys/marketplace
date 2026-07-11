import type { IdentifierType } from "@prisma/client";

export type MatchCandidate = {
  id: string;
  sellerSkuId: string;
  sku: string;
  fsn: string | null;
  listingId: string | null;
};

export type ConsignmentMatchDecision =
  | { status: "EXACT_SKU" | "EXACT_FSN"; listing: MatchCandidate; identifierType: IdentifierType; warning?: string }
  | { status: "EXACT_MULTIPLE" | "IDENTIFIER_CONFLICT" | "NOT_FOUND"; listing: null; candidates: MatchCandidate[]; warning?: string };

function unique(candidates: MatchCandidate[]) {
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
}

export function decideConsignmentListingMatch(skuMatches: MatchCandidate[], fsnMatches: MatchCandidate[]): ConsignmentMatchDecision {
  const skus = unique(skuMatches);
  const fsns = unique(fsnMatches);
  if (skus.length === 1 && fsns.length === 1) {
    if (skus[0].id === fsns[0].id) return { status: "EXACT_SKU", listing: skus[0], identifierType: "SELLER_SKU" };
    return { status: "IDENTIFIER_CONFLICT", listing: null, candidates: unique([...skus, ...fsns]), warning: "SKU and FSN identify different listings." };
  }
  if (skus.length > 1 || fsns.length > 1) return { status: "EXACT_MULTIPLE", listing: null, candidates: unique([...skus, ...fsns]), warning: "Multiple exact listing matches require owner selection." };
  if (skus.length === 1) return { status: "EXACT_SKU", listing: skus[0], identifierType: "SELLER_SKU", warning: fsns.length === 0 ? "FSN did not confirm the SKU match." : undefined };
  if (fsns.length === 1) return { status: "EXACT_FSN", listing: fsns[0], identifierType: "FSN", warning: "SKU did not match; FSN provided a unique match." };
  return { status: "NOT_FOUND", listing: null, candidates: [], warning: "No exact account listing match was found." };
}
