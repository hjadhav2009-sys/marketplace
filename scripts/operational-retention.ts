import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prisma } from "../lib/prisma";
import { retainedImportJobArtifactPath } from "../src/lib/import-jobs/runner";

const confirm=process.argv.includes("--confirm-cleanup"),manifestArg=process.argv.find(value=>value.startsWith("--backup-manifest=")),now=Date.now(),date=(days:number)=>new Date(now-days*86_400_000);
export const retentionPolicy={workChangeEventDays:7,workflowReceiptDays:90,routeRejectionDays:180,scanLogDays:180,completedProjectionDays:30,securityThrottleDays:30,workActionLogDays:365,auditLogDays:730,importFileDays:90};
const completedStatuses=["COMPLETED","SKIPPED","CANCELLED"] as const;
const retainedImportStatuses=["COMPLETED","COMPLETED_WITH_WARNINGS","FAILED","CANCELLED"] as const;

type ImportFileCleanupPlan = {
 artifactPath:string;
 storedPaths:string[];
 eligibleJobIds:string[];
};

type BackupManifest = {
 verified?:boolean;
 version?:number;
 createdAt?:string;
 sourcePath?:string;
 sourceDatabasePath?:string;
 sourceSha256?:string;
 backupPath?:string;
 backupSha256?:string;
 backupSizeBytes?:number;
 integrity?:unknown;
 foreignKeyViolationCount?:number;
};

function configuredSqlitePath(){
 const raw=String(process.env.DATABASE_URL??"").trim().replace(/^['"]|['"]$/g,"");
 if(!raw.startsWith("file:"))throw new Error("Confirmed cleanup currently requires a verifiable SQLite database backup.");
 let filePath=decodeURIComponent(raw.slice(5).split("?")[0]??"");
 if(process.platform==="win32"&&/^\/+[A-Za-z]:\//.test(filePath))filePath=filePath.replace(/^\/+/g,"");
 if(!filePath||filePath.includes("\0"))throw new Error("Configured SQLite database path is invalid.");
 return path.isAbsolute(filePath)?path.resolve(filePath):path.resolve(process.cwd(),"prisma",filePath);
}

async function sha256File(file:string){const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}

function inspectSqlite(file:string){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const integrity=db.prepare("PRAGMA integrity_check").all().map(row=>String(Object.values(row)[0]));
  const foreignKeyViolationCount=db.prepare("PRAGMA foreign_key_check").all().length;
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name));
  const rowCounts=Object.fromEntries(tables.map(table=>[table,Number(db.prepare(`SELECT COUNT(*) AS count FROM ${JSON.stringify(table)}`).get()!.count)]));
  return{integrity,foreignKeyViolationCount,tables,rowCounts};
 }finally{db.close();}
}

