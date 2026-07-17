import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export type ImportJobStatus = "QUEUED" | "RUNNING" | "NEEDS_MAPPING" | "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "CANCELLED";
export type ImportJobType = "FLIPKART_LISTING_MASTER" | "FLIPKART_ORDER" | "FLIPKART_PRODUCT_INVENTORY" | "AMAZON_ALL_LISTINGS" | "AMAZON_CATEGORY_CATALOG" | "AMAZON_PRODUCT_INVENTORY" | "FLIPKART_CONSIGNMENT_QUANTITY" | "FLIPKART_CONSIGNMENT_ENRICHMENT" | "AMAZON_CONSIGNMENT_QUANTITY" | "AMAZON_CONSIGNMENT_ENRICHMENT";

export type ImportJobRecord = {
  id: string;
  accountId: string;
  createdByUserId: string | null;
  marketplace: string;
  importType: ImportJobType;
  fileName: string;
  filePath: string | null;
  batchId: string | null;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  unchangedRows: number;
  duplicateRows: number;
  warningRows: number;
  errorRows: number;
  missingListingRows: number;
  missingImageRows: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  stage: string;
  currentFile: string | null;
  totalFiles: number;
  processedFiles: number;
  manifestJson: string | null;
  progressJson: string | null;
  reportJson: string | null;
  cancelRequestedAt: Date | null;
  mergeStartedAt: Date | null;
  runnerId: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  attemptNumber: number;
  checkpointJson: string | null;
  currentEntryId: string | null;
  currentChunk: number;
  mergeCompletedEntryIdsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImportJobDbRow = Omit<
  ImportJobRecord,
  | "importType"
  | "status"
  | "totalRows"
  | "processedRows"
  | "createdRows"
  | "updatedRows"
  | "unchangedRows"
  | "duplicateRows"
  | "warningRows"
  | "errorRows"
  | "missingListingRows"
  | "missingImageRows"
  | "startedAt"
  | "finishedAt"
  | "createdAt"
  | "updatedAt"
  | "totalFiles"
  | "processedFiles"
  | "cancelRequestedAt"
  | "mergeStartedAt"
  | "leaseExpiresAt"
  | "heartbeatAt"
  | "attemptNumber"
  | "currentChunk"
> & {
  importType: string;
  status: string;
  totalRows: number | bigint;
  processedRows: number | bigint;
  createdRows: number | bigint;
  updatedRows: number | bigint;
  unchangedRows: number | bigint;
  duplicateRows: number | bigint;
  warningRows: number | bigint;
  errorRows: number | bigint;
  missingListingRows: number | bigint;
  missingImageRows: number | bigint;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  totalFiles: number | bigint;
  processedFiles: number | bigint;
  cancelRequestedAt: Date | string | null;
  mergeStartedAt: Date | string | null;
  leaseExpiresAt: Date | string | null;
  heartbeatAt: Date | string | null;
  attemptNumber: number | bigint;
  currentChunk: number | bigint;
};

export type ImportJobCreateInput = {
  id: string;
  accountId: string;
  createdByUserId: string;
  marketplace: string;
  importType: ImportJobType;
  fileName: string;
  filePath: string;
};

export type ImportJobProgressUpdate = {
  totalRows?: number;
  processedRows?: number;
  createdRows?: number;
  updatedRows?: number;
  unchangedRows?: number;
  duplicateRows?: number;
  warningRows?: number;
  errorRows?: number;
  missingListingRows?: number;
  missingImageRows?: number;
};

function numberValue(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

function dateValue(value: Date | string | null) {
  return value ? new Date(value) : null;
}

function normalizeJob(row: ImportJobDbRow): ImportJobRecord {
  return {
    ...row,
    importType: row.importType as ImportJobType,
    status: row.status as ImportJobStatus,
    totalRows: numberValue(row.totalRows),
    processedRows: numberValue(row.processedRows),
    createdRows: numberValue(row.createdRows),
    updatedRows: numberValue(row.updatedRows),
    unchangedRows: numberValue(row.unchangedRows),
    duplicateRows: numberValue(row.duplicateRows),
    warningRows: numberValue(row.warningRows),
    errorRows: numberValue(row.errorRows),
    missingListingRows: numberValue(row.missingListingRows),
    missingImageRows: numberValue(row.missingImageRows),
    totalFiles: numberValue(row.totalFiles),
    processedFiles: numberValue(row.processedFiles),
    startedAt: dateValue(row.startedAt),
    finishedAt: dateValue(row.finishedAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt)
    ,cancelRequestedAt: dateValue(row.cancelRequestedAt)
    ,mergeStartedAt: dateValue(row.mergeStartedAt)
    ,leaseExpiresAt: dateValue(row.leaseExpiresAt)
    ,heartbeatAt: dateValue(row.heartbeatAt)
    ,attemptNumber: numberValue(row.attemptNumber)
    ,currentChunk: numberValue(row.currentChunk)
  };
}

export async function createImportJob(input: ImportJobCreateInput) {
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "ImportJob" (
      "id",
      "accountId",
      "createdByUserId",
      "marketplace",
      "importType",
      "fileName",
      "filePath",
      "status",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${input.id},
      ${input.accountId},
      ${input.createdByUserId},
      ${input.marketplace},
      ${input.importType},
      ${input.fileName},
      ${input.filePath},
      ${"QUEUED"},
      ${now},
      ${now}
    )
  `;

  const job = await findImportJobById(input.id);

  if (!job) {
    throw new Error("Import job could not be created.");
  }

  return job;
}

export async function findImportJobById(id: string) {
  const rows = await prisma.$queryRaw<ImportJobDbRow[]>`
    SELECT
      "id",
      "accountId",
      "createdByUserId",
      "marketplace",
      "importType",
      "fileName",
      "filePath",
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
      "manifestJson",
      "progressJson",
      "reportJson",
      "cancelRequestedAt",
      "mergeStartedAt",
      "runnerId",
      "leaseExpiresAt",
      "heartbeatAt",
      "attemptNumber",
      "checkpointJson",
      "currentEntryId",
      "currentChunk",
      "mergeCompletedEntryIdsJson",
      "createdAt",
      "updatedAt"
    FROM "ImportJob"
    WHERE "id" = ${id}
    LIMIT 1
  `;

  return rows[0] ? normalizeJob(rows[0]) : null;
}

export async function listRecentImportJobs(accountId: string, limit = 20) {
  const rows = await prisma.$queryRaw<ImportJobDbRow[]>`
    SELECT
      "id",
      "accountId",
      "createdByUserId",
      "marketplace",
      "importType",
      "fileName",
      "filePath",
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
      "manifestJson",
      "progressJson",
      "reportJson",
      "cancelRequestedAt",
      "mergeStartedAt",
      "runnerId",
      "leaseExpiresAt",
      "heartbeatAt",
      "attemptNumber",
      "checkpointJson",
      "currentEntryId",
      "currentChunk",
      "mergeCompletedEntryIdsJson",
      "createdAt",
      "updatedAt"
    FROM "ImportJob"
    WHERE "accountId" = ${accountId}
    ORDER BY "createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 100))}
  `;

  return rows.map(normalizeJob);
}

export async function markImportJobRunning(id: string) {
  const now = new Date();

  await prisma.$executeRaw`
    UPDATE "ImportJob"
    SET
      "status" = ${"RUNNING"},
      "startedAt" = COALESCE("startedAt", ${now}),
      "lastError" = NULL,
      "updatedAt" = ${now}
    WHERE "id" = ${id}
  `;
}

export async function markImportJobNeedsMapping(id:string,input:{headers:string[];fingerprint:string;requiredFields:string[];optionalFields:string[]}){await prisma.importJob.update({where:{id},data:{status:"NEEDS_MAPPING",stage:"NEEDS_MAPPING",progressJson:JSON.stringify(input),lastError:"Owner header mapping is required.",finishedAt:null}});}

export async function resumeMappedImportJob(id:string){await prisma.importJob.update({where:{id},data:{status:"QUEUED",stage:"QUEUED",progressJson:null,lastError:null,finishedAt:null}});}

export async function setImportJobBatch(id: string, batchId: string, runnerId?:string) {
  const now = new Date(),updated=await prisma.importJob.updateMany({where:{id,...(runnerId?{runnerId,leaseExpiresAt:{gt:now}}:{})},data:{batchId,updatedAt:now}});if(updated.count!==1)throw new Error("Import runner lease was lost.");
}

export async function updateImportJobProgress(id: string, progress: ImportJobProgressUpdate, runnerId?:string) {
  const now = new Date();
  const totalRows = progress.totalRows ?? null;
  const processedRows = progress.processedRows ?? null;
  const createdRows = progress.createdRows ?? null;
  const updatedRows = progress.updatedRows ?? null;
  const unchangedRows = progress.unchangedRows ?? null;
  const duplicateRows = progress.duplicateRows ?? null;
  const warningRows = progress.warningRows ?? null;
  const errorRows = progress.errorRows ?? null;
  const missingListingRows = progress.missingListingRows ?? null;
  const missingImageRows = progress.missingImageRows ?? null;

  const updated=await prisma.importJob.updateMany({where:{id,...(runnerId?{runnerId,leaseExpiresAt:{gt:now}}:{})},data:{...(totalRows!==null?{totalRows}:{}),...(processedRows!==null?{processedRows}:{}),...(createdRows!==null?{createdRows}:{}),...(updatedRows!==null?{updatedRows}:{}),...(unchangedRows!==null?{unchangedRows}:{}),...(duplicateRows!==null?{duplicateRows}:{}),...(warningRows!==null?{warningRows}:{}),...(errorRows!==null?{errorRows}:{}),...(missingListingRows!==null?{missingListingRows}:{}),...(missingImageRows!==null?{missingImageRows}:{}),updatedAt:now}});if(updated.count!==1)throw new Error("Import runner lease was lost.");
}

export async function renewImportJobLease(id:string,runnerId:string,stage:string,leaseMs=120_000,client:PrismaClient=prisma){const now=new Date(),updated=await client.importJob.updateMany({where:{id,runnerId,leaseExpiresAt:{gt:now}},data:{stage,heartbeatAt:now,leaseExpiresAt:new Date(now.getTime()+Math.max(50,leaseMs))}});if(updated.count!==1)throw new Error("Import runner lease was lost.");return updated;}

export async function completeImportJob(id: string, batchId?: string | null) {
  const now = new Date();

  await prisma.$executeRaw`
    UPDATE "ImportJob"
    SET
      "status" = CASE WHEN "errorRows" = 0 AND ("warningRows" > 0 OR "duplicateRows" > 0 OR "missingImageRows" > 0 OR "missingListingRows" > 0)
        THEN ${"COMPLETED_WITH_WARNINGS"} ELSE ${"COMPLETED"} END,
      "stage" = ${"COMPLETED"},
      "processedRows" = CASE WHEN "totalRows" > "processedRows" THEN "totalRows" ELSE "processedRows" END,
      "batchId" = COALESCE(${batchId ?? null}, "batchId"),
      "finishedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" = ${id}
  `;
}

export async function failImportJob(id: string, error: unknown) {
  const now = new Date();
  const message = error instanceof Error ? error.message : "Import failed.";

  await prisma.$executeRaw`
    UPDATE "ImportJob"
    SET
      "status" = ${"FAILED"},
      "lastError" = ${message.slice(0, 1000)},
      "finishedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" = ${id}
  `;
}
