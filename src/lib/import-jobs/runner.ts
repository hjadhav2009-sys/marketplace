import type { Account, User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSpreadsheetRowsFromPath } from "@/lib/import/files";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { importFlipkartListingRows, importFlipkartOrderRows } from "@/src/lib/marketplaces/flipkart";
import {
  completeImportJob,
  createImportJob,
  failImportJob,
  findImportJobById,
  markImportJobRunning,
  type ImportJobRecord,
  type ImportJobType
} from "./store";

export const IMPORT_JOB_STORAGE_DIR = path.join(process.cwd(), "storage", "import-jobs");

type RunningImportJobs = {
  runningImportJobs?: Set<string>;
};

function runningJobSet() {
  const globalJobs = globalThis as RunningImportJobs;
  globalJobs.runningImportJobs ??= new Set<string>();
  return globalJobs.runningImportJobs;
}

function safeUploadFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload.xlsx";
}

export function isRetainedImportJobFilePath(filePath: string | null | undefined) {
  if (!filePath) {
    return false;
  }

  const resolvedFile = path.resolve(filePath);
  const resolvedStorage = path.resolve(IMPORT_JOB_STORAGE_DIR);
  return resolvedFile === resolvedStorage || resolvedFile.startsWith(`${resolvedStorage}${path.sep}`);
}

export async function retainedImportJobFileExists(filePath: string | null | undefined) {
  if (!isRetainedImportJobFilePath(filePath)) {
    return false;
  }

  try {
    await access(path.resolve(filePath ?? ""));
    return true;
  } catch {
    return false;
  }
}

export async function createFlipkartImportJobFromFile(input: {
  file: File;
  account: Account;
  user: User;
  importType: ImportJobType;
}) {
  const id = `job_${randomUUID()}`;
  await mkdir(IMPORT_JOB_STORAGE_DIR, { recursive: true });

  const safeName = safeUploadFileName(input.file.name);
  const filePath = path.join(IMPORT_JOB_STORAGE_DIR, `${id}-${safeName}`);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await writeFile(filePath, buffer);

  return createImportJob({
    id,
    accountId: input.account.id,
    createdByUserId: input.user.id,
    marketplace: "FLIPKART",
    importType: input.importType,
    fileName: input.file.name,
    filePath
  });
}

export async function createRetryImportJob(input: {
  sourceJob: ImportJobRecord;
  user: User;
}) {
  if (!(await retainedImportJobFileExists(input.sourceJob.filePath))) {
    throw new Error("Retry unavailable because source file was cleaned up.");
  }

  return createImportJob({
    id: `job_${randomUUID()}`,
    accountId: input.sourceJob.accountId,
    createdByUserId: input.user.id,
    marketplace: input.sourceJob.marketplace,
    importType: input.sourceJob.importType,
    fileName: input.sourceJob.fileName,
    filePath: input.sourceJob.filePath ?? ""
  });
}

export function startImportJob(jobId: string, request?: RequestMeta) {
  const running = runningJobSet();

  if (running.has(jobId)) {
    return;
  }

  running.add(jobId);
  void processImportJob(jobId, request)
    .catch((error) => failImportJob(jobId, error))
    .finally(() => {
      running.delete(jobId);
    });
}

async function loadJobActors(job: ImportJobRecord) {
  const [account, user] = await Promise.all([
    prisma.account.findUnique({ where: { id: job.accountId } }),
    job.createdByUserId ? prisma.user.findUnique({ where: { id: job.createdByUserId } }) : null
  ]);

  if (!account || !user) {
    throw new Error("Import job account or owner user is missing.");
  }

  return { account, user };
}

export async function processImportJob(jobId: string, request?: RequestMeta) {
  const job = await findImportJobById(jobId);

  if (!job || job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
    return;
  }

  if (!job.filePath) {
    throw new Error("Import job file is missing.");
  }

  await markImportJobRunning(job.id);
  const rows = await parseSpreadsheetRowsFromPath(job.filePath);
  const { account, user } = await loadJobActors(job);

  if (job.importType === "FLIPKART_LISTING_MASTER") {
    const batch = await importFlipkartListingRows({
      rows,
      fileName: job.fileName,
      account,
      user,
      request,
      jobId: job.id
    });
    await completeImportJob(job.id, batch.id);
    return;
  }

  if (job.importType === "FLIPKART_ORDER") {
    const batch = await importFlipkartOrderRows({
      rows,
      fileName: job.fileName,
      account,
      user,
      request,
      jobId: job.id
    });
    await completeImportJob(job.id, batch.id);
    return;
  }

  throw new Error(`Unsupported import job type: ${job.importType}`);
}