async function verifyBackupManifest(){
 if(!manifestArg)throw new Error("Confirmed cleanup requires --backup-manifest=<verified manifest.json>.");
 const file=path.resolve(manifestArg.slice("--backup-manifest=".length));
 let parsed:BackupManifest;try{parsed=JSON.parse(await readFile(file,"utf8")) as BackupManifest;}catch{throw new Error("Backup manifest is missing, unreadable, or invalid JSON.");}
 const createdAt=Date.parse(parsed.createdAt??""),now=Date.now();
 if(parsed.verified!==true||parsed.version!==1||Number.isNaN(createdAt)||createdAt<now-7*86_400_000||createdAt>now+5*60_000)throw new Error("Backup manifest is not a recent verified version-1 manifest.");
 if(!/^[a-f0-9]{64}$/i.test(parsed.sourceSha256??"")||!/^[a-f0-9]{64}$/i.test(parsed.backupSha256??"")||!parsed.backupPath)throw new Error("Backup manifest hashes or backup path are invalid.");
 if(!Array.isArray(parsed.integrity)||parsed.integrity.map(String).join(",")!=="ok"||parsed.foreignKeyViolationCount!==0)throw new Error("Backup manifest does not record clean SQLite integrity and foreign keys.");
 const configured=await realpath(configuredSqlitePath()),sourceValue=parsed.sourcePath??parsed.sourceDatabasePath;
 if(!sourceValue)throw new Error("Backup manifest does not identify its source database.");
 let source:string,backup:string;try{source=await realpath(path.resolve(sourceValue));backup=await realpath(path.resolve(parsed.backupPath));}catch{throw new Error("Backup source or backup database is missing.");}
 if(source!==configured)throw new Error("Backup manifest belongs to a different source database.");
 if(backup===configured)throw new Error("Backup database must be a separate file from the cleanup target.");
 const backupInfo=await stat(backup);if(!backupInfo.isFile()||(parsed.backupSizeBytes!==undefined&&parsed.backupSizeBytes!==backupInfo.size))throw new Error("Backup database size or file type does not match its manifest.");
 const [sourceSha256,backupSha256]=await Promise.all([sha256File(configured),sha256File(backup)]);
 if(sourceSha256!==parsed.sourceSha256)throw new Error("Cleanup target changed after the verified backup was created.");
 if(backupSha256!==parsed.backupSha256)throw new Error("Backup database hash does not match its manifest.");
 const currentInspection=inspectSqlite(configured),backupInspection=inspectSqlite(backup);
 if(currentInspection.integrity.join(",")!=="ok"||currentInspection.foreignKeyViolationCount!==0)throw new Error("Cleanup target failed SQLite integrity or foreign-key verification.");
 if(backupInspection.integrity.join(",")!=="ok"||backupInspection.foreignKeyViolationCount!==0)throw new Error("Backup database failed SQLite integrity or foreign-key verification.");
 if(JSON.stringify(backupInspection.tables)!==JSON.stringify(currentInspection.tables)||JSON.stringify(backupInspection.rowCounts)!==JSON.stringify(currentInspection.rowCounts))throw new Error("Backup database no longer matches the cleanup target's table inventory and row counts.");
 return {manifestFile:path.basename(file),backupFile:path.basename(backup),backupSha256};
}

async function eligibleCounts(){return{
 workChangeEvents:await prisma.workChangeEvent.count({where:{createdAt:{lt:date(retentionPolicy.workChangeEventDays)}}}),
 workflowReceipts:await prisma.workflowActionReceipt.count({where:{createdAt:{lt:date(retentionPolicy.workflowReceiptDays)},status:"COMPLETED"}}),
 routeRejections:await prisma.workRouteDecisionRejection.count({where:{createdAt:{lt:date(retentionPolicy.routeRejectionDays)}}}),
 scanLogs:await prisma.scanLog.count({where:{createdAt:{lt:date(retentionPolicy.scanLogDays)},order:{problemOrders:{none:{status:"OPEN"}}}}}),
 securityThrottles:await prisma.securityThrottle.count({where:{lastAttemptAt:{lt:date(retentionPolicy.securityThrottleDays)},OR:[{blockedUntil:null},{blockedUntil:{lt:new Date()}}]}}),
 completedProjections:await prisma.workGroupProjection.count({where:{updatedAt:{lt:date(retentionPolicy.completedProjectionDays)},members:{every:{task:{status:{in:[...completedStatuses]}}}}}}),
 workActionLogs:await prisma.workActionLog.count({where:{createdAt:{lt:date(retentionPolicy.workActionLogDays)},task:{status:{in:[...completedStatuses]},problemReason:null}}}),
 auditLogs:await prisma.auditLog.count({where:{createdAt:{lt:date(retentionPolicy.auditLogDays)}}}),
  importFiles:await prisma.importJob.count({where:{finishedAt:{lt:date(retentionPolicy.importFileDays)},status:{in:[...retainedImportStatuses]},filePath:{not:null}}})
 };}

function importJobFileIsEligible(job:{finishedAt:Date|null;status:string}){
 return Boolean(job.finishedAt&&job.finishedAt<date(retentionPolicy.importFileDays)&&retainedImportStatuses.includes(job.status as typeof retainedImportStatuses[number]));
}

