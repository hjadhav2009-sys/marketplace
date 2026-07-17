import { Prisma, type PrismaClient, type ProcessRoute, type WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertValidStageTransition, createWorkRouteSnapshot, parseWorkRouteSnapshot, recommendedNextStage, routeFingerprint, type WorkRouteSnapshotV2 } from "./dynamic-route";
import { getGroupedWork, type GroupedWorkSource } from "./grouped-work";
import { getRouteDecisionPolicy, sanitizeRouteNote, validateRouteDecisionReason } from "./route-decision-policy";
import { resolveRouteSourceContext, resolveRouteStageMetadata, type PostPickRoute } from "./route-selection";
import { userCanMutateStage } from "./worker-access";
import { refreshAffectedWorkGroups } from "./work-group-projection";

type Client = PrismaClient;
type Transaction = Prisma.TransactionClient;
type RouteInput = { nextStage?: WorkStage; useRecommendedNextStage?: boolean; routeReason?: string; routeOtherReason?: string; workerNote?: string; confirmMissingInstructions?: boolean };
type MemberTask = Prisma.WorkTaskGetPayload<{ include: { consignmentLine: { select: { processRoute: true } } } }>;
const PROCESS_TO_CHOICE:Record<ProcessRoute,PostPickRoute>={PICK_PACK:"DIRECT_PACK",PICK_MARK_PACK:"MARK",PICK_ASSEMBLE_PACK:"ASSEMBLE",PICK_MARK_ASSEMBLE_PACK:"MARK_ASSEMBLE"};

function isTransient(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2028", "P2034"].includes(error.code) || /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
}

function processRoute(value:string|null){try{const parsed=JSON.parse(value??"")as{processRoute?:ProcessRoute;recommendedProcessRoute?:ProcessRoute};return parsed.processRoute??parsed.recommendedProcessRoute??null;}catch{return null;}}
function sourceWhere(task:MemberTask){return task.sourceType==="ORDER"?{orderId:task.orderId!}:{consignmentLineId:task.consignmentLineId!};}
function nextSnapshot(snapshot:WorkRouteSnapshotV2,from:WorkStage,to:WorkStage|undefined,actorUserId:string){return{...snapshot,routeVersion:snapshot.routeVersion+1,currentStage:to??from,selectedNextStage:to,actualStages:to?[...snapshot.actualStages,to]:snapshot.actualStages,completedStages:[...new Set([...snapshot.completedStages,from])],decisions:to?[...snapshot.decisions,{fromStage:from,toStage:to,actorUserId,decidedAt:new Date().toISOString(),reason:"DEFAULT" as const}]:snapshot.decisions};}

