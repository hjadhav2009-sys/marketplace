import type { ParseIssue } from "@/lib/parsers/meesho";

export const blockingPreviewIssueTypes = new Set(["MISSING_AWB", "MISSING_SKU", "LOW_CONFIDENCE"]);
export const reviewProblemIssueTypes = new Set(["UNKNOWN_LAYOUT_ROW", "MISSING_AWB", "MISSING_SKU", "LOW_CONFIDENCE"]);

export function isOrderPreviewSourceType(sourceType: string) {
  return sourceType === "LABEL" || sourceType === "MANIFEST_ORDER";
}

export function hasBlockingPreviewIssue(issues: Pick<ParseIssue, "issueType">[]) {
  return issues.some((issue) => blockingPreviewIssueTypes.has(issue.issueType));
}

export function reviewProblemIssues<T extends Pick<ParseIssue, "issueType">>(issues: T[]) {
  return issues.filter((issue) => reviewProblemIssueTypes.has(issue.issueType));
}

export function canImportPreviewIssues(issues: Pick<ParseIssue, "issueType">[]) {
  return !hasBlockingPreviewIssue(issues);
}
