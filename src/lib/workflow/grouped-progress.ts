import { Prisma, type PrismaClient, type WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { routeFingerprint } from "./dynamic-route";
import { getGroupedWork, type GroupedWorkSource } from "./grouped-work";
import { userCanMutateStage } from "./worker-access";

type Client = PrismaClient;

function isTransient(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2028", "P2034"].includes(error.code) || /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
}

export async function setGroupedProgress(input:{actorUserId:string;selectedAccountId:string;sourceType:GroupedWorkSource;stage:WorkStage;groupKey:string;expectedGroupVersion:string;targetCompletedQuantity:number;clientRequestId:string},client:Client=prisma){
  if(!Number.isSafeInteger(input.targetCompletedQuantity)||input.targetCompletedQuantity<0)throw new Error("Completed quantity must be a whole number.");
  const requestFingerprint=routeFingerprint({groupKey:input.groupKey,expectedGroupVersion:input.expectedGroupVersion,targetCompletedQuantity:input.targetCompletedQuantity,stage:input.stage,sourceType:input.sourceType});
  let last:unknown;
  for(let attempt=0;attempt<6;attempt++)try{return await client.$transaction(async tx=>{
    const replay=await tx.workActionLog.findMany({where:{accountId:input.selectedAccountId,actorUserId:input.actorUserId,requestKind:"SET_PROGRESS",clientRequestId:input.clientRequestId}});
    if(replay.length){const metadata=replay.map(log=>{try{return JSON.parse(log.metadataJson??"")as{requestFingerprint?:string;groupTarget?:number};}catch{return{};}}),valid=metadata.every(item=>item.requestFingerprint===requestFingerprint);if(!valid)throw new Error("Request ID was already used for different progress.");return{groupKey:input.groupKey,targetCompletedQuantity:metadata[0].groupTarget??input.targetCompletedQuantity,idempotent:true};}
    const resolved=await getGroupedWork({actorUserId:input.actorUserId,accountId:input.selectedAccountId,stage:input.stage,sourceType:input.sourceType,pageSize:50,includeMemberIds:true,targetGroupKey:input.groupKey},tx);
    const card=resolved.cards[0];if(!card||card.groupVersion!==input.expectedGroupVersion)throw new Error("Work changed. Return to the stage queue and refresh.");
    if(!userCanMutateStage(resolved.user,input.stage))throw new Error(`${input.stage} permission is required.`);
    if(input.targetCompletedQuantity<=card.completedQuantity)throw new Error(`Enter a quantity greater than ${card.completedQuantity}.`);
    if(input.targetCompletedQuantity>=card.requiredQuantity)throw new Error("Use the stage action to complete and route the full group.");
    const tasks=await tx.workTask.findMany({where:{id:{in:card.memberTaskIds},accountId:input.selectedAccountId,stage:input.stage,status:{in:["READY","IN_PROGRESS"]}},orderBy:[{assignedUserId:"desc"},{createdAt:"asc"},{id:"asc"}]});
    if(tasks.length!==card.memberTaskIds.length||tasks.some(task=>task.assignedUserId&&task.assignedUserId!==input.actorUserId&&resolved.user.role!=="OWNER"))throw new Error("Work changed. Return to the stage queue and refresh.");
    let remaining=input.targetCompletedQuantity-card.completedQuantity;const now=new Date(),groupAssignee=tasks[0]?.assignedUserId??input.actorUserId;
    const ordered=[...tasks].sort((a,b)=>(a.assignedUserId===input.actorUserId?0:1)-(b.assignedUserId===input.actorUserId?0:1)||a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));
    for(const task of ordered){const capacity=task.requiredQuantity-task.completedQuantity,increment=Math.min(capacity,remaining),after=task.completedQuantity+increment;const changed=await tx.workTask.updateMany({where:{id:task.id,version:task.version,status:task.status,completedQuantity:task.completedQuantity,assignedUserId:task.assignedUserId},data:{completedQuantity:after,status:increment>0?"IN_PROGRESS":task.status,assignedUserId:groupAssignee,startedAt:increment>0?task.startedAt??now:task.startedAt,startedByUserId:increment>0?task.startedByUserId??input.actorUserId:task.startedByUserId,version:{increment:1}}});if(changed.count!==1)throw new Error("Work changed. No partial progress was saved.");if(increment>0)await tx.workActionLog.create({data:{accountId:input.selectedAccountId,taskId:task.id,actorUserId:input.actorUserId,action:"TASK_PROGRESS_SET",requestKind:"SET_PROGRESS",clientRequestId:input.clientRequestId,quantityBefore:task.completedQuantity,quantityAfter:after,metadataJson:JSON.stringify({requestFingerprint,groupKey:card.groupKey,groupTarget:input.targetCompletedQuantity})}});remaining-=increment;}
    if(remaining!==0)throw new Error("The group no longer has enough pending quantity.");
    await tx.auditLog.create({data:{userId:input.actorUserId,accountId:input.selectedAccountId,action:"WORK_GROUP_PROGRESS_SET",entityType:"WorkGroup",entityId:card.groupKey,metadata:JSON.stringify({sourceType:input.sourceType,stage:input.stage,from:card.completedQuantity,to:input.targetCompletedQuantity})}});
    await tx.workChangeEvent.create({data:{accountId:input.selectedAccountId,eventType:"GROUP_PROGRESS_SET",sourceType:input.sourceType,stage:input.stage,groupKey:card.groupKey}});
    return{groupKey:card.groupKey,targetCompletedQuantity:input.targetCompletedQuantity,idempotent:false};
  });}catch(error){last=error;if(!isTransient(error)||attempt===5)throw isTransient(error)?new Error("Work is busy; retry the action."):error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}
  throw last;
}
