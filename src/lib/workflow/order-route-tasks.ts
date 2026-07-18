import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type WorkRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assertWorkerAccountAccess } from "./worker-access";
import { createWorkRouteSnapshot, parseWorkRouteSnapshot } from "./dynamic-route";
import { refreshAffectedWorkGroups } from "./work-group-projection";
import { reportOrderWorkflowProblem } from "./order-problems";

type Client = PrismaClient;
type Transaction = Prisma.TransactionClient;

export async function getOrderMarkingQueue(input:{accountId:string;actorUserId:string;search?:string},client:Client=prisma){
  const {user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,client);if(!hasWorkPermission(user,"canMark")&&!user.canViewAllWork)throw new Error("Marking permission is required.");
  const search=input.search?.normalize("NFKC").trim().slice(0,160);
  return client.workTask.findMany({where:{accountId:input.accountId,sourceType:"ORDER",stage:"MARK",status:{in:["READY","IN_PROGRESS","PROBLEM"]},AND:[...(search?[{OR:[{order:{awb:search}},{order:{trackingId:search}},{order:{orderNo:search}},{order:{orderItemId:search}},{order:{sku:search}}]}]:[]),...(user.role==="OWNER"||user.canViewAllWork?[]:[{OR:[{assignedUserId:null},{assignedUserId:user.id}]}])]},include:{order:true,assignedUser:{select:{name:true}},problemReportedBy:{select:{name:true}},actionLogs:{where:{action:"TASK_PROBLEM_REPORTED"},orderBy:{createdAt:"desc"},take:1}},orderBy:[{status:"asc"},{updatedAt:"asc"}],take:50});
}