async function routeFinishedMember(tx:Transaction,input:{task:MemberTask;actorUserId:string;accountId:string;stage:WorkStage;clientRequestId:string;requestFingerprint:string}&RouteInput){
  if(input.stage==="PACK")throw new Error("Packing is package-based and cannot use partial or exact member selection.");
  const task=input.task,sourceId=task.orderId??task.consignmentLineId!,fallbackRoute=processRoute(task.metadataJson)??task.consignmentLine?.processRoute??null;
  const snapshot=parseWorkRouteSnapshot(task.routeSnapshotJson)??createWorkRouteSnapshot({processRoute:fallbackRoute,currentStage:input.stage});
  const sourceContext=await resolveRouteSourceContext(tx,{accountId:input.accountId,sourceType:task.sourceType,sourceId});
  const explicitSnapshot=sourceContext.savedProcessRoute?createWorkRouteSnapshot({processRoute:sourceContext.savedProcessRoute,currentStage:input.stage}):null;
  const savedNext=explicitSnapshot?recommendedNextStage(explicitSnapshot,input.stage):null;
  const next=input.useRecommendedNextStage===false?input.nextStage:recommendedNextStage(snapshot,input.stage);
  assertValidStageTransition(snapshot,input.stage,next);
  const policy=getRouteDecisionPolicy({hasExplicitSavedRoute:sourceContext.hasExplicitSavedRoute,savedRoute:sourceContext.savedProcessRoute,savedNextStage:savedNext,selectedNextStage:next??null});
  const reason=validateRouteDecisionReason({required:policy.reasonRequired,reason:input.routeReason,otherReason:input.routeOtherReason});
  const workerNote=sanitizeRouteNote(input.workerNote);
  let metadata:string|null=null,missingInstructionStage:WorkStage|null=null;
  if(next==="MARK"||next==="ASSEMBLE"){
    const choice=input.useRecommendedNextStage!==false&&(sourceContext.savedProcessRoute??fallbackRoute)?PROCESS_TO_CHOICE[(sourceContext.savedProcessRoute??fallbackRoute)!]:next==="MARK"?"MARK":"ASSEMBLE";
    const resolution=await resolveRouteStageMetadata(tx,{accountId:input.accountId,actorUserId:input.actorUserId,sourceType:task.sourceType,sourceId,route:choice,requestFingerprint:input.requestFingerprint,workerNote});
    metadata=resolution.get(next)??null;missingInstructionStage=resolution.missingStages.includes(next)?next:null;
    if(missingInstructionStage&&!input.confirmMissingInstructions)throw new Error(`Saved ${next==="MARK"?"Marking":"Assembly"} instructions are unavailable. Confirm Continue to create manual-route work.`);
  }
  const routedSnapshot=nextSnapshot(snapshot,input.stage,next,input.actorUserId);
  if(next){
    const existing=await tx.workTask.findFirst({where:{accountId:input.accountId,...sourceWhere(task),stage:next}});
    if(existing?.status==="COMPLETED")throw new Error(`${next} was already completed.`);
    if(existing)await tx.workTask.update({where:{id:existing.id},data:{status:"READY",metadataJson:metadata??existing.metadataJson,routeSnapshotJson:JSON.stringify(routedSnapshot),version:{increment:1}}});
    else{const max=await tx.workTask.aggregate({where:sourceWhere(task),_max:{sequenceNumber:true}});await tx.workTask.create({data:{accountId:input.accountId,sourceType:task.sourceType,orderId:task.orderId,consignmentLineId:task.consignmentLineId,stage:next,sequenceNumber:(max._max.sequenceNumber??0)+1,requiredQuantity:task.requiredQuantity,status:"READY",metadataJson:metadata,workCardSnapshotJson:task.workCardSnapshotJson,routeSnapshotJson:JSON.stringify(routedSnapshot)}});}
    await tx.workRouteDecision.create({data:{accountId:input.accountId,taskId:task.id,sourceType:task.sourceType,sourceId,sellerSku:sourceContext.sellerSku,reference:sourceContext.reference,savedRoute:sourceContext.savedProcessRoute,savedNextStage:savedNext,selectedNextStage:next,decisionType:policy.decisionType,reason,workerNote:workerNote||null,missingInstructionStage,actorUserId:input.actorUserId}});
  }
  if(task.sourceType==="ORDER"&&task.orderId&&input.stage==="PICK")await tx.order.update({where:{id:task.orderId},data:{pickStatus:"PICKED",packStatus:"READY"}});
  return{next,routedSnapshot,decisionType:policy.decisionType,reason,workerNote,missingInstructionStage};
}

async function retry<T>(client:Client,operation:(tx:Transaction)=>Promise<T>){let last:unknown;for(let attempt=0;attempt<6;attempt++)try{return await client.$transaction(operation);}catch(error){last=error;if(!isTransient(error)||attempt===5)throw isTransient(error)?new Error("Work is busy; retry the action."):error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}throw last;}

