import type { ImportJobRecord } from "./store";
import { sanitizeImportJobError } from "./safe-error";

export { sanitizeImportJobError as sanitizePublicImportJobError } from "./safe-error";

export const PUBLIC_IMPORT_JOB_FIELDS = [
  "id",
  "marketplace",
  "importType",
  "fileName",
  "batchId",
  "status",
  "totalRows",
  "processedRows",
  "createdRows",
  "updatedRows",
  "unchangedRows",
  "duplicateRows",
  "warningRows",
  "errorRows",
  "missingListingRows",
  "missingImageRows",
  "startedAt",
  "finishedAt",
  "lastError",
  "stage",
  "currentFile",
  "totalFiles",
  "processedFiles",
  "createdAt",
  "updatedAt"
] as const satisfies readonly (keyof ImportJobRecord)[];

export type PublicImportJobRecord = Pick<ImportJobRecord, (typeof PUBLIC_IMPORT_JOB_FIELDS)[number]>;

function publicFileName(value: string | null, fallback: string): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/");
  return (normalized.split("/").at(-1)?.trim() || fallback).slice(0, 255);
}

export function toPublicImportJob(job: ImportJobRecord): PublicImportJobRecord {
  return {
    id: job.id,
    marketplace: job.marketplace,
    importType: job.importType,
    fileName: publicFileName(job.fileName, "Import file")!,
    batchId: job.batchId,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    createdRows: job.createdRows,
    updatedRows: job.updatedRows,
    unchangedRows: job.unchangedRows,
    duplicateRows: job.duplicateRows,
    warningRows: job.warningRows,
    errorRows: job.errorRows,
    missingListingRows: job.missingListingRows,
    missingImageRows: job.missingImageRows,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    lastError: sanitizeImportJobError(job.lastError),
    stage: job.stage,
    currentFile: publicFileName(job.currentFile, "Current file"),
    totalFiles: job.totalFiles,
    processedFiles: job.processedFiles,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
