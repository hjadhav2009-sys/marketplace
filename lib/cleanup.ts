import { cleanupTargetLabels, cutoffDate, type CleanupTarget, RETENTION_DAYS } from "./retention";
import { prisma } from "./prisma";

export type CleanupCount = {
  target: CleanupTarget;
  label: string;
  retentionDays: number;
  cutoff: Date;
  count: number;
};

export function cleanupCutoffs(now = new Date()) {
  return {
    previewRows: cutoffDate(RETENTION_DAYS.previewRows, now),
    importIssues: cutoffDate(RETENTION_DAYS.importIssues, now),
    scanLogs: cutoffDate(RETENTION_DAYS.scanLogs, now),
    auditLogs: cutoffDate(RETENTION_DAYS.auditLogs, now)
  } satisfies Record<CleanupTarget, Date>;
}

export async function getCleanupCounts(now = new Date()): Promise<CleanupCount[]> {
  const cutoffs = cleanupCutoffs(now);
  const [previewRows, importIssues, scanLogs, auditLogs] = await Promise.all([
    prisma.uploadPreviewRow.count({ where: { createdAt: { lt: cutoffs.previewRows } } }),
    prisma.importRowIssue.count({ where: { createdAt: { lt: cutoffs.importIssues } } }),
    prisma.scanLog.count({ where: { createdAt: { lt: cutoffs.scanLogs } } }),
    prisma.auditLog.count({ where: { createdAt: { lt: cutoffs.auditLogs } } })
  ]);

  return [
    {
      target: "previewRows",
      label: cleanupTargetLabels.previewRows,
      retentionDays: RETENTION_DAYS.previewRows,
      cutoff: cutoffs.previewRows,
      count: previewRows
    },
    {
      target: "importIssues",
      label: cleanupTargetLabels.importIssues,
      retentionDays: RETENTION_DAYS.importIssues,
      cutoff: cutoffs.importIssues,
      count: importIssues
    },
    {
      target: "scanLogs",
      label: cleanupTargetLabels.scanLogs,
      retentionDays: RETENTION_DAYS.scanLogs,
      cutoff: cutoffs.scanLogs,
      count: scanLogs
    },
    {
      target: "auditLogs",
      label: cleanupTargetLabels.auditLogs,
      retentionDays: RETENTION_DAYS.auditLogs,
      cutoff: cutoffs.auditLogs,
      count: auditLogs
    }
  ];
}

export async function cleanupTarget(target: CleanupTarget, now = new Date()) {
  const cutoffs = cleanupCutoffs(now);

  if (target === "previewRows") {
    return prisma.uploadPreviewRow.deleteMany({ where: { createdAt: { lt: cutoffs.previewRows } } });
  }

  if (target === "importIssues") {
    return prisma.importRowIssue.deleteMany({ where: { createdAt: { lt: cutoffs.importIssues } } });
  }

  if (target === "scanLogs") {
    return prisma.scanLog.deleteMany({ where: { createdAt: { lt: cutoffs.scanLogs } } });
  }

  return prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoffs.auditLogs } } });
}
