import type { ParseIssue } from "@/lib/parsers/meesho";

export const blockingPreviewIssueTypes = new Set(["MISSING_AWB", "MISSING_SKU", "LOW_CONFIDENCE"]);

export function hasBlockingPreviewIssue(issues: Pick<ParseIssue, "issueType">[]) {
  return issues.some((issue) => blockingPreviewIssueTypes.has(issue.issueType));
}

export function canImportPreviewIssues(issues: Pick<ParseIssue, "issueType">[]) {
  return !hasBlockingPreviewIssue(issues);
}
