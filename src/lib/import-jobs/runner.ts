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
import { sanitizeImportJobError } from "./safe-error";
import {
  createImportJob,
  findImportJobById,
  type ImportJobRecord,
  type ImportJobType,
  renewImportJobLease
} from "./store";

export const IMPORT_JOB_STORAGE_DIR = path.join(process.cwd(), "storage", "import-jobs");
const IMPORT_JOB_ARTIFACT_NAME = /^job_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-[a-zA-Z0-9._-]+)?$/i;

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

export function retainedImportJobArtifactPath(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  const resolvedFile = path.resolve(filePath);
  const resolvedStorage = path.resolve(IMPORT_JOB_STORAGE_DIR);
  if (path.dirname(resolvedFile) !== resolvedStorage || !IMPORT_JOB_ARTIFACT_NAME.test(path.basename(resolvedFile))) {
    return null;
  }

  return resolvedFile;
}

export function isRetainedImportJobFilePath(filePath: string | null | undefined) {
  return retainedImportJobArtifactPath(filePath) !== null;
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

class ImportJobCancellationSignal extends Error {
  constructor() {
    super("Import job cancellation requested.");
    this.name = "ImportJobCancellationSignal";
  }
}

async function withHeartbeat<T>(id:string,runnerId:string,stage:string,operation:()=>Promise<T>){await heartbeat(id,runnerId,stage);let lost:unknown=null,busy=false;const timer=setInterval(()=>{if(busy||lost)return;busy=true;void heartbeat(id,runnerId,stage).catch(error=>{lost=error;}).finally(()=>{busy=false;});},30000);try{const result=await operation();if(lost)throw lost;await heartbeat(id,runnerId,stage);return result;}finally{clearInterval(timer);}}

export async function processImportJob(jobId: string, request?: RequestMeta) {
  const now=new Date(),runnerId=`import-runner:${randomUUID()}`,claimed=await prisma.importJob.updateMany({where:{id:jobId,attemptNumber:{lt:10},OR:[{status:"QUEUED"},{status:"RUNNING",OR:[{leaseExpiresAt:null},{leaseExpiresAt:{lt:now}}]}]},data:{status:"RUNNING",stage:"PARSING",startedAt:now,runnerId,heartbeatAt:now,leaseExpiresAt:new Date(now.getTime()+120000),attemptNumber:{increment:1},lastError:null}});if(claimed.count!==1)return;
  const job = await findImportJobById(jobId);

  if (!job) {
    return;
  }

  try {
  if (!job.filePath) throw new Error("Import job file is missing.");
  if(await finishIfCancelled(job.id,runnerId))return;let rows = await withHeartbeat(job.id,runnerId,"PARSING",()=>parseSpreadsheetRowsFromPath(job.filePath!));if(await finishIfCancelled(job.id,runnerId))return;await heartbeat(job.id,runnerId,"MAPPING");
  const { account, user } = await loadJobActors(job);

  const mappedRows=await withHeartbeat(job.id,runnerId,"MAPPING",()=>applyAdaptiveHeaderProfile(job,rows,account));if(!mappedRows){await prisma.importJob.updateMany({where:{id:job.id,runnerId},data:{runnerId:null,leaseExpiresAt:null}});return;}rows=mappedRows;await heartbeat(job.id,runnerId,"IMPORTING");

  if (job.importType === "FLIPKART_LISTING_MASTER") {
    const batch = await withHeartbeat(job.id,runnerId,"IMPORTING",()=>importFlipkartListingRows({
      rows,
      fileName: job.fileName,
      account,
      user,
      request,
      jobId: job.id,runnerId,assertLease:()=>heartbeat(job.id,runnerId,"IMPORTING")
    }));
    await completeOwned(job.id,runnerId,batch.id);
    return;
  }

  if (job.importType === "FLIPKART_ORDER") {
    const batch = await withHeartbeat(job.id,runnerId,"IMPORTING",()=>importFlipkartOrderRows({
      rows,
      fileName: job.fileName,
      account,
      user,
      request,
      jobId: job.id,runnerId,assertLease:()=>heartbeat(job.id,runnerId,"IMPORTING")
    }));
    await completeOwned(job.id,runnerId,batch.id);
    return;
  }

  throw new Error(`Unsupported import job type: ${job.importType}`);
  }catch(error){
    if(error instanceof ImportJobCancellationSignal){await finishCancellationOwned(job.id,runnerId);return;}
    try{if(await finishIfCancelled(job.id,runnerId))return;}catch(controlError){if(controlError instanceof Error&&/lease was lost/i.test(controlError.message))throw error;throw controlError;}
    const message=sanitizeImportJobError(error)??"Import failed.";
    const failed=await prisma.importJob.updateMany({where:{id:job.id,runnerId,cancelRequestedAt:null,account:{active:true}},data:{status:"FAILED",stage:"FAILED",lastError:message,finishedAt:new Date(),runnerId:null,leaseExpiresAt:null}});
    if(failed.count===0){try{if(await finishIfCancelled(job.id,runnerId))return;}catch(controlError){if(!(controlError instanceof Error&&/lease was lost/i.test(controlError.message)))throw controlError;}}
    throw error;
  }
}

async function currentImportControl(id:string,runnerId:string){const now=new Date(),current=await prisma.importJob.findFirst({where:{id,runnerId,leaseExpiresAt:{gt:now}},select:{cancelRequestedAt:true,account:{select:{active:true}}}});if(!current)throw new Error("Import runner lease was lost.");return{cancelled:Boolean(current.cancelRequestedAt)||!current.account.active};}
async function heartbeat(id:string,runnerId:string,stage:string){const control=await currentImportControl(id,runnerId);if(control.cancelled)throw new ImportJobCancellationSignal();await renewImportJobLease(id,runnerId,stage);}
async function completeOwned(id:string,runnerId:string,batchId:string){const now=new Date(),result=await prisma.importJob.updateMany({where:{id,runnerId,leaseExpiresAt:{gt:now},cancelRequestedAt:null,account:{active:true}},data:{status:"COMPLETED",stage:"COMPLETED",batchId,finishedAt:now,runnerId:null,leaseExpiresAt:null}});if(result.count!==1)throw new ImportJobCancellationSignal();}
async function finishCancellationOwned(id:string,runnerId:string){const now=new Date(),finished=await prisma.importJob.updateMany({where:{id,runnerId,leaseExpiresAt:{gt:now}},data:{status:"CANCELLED",stage:"CANCELLED",finishedAt:now,runnerId:null,leaseExpiresAt:null}});if(finished.count===1)return true;const current=await prisma.importJob.findUnique({where:{id},select:{status:true}});if(current?.status==="CANCELLED")return true;throw new Error("Import runner lease was lost.");}
async function finishIfCancelled(id:string,runnerId:string){const control=await currentImportControl(id,runnerId);return control.cancelled?finishCancellationOwned(id,runnerId):false;}
