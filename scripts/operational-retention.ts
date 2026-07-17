import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { isRetainedImportJobFilePath } from "../src/lib/import-jobs/runner";

const confirm=process.argv.includes("--confirm-cleanup"),manifestArg=process.argv.find(value=>value.startsWith("--backup-manifest=")),now=Date.now(),date=(days:number)=>new Date(now-days*86_400_000);
export const retentionPolicy={workChangeEventDays:7,workflowReceiptDays:90,routeRejectionDays:180,scanLogDays:180,completedProjectionDays:30,securityThrottleDays:30,workActionLogDays:365,auditLogDays:730,importFileDays:90};
const completedStatuses=["COMPLETED","SKIPPED","CANCELLED"] as const;

async function verifyBackupManifest(){
 if(!manifestArg)throw new Error("Confirmed cleanup requires --backup-manifest=<verified manifest.json>.");
 const file=path.resolve(manifestArg.slice("--backup-manifest=".length)),parsed=JSON.parse(await readFile(file,"utf8")) as {completedAt?:string;databaseSha256?:string;verified?:boolean};
 if(parsed.verified!==true||!/^[a-f0-9]{64}$/i.test(parsed.databaseSha256??"")||!parsed.completedAt||Number.isNaN(Date.parse(parsed.completedAt)))throw new Error("Backup manifest is invalid or not verified.");
 if(Date.parse(parsed.completedAt)<Date.now()-7*86_400_000)throw new Error("Backup manifest is older than seven days.");
 return {path:file,databaseSha256:parsed.databaseSha256};
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
 importFiles:await prisma.importJob.count({where:{finishedAt:{lt:date(retentionPolicy.importFileDays)},status:{in:["COMPLETED","COMPLETED_WITH_WARNINGS","FAILED","CANCELLED"]},filePath:{not:null}}})
};}

async function cleanupImportFiles(){
 const jobs=await prisma.importJob.findMany({where:{finishedAt:{lt:date(retentionPolicy.importFileDays)},status:{in:["COMPLETED","COMPLETED_WITH_WARNINGS","FAILED","CANCELLED"]},filePath:{not:null}},select:{id:true,filePath:true}});let cleaned=0;
 for(const job of jobs){if(!isRetainedImportJobFilePath(job.filePath))continue;await rm(path.resolve(job.filePath!),{recursive:true,force:true});const updated=await prisma.importJob.updateMany({where:{id:job.id,filePath:job.filePath},data:{filePath:null}});cleaned+=updated.count;}
 return cleaned;
}

async function main(){
 const eligible=await eligibleCounts();if(!confirm){console.log(JSON.stringify({dryRun:true,policy:retentionPolicy,eligible,note:"Active work, open problems, route decisions, recent receipts and recent operational history are preserved."},null,2));return;}
 const backup=await verifyBackupManifest();
 const deleted={
  workChangeEvents:(await prisma.workChangeEvent.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workChangeEventDays)}}})).count,
  workflowReceipts:(await prisma.workflowActionReceipt.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workflowReceiptDays)},status:"COMPLETED"}})).count,
  routeRejections:(await prisma.workRouteDecisionRejection.deleteMany({where:{createdAt:{lt:date(retentionPolicy.routeRejectionDays)}}})).count,
  scanLogs:(await prisma.scanLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.scanLogDays)},order:{problemOrders:{none:{status:"OPEN"}}}}})).count,
  securityThrottles:(await prisma.securityThrottle.deleteMany({where:{lastAttemptAt:{lt:date(retentionPolicy.securityThrottleDays)},OR:[{blockedUntil:null},{blockedUntil:{lt:new Date()}}]}})).count,
  workActionLogs:(await prisma.workActionLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.workActionLogDays)},task:{status:{in:[...completedStatuses]},problemReason:null}}})).count,
  auditLogs:(await prisma.auditLog.deleteMany({where:{createdAt:{lt:date(retentionPolicy.auditLogDays)}}})).count,
  completedProjections:(await prisma.workGroupProjection.deleteMany({where:{updatedAt:{lt:date(retentionPolicy.completedProjectionDays)},members:{every:{task:{status:{in:[...completedStatuses]}}}}}})).count,
  importFiles:await cleanupImportFiles()
 };
 console.log(JSON.stringify({dryRun:false,policy:retentionPolicy,backup,deleted},null,2));
}
main().finally(()=>prisma.$disconnect());
