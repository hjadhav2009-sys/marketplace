import type { PackStatus } from "@prisma/client";
import { normalizeAwb } from "@/lib/awb";

export type AwbSearchCandidate = {
  id: string;
  accountId: string;
  awb: string;
  marketplace?: string | null;
  trackingId?: string | null;
  sku: string;
  qty: number;
  color?: string | null;
  courier?: string | null;
  packStatus: PackStatus;
  imageUrl?: string | null;
  createdAt?: Date;
};

export type AwbSearchSuggestion = AwbSearchCandidate & {
  matchType: "EXACT" | "SUFFIX" | "CONTAINS";
  matchedField: "AWB" | "TRACKING_ID";
};

function matchType(value: string, query: string): AwbSearchSuggestion["matchType"] | null {
  if (value === query) {
    return "EXACT";
  }

  if (value.endsWith(query)) {
    return "SUFFIX";
  }

  if (value.includes(query)) {
    return "CONTAINS";
  }

  return null;
}

function rank(value: AwbSearchSuggestion["matchType"]) {
  if (value === "EXACT") {
    return 0;
  }

  if (value === "SUFFIX") {
    return 1;
  }

  return 2;
}

export function findAwbSearchMatches(input: {
  candidates: AwbSearchCandidate[];
  accountId: string;
  query: string;
  limit?: number;
}) {
  const query = normalizeAwb(input.query);

  if (query.length < 5) {
    return [] as AwbSearchSuggestion[];
  }

  return input.candidates
    .filter((candidate) => candidate.accountId === input.accountId)
    .map((candidate) => {
      const trackingType = candidate.trackingId ? matchType(normalizeAwb(candidate.trackingId), query) : null;
      const awbType = matchType(normalizeAwb(candidate.awb), query);

      if (trackingType) {
        return { ...candidate, matchType: trackingType, matchedField: "TRACKING_ID" } satisfies AwbSearchSuggestion;
      }

      return awbType ? ({ ...candidate, matchType: awbType, matchedField: "AWB" } satisfies AwbSearchSuggestion) : null;
    })
    .filter((candidate): candidate is AwbSearchSuggestion => Boolean(candidate))
    .sort((left, right) => rank(left.matchType) - rank(right.matchType) || left.awb.localeCompare(right.awb))
    .slice(0, input.limit ?? 10);
}
