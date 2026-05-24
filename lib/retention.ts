export const RETENTION_DAYS = {
  previewRows: 30,
  importIssues: 60,
  scanLogs: 90,
  auditLogs: 180
} as const;

export type CleanupTarget = keyof typeof RETENTION_DAYS;

export const cleanupTargetLabels: Record<CleanupTarget, string> = {
  previewRows: "old upload preview rows",
  importIssues: "old import row issues",
  scanLogs: "old scan logs",
  auditLogs: "old audit logs"
};

export function cutoffDate(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isCleanupConfirmationValid(value: unknown) {
  return String(value ?? "").trim() === "CLEANUP";
}

export function isCleanupTarget(value: unknown): value is CleanupTarget {
  return value === "previewRows" || value === "importIssues" || value === "scanLogs" || value === "auditLogs";
}
