import type { ParseIssue } from "@/lib/parsers/meesho";
import { normalizeSkuForMatching } from "@/lib/sku";

export const blockingPreviewIssueTypes = new Set(["MISSING_AWB", "MISSING_SKU", "LOW_CONFIDENCE"]);
export const reviewProblemIssueTypes = new Set(["UNKNOWN_LAYOUT_ROW", "MISSING_AWB", "MISSING_SKU", "LOW_CONFIDENCE"]);
export const importPreviewSourceTypes = ["LABEL", "MANIFEST_ORDER"] as const;

export type ImportPreviewSourceType = (typeof importPreviewSourceTypes)[number];
export type PreviewImportStatsRow = {
  sourceType: string;
  awb?: string | null;
  sku?: string | null;
  imported?: boolean | null;
  issues?: Pick<ParseIssue, "issueType">[] | string | null;
  parsedIssues?: Pick<ParseIssue, "issueType">[];
};

export function isOrderPreviewSourceType(sourceType: string) {
  return sourceType === "LABEL" || sourceType === "MANIFEST_ORDER";
}

export function normalizeImportPreviewSourceType(value: string | null | undefined): ImportPreviewSourceType | undefined {
  return value === "LABEL" || value === "MANIFEST_ORDER" ? value : undefined;
}

export function getPreviewImportSourceType(
  rows: Pick<PreviewImportStatsRow, "sourceType">[],
  preferredSourceType?: string | null
): ImportPreviewSourceType {
  return normalizeImportPreviewSourceType(preferredSourceType) ?? (rows.some((row) => row.sourceType === "LABEL") ? "LABEL" : "MANIFEST_ORDER");
}

export function previewImportSourceLabel(sourceType: ImportPreviewSourceType) {
  return sourceType === "LABEL" ? "label" : "manifest";
}

export function previewRowIssues(row: PreviewImportStatsRow) {
  return row.parsedIssues ?? (Array.isArray(row.issues) ? row.issues : []);
}

export function hasBlockingPreviewIssue(issues: Pick<ParseIssue, "issueType">[]) {
  return issues.some((issue) => blockingPreviewIssueTypes.has(issue.issueType));
}

export function canImportPreviewRow(row: PreviewImportStatsRow) {
  return !row.imported && Boolean(row.awb) && Boolean(row.sku) && !hasBlockingPreviewIssue(previewRowIssues(row));
}

export function buildPreviewImportStats(rows: PreviewImportStatsRow[], preferredSourceType?: string | null) {
  const importSourceType = getPreviewImportSourceType(rows, preferredSourceType);
  const labelRows = rows.filter((row) => row.sourceType === "LABEL");
  const manifestRows = rows.filter((row) => row.sourceType === "MANIFEST_ORDER");
  const picklistSummaryRows = rows.filter((row) => row.sourceType === "PICKLIST_SUMMARY");
  const sourceRows = rows.filter((row) => row.sourceType === importSourceType);
  const readySourceRows = sourceRows.filter(canImportPreviewRow);
  const missingImageSkus = new Set(
    readySourceRows
      .filter((row) => previewRowIssues(row).some((issue) => issue.issueType === "MISSING_IMAGE_MAPPING"))
      .map((row) => normalizeSkuForMatching(row.sku))
      .filter(Boolean)
  );

  return {
    importSourceType,
    labelOrderRows: labelRows.length,
    manifestOrderRows: manifestRows.length,
    picklistSummaryRows: picklistSummaryRows.length,
    importSourceRows: sourceRows.length,
    importableOrderRows: readySourceRows.length,
    existingDuplicateRows: readySourceRows.filter((row) => previewRowIssues(row).some((issue) => issue.issueType === "DUPLICATE_EXISTING_AWB")).length,
    blockingRows: sourceRows.filter((row) => !row.imported && hasBlockingPreviewIssue(previewRowIssues(row))).length,
    missingImageRows: readySourceRows.filter((row) => previewRowIssues(row).some((issue) => issue.issueType === "MISSING_IMAGE_MAPPING")).length,
    missingImageSkus: missingImageSkus.size
  };
}

export function selectPreviewRowsForImport<T extends PreviewImportStatsRow>(
  rows: T[],
  preferredSourceType?: string | null
) {
  const importSourceType = getPreviewImportSourceType(rows, preferredSourceType);
  const seenAwbs = new Set<string>();
  const selectedRows: T[] = [];
  let heldBlockingRows = 0;

  for (const row of rows) {
    if (row.sourceType !== importSourceType || row.imported) {
      continue;
    }

    if (!canImportPreviewRow(row)) {
      heldBlockingRows += 1;
      continue;
    }

    const awb = row.awb as string;

    if (seenAwbs.has(awb)) {
      continue;
    }

    seenAwbs.add(awb);
    selectedRows.push(row);
  }

  return {
    importSourceType,
    rows: selectedRows,
    heldBlockingRows
  };
}

export function reviewProblemIssues<T extends Pick<ParseIssue, "issueType">>(issues: T[]) {
  return issues.filter((issue) => reviewProblemIssueTypes.has(issue.issueType));
}

export function canImportPreviewIssues(issues: Pick<ParseIssue, "issueType">[]) {
  return !hasBlockingPreviewIssue(issues);
}