export async function setGroupedProgress(input:{actorUserId:string;selectedAccountId:string;sourceType:GroupedWorkSource;stage:WorkStage;groupKey:string;expectedGroupVersion:string;targetCompletedQuantity:number;clientRequestId:string}&RouteInput,client:Client=prisma){
  if(input.stage==="PACK")throw new Error("Packing is package-based. Use Pack Completed for the full verified package.");
  if(!Number.isSafeInteger(input.targetCompletedQuantity)||input.targetCompletedQuantity<0)throw new Error("Completed quantity must be a whole number.");
  const requestFingerprint=routeFingerprint({groupKey:input.groupKey,expectedGroupVersion:input.expectedGroupVersion,targetCompletedQuantity:input.targetCompletedQuantity,stage:input.stage,sourceType:input.sourceType,nextStage:input.nextStage??null,useRecommended:input.useRecommendedNextStage!==false});
  return retry(client,async tx=>{
    const resolved=await getGroupedWork({actorUserId:input.actorUserId,accountId:input.selectedAccountId,stage:input.stage,sourceType:input.sourceType,pageSize:50,includeMemberIds:true,targetGroupKey:input.groupKey},tx);
    if(!userCanMutateStage(resolved.user,input.stage))throw new Error(`${input.stage} permission is required.`);
    const replay=await tx.workActionLog.findMany({where:{accountId:input.selectedAccountId,actorUserId:input.actorUserId,requestKind:"SET_PROGRESS",clientRequestId:input.clientRequestId}});
    if(replay.length){const metadata=replay.map(log=>{try{return JSON.parse(log.metadataJson??"")as{requestFingerprint?:string;groupTarget?:number};}catch{return{};}});if(metadata.some(item=>item.requestFingerprint!==requestFingerprint))throw new Error("Request ID was already used for different progress.");return{groupKey:input.groupKey,targetCompletedQuantity:metadata[0].groupTarget??input.targetCompletedQuantity,idempotent:true};}
    const card=resolved.cards[0];if(!card||card.groupVersion!==input.expectedGroupVersion)throw new Error("Work changed. Return to the stage queue and refresh.");
    if(input.targetCompletedQuantity<=card.completedQuantity)throw new Error(`Enter a quantity greater than ${card.completedQuantity}.`);
    if(input.targetCompletedQuantity>=card.requiredQuantity)throw new Error("Use the stage action to complete and route the full group.");
    const tasks=await tx.workTask.findMany({where:{id:{in:card.memberTaskIds},accountId:input.selectedAccountId,sourceType:input.sourceType,stage:input.stage,status:{in:["READY","IN_PROGRESS"]}},include:{consignmentLine:{select:{processRoute:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
    if(tasks.length!==card.memberTaskIds.length||tasks.some(task=>task.assignedUserId&&task.assignedUserId!==input.actorUserId&&resolved.user.role!=="OWNER"))throw new Error("Work changed. Return to the stage queue and refresh.");
    const ordered=[...tasks].sort((a,b)=>(a.assignedUserId===input.actorUserId?0:1)-(b.assignedUserId===input.actorUserId?0:1)||a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));
    let remaining=input.targetCompletedQuantity-card.completedQuantity;const now=new Date();let completedMembers=0,partialMembers=0;
    for(const task of ordered){if(remaining<=0)break;const increment=Math.min(task.requiredQuantity-task.completedQuantity,remaining);if(increment<=0)continue;const after=task.completedQuantity+increment,finished=after===task.requiredQuantity;let routeResult:Awaited<ReturnType<typeof routeFinishedMember>>|null=null;if(finished)routeResult=await routeFinishedMember(tx,{...input,task,accountId:input.selectedAccountId,requestFingerprint});const changed=await tx.workTask.updateMany({where:{id:task.id,version:task.version,status:task.status,completedQuantity:task.completedQuantity,assignedUserId:task.assignedUserId},data:{completedQuantity:after,status:finished?"COMPLETED":"IN_PROGRESS",startedAt:task.startedAt??now,startedByUserId:task.startedByUserId??input.actorUserId,completedAt:finished?now:task.completedAt,completedByUserId:finished?input.actorUserId:task.completedByUserId,routeSnapshotJson:routeResult?JSON.stringify(routeResult.routedSnapshot):task.routeSnapshotJson,version:{increment:1}}});if(changed.count!==1)throw new Error("Work changed. No partial progress was saved.");await tx.workActionLog.create({data:{accountId:input.selectedAccountId,taskId:task.id,actorUserId:input.actorUserId,action:"TASK_PROGRESS_SET",requestKind:"SET_PROGRESS",clientRequestId:input.clientRequestId,quantityBefore:task.completedQuantity,quantityAfter:after,metadataJson:JSON.stringify({requestFingerprint,groupKey:card.groupKey,groupTarget:input.targetCompletedQuantity,nextStage:routeResult?.next??null})}});remaining-=increment;if(finished)completedMembers++;else partialMembers++;}
    if(remaining!==0)throw new Error("The group no longer has enough pending quantity.");
    await tx.auditLog.create({data:{userId:input.actorUserId,accountId:input.selectedAccountId,action:"WORK_GROUP_PROGRESS_SET",entityType:"WorkGroup",entityId:card.groupKey,metadata:JSON.stringify({sourceType:input.sourceType,stage:input.stage,from:card.completedQuantity,to:input.targetCompletedQuantity,completedMembers,partialMembers})}});
    await tx.workChangeEvent.create({data:{accountId:input.selectedAccountId,eventType:"GROUP_PROGRESS_SET",sourceType:input.sourceType,stage:input.stage,groupKey:card.groupKey}});
    const next=input.useRecommendedNextStage===false?input.nextStage:card.recommendedNextStage;await refreshAffectedWorkGroups({accountId:input.selectedAccountId,sourceType:input.sourceType,stages:[input.stage,...(next?[next]:[])],taskIds:tasks.map(task=>task.id),orderIds:tasks.flatMap(task=>task.orderId?[task.orderId]:[]),consignmentLineIds:tasks.flatMap(task=>task.consignmentLineId?[task.consignmentLineId]:[])},tx);
    return{groupKey:card.groupKey,targetCompletedQuantity:input.targetCompletedQuantity,completedMembers,partialMembers,idempotent:false};
  });
}

export async function completeSelectedGroupMembers(input:{actorUserId:string;selectedAccountId:string;sourceType:GroupedWorkSource;stage:WorkStage;groupKey:string;expectedGroupVersion:string;selectedTaskIds:string[];clientRequestId:string}&RouteInput,client:Client=prisma){
  if(input.stage==="PACK")throw new Error("Packing is package-based and cannot use exact member selection.");
  const selectedIds=[...new Set(input.selectedTaskIds.filter(Boolean))].sort();if(!selectedIds.length)throw new Error("Select at least one eligible member.");
  const requestFingerprint=routeFingerprint({groupKey:input.groupKey,expectedGroupVersion:input.expectedGroupVersion,selectedIds,stage:input.stage,sourceType:input.sourceType,nextStage:input.nextStage??null,useRecommended:input.useRecommendedNextStage!==false});
  return retry(client,async tx=>{
    const resolved=await getGroupedWork({actorUserId:input.actorUserId,accountId:input.selectedAccountId,stage:input.stage,sourceType:input.sourceType,pageSize:50,includeMemberIds:true,targetGroupKey:input.groupKey},tx);
    if(!userCanMutateStage(resolved.user,input.stage))throw new Error(`${input.stage} permission is required.`);const card=resolved.cards[0];
    if(!card||card.groupVersion!==input.expectedGroupVersion)throw new Error("Work changed. Return to Details and refresh.");
    if(selectedIds.some(id=>!card.memberTaskIds.includes(id)))throw new Error("One or more selected members are not eligible in this work group.");
    const tasks=await tx.workTask.findMany({where:{id:{in:selectedIds},accountId:input.selectedAccountId,sourceType:input.sourceType,stage:input.stage,status:{in:["READY","IN_PROGRESS"]}},include:{consignmentLine:{select:{processRoute:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
    if(tasks.length!==selectedIds.length||tasks.some(task=>task.assignedUserId&&task.assignedUserId!==input.actorUserId&&resolved.user.role!=="OWNER"))throw new Error("Selected work changed. No members were completed.");
    const now=new Date();for(const task of tasks){const routeResult=await routeFinishedMember(tx,{...input,task,accountId:input.selectedAccountId,requestFingerprint});const changed=await tx.workTask.updateMany({where:{id:task.id,version:task.version,status:task.status,completedQuantity:task.completedQuantity,assignedUserId:task.assignedUserId},data:{completedQuantity:task.requiredQuantity,status:"COMPLETED",assignedUserId:task.assignedUserId??input.actorUserId,startedAt:task.startedAt??now,startedByUserId:task.startedByUserId??input.actorUserId,completedAt:now,completedByUserId:input.actorUserId,routeSnapshotJson:JSON.stringify(routeResult.routedSnapshot),version:{increment:1}}});if(changed.count!==1)throw new Error("Selected work changed. No members were completed.");await tx.workActionLog.create({data:{accountId:input.selectedAccountId,taskId:task.id,actorUserId:input.actorUserId,action:"TASK_COMPLETED",requestKind:"SET_PROGRESS",clientRequestId:input.clientRequestId,quantityBefore:task.completedQuantity,quantityAfter:task.requiredQuantity,metadataJson:JSON.stringify({requestFingerprint,groupKey:card.groupKey,exactSelection:true,nextStage:routeResult.next??null})}});}
    await tx.auditLog.create({data:{userId:input.actorUserId,accountId:input.selectedAccountId,action:"WORK_GROUP_MEMBERS_COMPLETED",entityType:"WorkGroup",entityId:card.groupKey,metadata:JSON.stringify({sourceType:input.sourceType,stage:input.stage,memberCount:tasks.length,quantity:tasks.reduce((sum,task)=>sum+task.requiredQuantity-task.completedQuantity,0)})}});await tx.workChangeEvent.create({data:{accountId:input.selectedAccountId,eventType:"GROUP_PROGRESS_SET",sourceType:input.sourceType,stage:input.stage,groupKey:card.groupKey}});const next=input.useRecommendedNextStage===false?input.nextStage:card.recommendedNextStage;await refreshAffectedWorkGroups({accountId:input.selectedAccountId,sourceType:input.sourceType,stages:[input.stage,...(next?[next]:[])],taskIds:tasks.map(task=>task.id),orderIds:tasks.flatMap(task=>task.orderId?[task.orderId]:[]),consignmentLineIds:tasks.flatMap(task=>task.consignmentLineId?[task.consignmentLineId]:[])},tx);return{groupKey:card.groupKey,completedMemberCount:tasks.length,completedQuantity:tasks.reduce((sum,task)=>sum+task.requiredQuantity-task.completedQuantity,0),idempotent:false};
  });
}