async function prepareImportFileCleanup(){
 const eligible=await prisma.importJob.findMany({where:{finishedAt:{lt:date(retentionPolicy.importFileDays)},status:{in:[...retainedImportStatuses]},filePath:{not:null}},select:{id:true,filePath:true}});
 const grouped=new Map<string,{storedPaths:Set<string>;eligibleJobIds:Set<string>}>();
 for(const job of eligible){
  const artifactPath=retainedImportJobArtifactPath(job.filePath);
  if(!artifactPath)throw new Error(`Retention refused: ImportJob ${job.id} has an unsafe or non-owned artifact path.`);
  const group=grouped.get(artifactPath)??{storedPaths:new Set<string>(),eligibleJobIds:new Set<string>()};
  group.storedPaths.add(job.filePath!);group.storedPaths.add(artifactPath);group.eligibleJobIds.add(job.id);grouped.set(artifactPath,group);
 }
 const plans:ImportFileCleanupPlan[]=[];
 for(const[artifactPath,group]of grouped){
  const storedPaths=[...group.storedPaths],references=await prisma.importJob.findMany({where:{filePath:{in:storedPaths}},select:{id:true,filePath:true,status:true,finishedAt:true}});
  if(references.some(reference=>!importJobFileIsEligible(reference)))continue;
  plans.push({artifactPath,storedPaths,eligibleJobIds:references.map(reference=>reference.id)});
 }
 return plans;
}

async function cleanupImportFiles(plans:ImportFileCleanupPlan[]){
 let cleaned=0;
 for(const plan of plans){
  const references=await prisma.importJob.findMany({where:{filePath:{in:plan.storedPaths}},select:{id:true,status:true,finishedAt:true}});
  if(references.some(reference=>!importJobFileIsEligible(reference)))continue;
  const eligibleJobIds=references.map(reference=>reference.id);
  if(!eligibleJobIds.length||eligibleJobIds.some(id=>!plan.eligibleJobIds.includes(id)))continue;
  await rm(plan.artifactPath,{recursive:true,force:true});
  const updated=await prisma.importJob.updateMany({where:{id:{in:eligibleJobIds},filePath:{in:plan.storedPaths},finishedAt:{lt:date(retentionPolicy.importFileDays)},status:{in:[...retainedImportStatuses]}},data:{filePath:null}});cleaned+=updated.count;
 }
 return cleaned;
}

async function main(){
 const eligible=await eligibleCounts();if(!confirm){console.log(JSON.stringify({dryRun:true,policy:retentionPolicy,eligible,note:"Active work, open problems, route decisions, recent receipts and recent operational history are preserved."},null,2));return;}
 const backup=await verifyBackupManifest();
 const importFileCleanupPlan=await prepareImportFileCleanup();
 const deleted={
  workChangeEvents:(await prisma.workChangeEvent.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workChangeEventDays)}}})).count,
  workflowReceipts:(await prisma.workflowActionReceipt.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workflowReceiptDays)},status:"COMPLETED"}})).count,
  routeRejections:(await prisma.workRouteDecisionRejection.deleteMany({where:{createdAt:{lt:date(retentionPolicy.routeRejectionDays)}}})).count,
  scanLogs:(await prisma.scanLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.scanLogDays)},order:{problemOrders:{none:{status:"OPEN"}}}}})).count,
  securityThrottles:(await prisma.securityThrottle.deleteMany({where:{lastAttemptAt:{lt:date(retentionPolicy.securityThrottleDays)},OR:[{blockedUntil:null},{blockedUntil:{lt:new Date()}}]}})).count,
  workActionLogs:(await prisma.workActionLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workActionLogDays)},task:{status:{in:[...completedStatuses]},problemReason:null}}})).count,
  auditLogs:(await prisma.auditLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.auditLogDays)}}})).count,
  completedProjections:(await prisma.workGroupProjection.deleteMany({where:{updatedAt:{lt:date(retentionPolicy.completedProjectionDays)},members:{every:{task:{status:{in:[...completedStatuses]}}}}}})).count,
   importFiles:await cleanupImportFiles(importFileCleanupPlan)
 };
 console.log(JSON.stringify({dryRun:false,policy:retentionPolicy,backup,deleted},null,2));
}
main().finally(()=>prisma.$disconnect());
