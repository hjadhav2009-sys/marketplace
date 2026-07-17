import type { Account, User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSpreadsheetRowsFromPath } from "@/lib/import/files";
import type { RawImportRow } from "@/lib/import/sku-mappings";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { importFlipkartListingRows, importFlipkartOrderRows } from "@/src/lib/marketplaces/flipkart";
import { applyAdaptiveRows } from "@/src/lib/imports/adaptive-rows";
import { definitionForImportJob } from "@/src/lib/imports/import-purpose-definitions";
import {
  createImportJob,
  findImportJobById,
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
    .catch(() => undefined)
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

async function applyAdaptiveHeaderProfile(job:ImportJobRecord,rows:RawImportRow[],account:Account){const definition=definitionForImportJob(job);return definition?applyAdaptiveRows({jobId:job.id,accountId:account.id,marketplace:definition.marketplace,purpose:definition.purpose,rows}):rows;}

export async function processImportJob(jobId: string, request?: RequestMeta) {
  const now=new Date(),runnerId=`import-runner:${randomUUID()}`,claimed=await prisma.importJob.updateMany({where:{id:jobId,attemptNumber:{lt:10},OR:[{status:"QUEUED"},{status:"RUNNING",OR:[{leaseExpiresAt:null},{leaseExpiresAt:{lt:now}}]}]},data:{status:"RUNNING",stage:"PARSING",startedAt:now,runnerId,heartbeatAt:now,leaseExpiresAt:new Date(now.getTime()+120000),attemptNumber:{increment:1},lastError:null}});if(claimed.count!==1)return;
  const job = await findImportJobById(jobId);

  if (!job) {
    return;
  }

  if (!job.filePath) {
    throw new Error("Import job file is missing.");
  }

  try {
  if(await finishIfCancelled(job.id,runnerId))return;let rows = await parseSpreadsheetRowsFromPath(job.filePath);if(await finishIfCancelled(job.id,runnerId))return;await heartbeat(job.id,runnerId,"MAPPING");
  const { account, user } = await loadJobActors(job);

  const mappedRows=await applyAdaptiveHeaderProfile(job,rows,account);if(!mappedRows){await prisma.importJob.updateMany({where:{id:job.id,runnerId},data:{runnerId:null,leaseExpiresAt:null}});return;}rows=mappedRows;await heartbeat(job.id,runnerId,"IMPORTING");

  if (job.importType === "FLIPKART_LISTING_MASTER") {
    const batch = await importFlipkartListingRows({
      rows,
      fileName: job.fileName,
      account,
      user,
      request,
      jobId: job.id
    });
    await completeOwned(job.id,runnerId,batch.id);
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
    await completeOwned(job.id,runnerId,batch.id);
    return;
  }

  throw new Error(`Unsupported import job type: ${job.importType}`);
  }catch(error){const message=(error instanceof Error?error.message:"Import failed.").replace(/[A-Z]:\\[^\s]+/gi,"[private path]").slice(0,500);await prisma.importJob.updateMany({where:{id:job.id,runnerId},data:{status:"FAILED",stage:"FAILED",lastError:message,finishedAt:new Date(),runnerId:null,leaseExpiresAt:null}});throw error;}
}

async function heartbeat(id:string,runnerId:string,stage:string){const now=new Date(),result=await prisma.importJob.updateMany({where:{id,runnerId},data:{stage,heartbeatAt:now,leaseExpiresAt:new Date(now.getTime()+120000)}});if(result.count!==1)throw new Error("Import runner lease was lost.");}
async function completeOwned(id:string,runnerId:string,batchId:string){const result=await prisma.importJob.updateMany({where:{id,runnerId},data:{status:"COMPLETED",stage:"COMPLETED",batchId,finishedAt:new Date(),runnerId:null,leaseExpiresAt:null}});if(result.count!==1)throw new Error("Import runner lease was lost before completion.");}
async function finishIfCancelled(id:string,runnerId:string){const current=await prisma.importJob.findFirst({where:{id,runnerId},select:{cancelRequestedAt:true}});if(!current)throw new Error("Import runner lease was lost.");if(!current.cancelRequestedAt)return false;await prisma.importJob.updateMany({where:{id,runnerId},data:{status:"CANCELLED",stage:"CANCELLED",finishedAt:new Date(),runnerId:null,leaseExpiresAt:null}});return true;}
