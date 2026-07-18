export type ImportIssueKind = "warning" | "error";

const WARNING_MARKERS = ["DUPLICATE", "MISSING_IMAGE"] as const;

export function importIssueKind(issueType: string): ImportIssueKind {
  const normalized = issueType.trim().toUpperCase();
  return WARNING_MARKERS.some((marker) => normalized.includes(marker)) ? "warning" : "error";
}

export function importIssueKindWhere(kind: string | null | undefined) {
  const warningConditions = WARNING_MARKERS.map((marker) => ({ issueType: { contains: marker } }));

  if (kind === "warning") return { OR: warningConditions };
  if (kind === "error") return { NOT: { OR: warningConditions } };
  return undefined;
}