function fingerprint(payload:Record<string,unknown>){return createHash("sha256").update(JSON.stringify(payload)).digest("hex");}
async function taskForMutation(tx:Transaction,input:{taskId:string;accountId:string;actorUserId:string}){
  const {user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,tx);
  const task=await tx.workTask.findFirst({where:{id:input.taskId,accountId:input.accountId,sourceType:"ORDER",stage:"MARK"},include:{order:{select:{id:true,accountId:true}}}});
  if(!task?.order||task.order.accountId!==input.accountId)throw new Error("Marking task is unavailable.");
  return{user,task};
}
async function replay(tx:Transaction,input:{taskId:string;actorUserId:string;requestKind:WorkRequestKind;clientRequestId?:string;requestFingerprint:string}){
  if(!input.clientRequestId)return null;const log=await tx.workActionLog.findFirst({where:{taskId:input.taskId,clientRequestId:input.clientRequestId},orderBy:{createdAt:"asc"}});if(!log)return null;
  if(log.actorUserId!==input.actorUserId)throw new Error("Request ID was already used by another worker.");
  const expected=input.requestKind==="COMPLETE"?"TASK_COMPLETED":input.requestKind==="REPORT_PROBLEM"?"TASK_PROBLEM_REPORTED":null;
  if(!expected||log.requestKind!==input.requestKind||log.action!==expected)throw new Error("Request ID was already used for a different action.");
  const metadata=log.metadataJson?JSON.parse(log.metadataJson) as {requestFingerprint?:string}:{};if(metadata.requestFingerprint!==input.requestFingerprint)throw new Error("Request ID was already used with a different payload.");
  return{taskId:input.taskId,status:expected==="TASK_COMPLETED"?"COMPLETED" as const:"PROBLEM" as const,idempotent:true};
}
function transient(error:unknown){const message=error instanceof Error?error.message:String(error);return error instanceof Prisma.PrismaClientKnownRequestError&&["P1008","P2002","P2028","P2034"].includes(error.code)||/database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);}
async function recover<T>(input:{clientRequestId?:string;mutate:()=>Promise<T>;replay:()=>Promise<T|null>}){let last:unknown;for(let attempt=0;attempt<6;attempt++){try{return await input.mutate();}catch(error){last=error;if(!input.clientRequestId)throw error;const prior=await input.replay();if(prior)return prior;if(!transient(error))throw error;if(attempt<5)await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}if(transient(last))throw new Error("Work is busy; retry the action.");throw last;}

export async function completeOrderMarkingTask(input:{taskId:string;accountId:string;actorUserId:string;expectedStatus:string;clientRequestId?:string},client:Client=prisma){
  const requestFingerprint=fingerprint({expectedStatus:input.expectedStatus});
  return recover({clientRequestId:input.clientRequestId,mutate:()=>client.$transaction(async(tx)=>{const{user,task}=await taskForMutation(tx,input);if(!hasWorkPermission(user,"canMark"))throw new Error("Marking permission is required.");const prior=await replay(tx,{...input,requestKind:"COMPLETE",requestFingerprint});if(prior)return prior;
    if(task.status==="COMPLETED")return{taskId:task.id,status:"COMPLETED" as const,idempotent:true};if(task.status==="PROBLEM")throw new Error("Marking has a reported problem.");if(task.status!==input.expectedStatus||!["READY","IN_PROGRESS"].includes(task.status))throw new Error("Marking changed; refresh before completing.");if(task.assignedUserId&&task.assignedUserId!==user.id&&user.role!=="OWNER")throw new Error("This marking task was taken by another worker.");
    const changed=await tx.workTask.updateMany({where:{id:task.id,status:task.status,assignedUserId:task.assignedUserId},data:{status:"COMPLETED",completedQuantity:task.requiredQuantity,assignedUserId:task.assignedUserId??user.id,startedAt:task.startedAt??new Date(),startedByUserId:task.startedByUserId??user.id,completedAt:new Date(),completedByUserId:user.id}});if(changed.count!==1)throw new Error("Marking changed; refresh before completing.");
    const next=await tx.workTask.findFirst({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1}}),routeState=parseWorkRouteSnapshot(task.routeSnapshotJson)??createWorkRouteSnapshot({processRoute:null,currentStage:"MARK"}),raw=(()=>{try{return JSON.parse(task.routeSnapshotJson??"") as Record<string,unknown>;}catch{return{};}})(),routeSnapshotJson=JSON.stringify({...raw,routeVersion:routeState.routeVersion+1,completedStages:[...new Set([...routeState.completedStages,"MARK"])],currentStage:next?.stage??null,selectedNextStage:next?.stage??null});
    await tx.workActionLog.create({data:{accountId:input.accountId,taskId:task.id,actorUserId:user.id,action:"TASK_COMPLETED",requestKind:input.clientRequestId?"COMPLETE":null,clientRequestId:input.clientRequestId||null,quantityBefore:task.completedQuantity,quantityAfter:task.requiredQuantity,metadataJson:JSON.stringify({source:"ORDER_ROUTE",requestFingerprint})}});await tx.workTask.updateMany({where:{orderId:task.orderId},data:{routeSnapshotJson}});await tx.workTask.updateMany({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1,status:"LOCKED"},data:{status:"READY"}});await tx.workChangeEvent.create({data:{accountId:input.accountId,eventType:"ORDER_MARK_COMPLETED",sourceType:"ORDER",stage:"MARK",entityId:task.id}});await refreshAffectedWorkGroups({accountId:input.accountId,sourceType:"ORDER",stages:["MARK",...(next?[next.stage]:[])],taskIds:[task.id],orderIds:task.orderId?[task.orderId]:[]},tx);return{taskId:task.id,status:"COMPLETED" as const,idempotent:false};}),replay:()=>client.$transaction(async tx=>{const{user,task}=await taskForMutation(tx,input);if(!hasWorkPermission(user,"canMark"))throw new Error("Marking permission is required.");return replay(tx,{...input,taskId:task.id,requestKind:"COMPLETE",requestFingerprint});})});
}

export async function reportOrderMarkingProblem(input:{taskId:string;accountId:string;actorUserId:string;expectedStatus:string;reason:string;note?:string;clientRequestId?:string},client:Client=prisma){
  const allowed=new Set(["WRONG_PRODUCT","MARKING_FILE_MISSING","MARKING_FILE_WRONG","MARKING_FAILED","DAMAGED_PRODUCT","QUANTITY_SHORT","OTHER"]);if(!allowed.has(input.reason))throw new Error("Select a valid marking problem reason.");if(!input.clientRequestId)throw new Error("Problem request ID is required.");
  const task=await client.workTask.findFirst({where:{id:input.taskId,accountId:input.accountId,sourceType:"ORDER",stage:"MARK"},select:{id:true,orderId:true,version:true,status:true}});if(!task?.orderId)throw new Error("Marking task is unavailable.");
  const result=await reportOrderWorkflowProblem({actorUserId:input.actorUserId,accountId:input.accountId,orderId:task.orderId,taskId:task.id,stage:"MARK",reason:input.reason,note:input.note,expectedTaskVersion:task.version,expectedTaskStatus:input.expectedStatus as "READY"|"IN_PROGRESS",clientRequestId:input.clientRequestId},client);
  return{taskId:task.id,status:"PROBLEM" as const,idempotent:result.idempotent};
}
