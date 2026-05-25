import type { PackStatus } from "@prisma/client";
import { normalizeAwb } from "@/lib/awb";

export type AwbSearchCandidate = {
  id: string;
  accountId: string;
  awb: string;
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
};

function matchType(awb: string, query: string): AwbSearchSuggestion["matchType"] | null {
  if (awb === query) {
    return "EXACT";
  }

  if (awb.endsWith(query)) {
    return "SUFFIX";
  }

  if (awb.includes(query)) {
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
      const type = matchType(normalizeAwb(candidate.awb), query);
      return type ? ({ ...candidate, matchType: type } satisfies AwbSearchSuggestion) : null;
    })
    .filter((candidate): candidate is AwbSearchSuggestion => Boolean(candidate))
    .sort((left, right) => rank(left.matchType) - rank(right.matchType) || left.awb.localeCompare(right.awb))
    .slice(0, input.limit ?? 10);
}
