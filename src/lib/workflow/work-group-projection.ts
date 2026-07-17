import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type ProcessRoute, type WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createWorkRouteSnapshot, parseWorkRouteSnapshot, recommendedNextStage } from "./dynamic-route";

type Client = PrismaClient | Prisma.TransactionClient;
export type ProjectionSource = "ORDER" | "CONSIGNMENT";

const INCLUDE = Prisma.validator<Prisma.WorkTaskInclude>()({
  assignedUser: { select: { name: true } },
  order: { select: { batchId: true, marketplace: true, sku: true, color: true, size: true, trackingId: true, awb: true, orderNo: true, productDescription: true, imageUrl: true } },
  consignmentLine: { select: { consignmentBatchId: true, processRoute: true, sellerSkuSnapshot: true, sellerSkuSource: true, colorSource: true, sizeSource: true, fnskuSnapshot: true, fnskuSource: true, barcodeSnapshot: true, fsnSnapshot: true, listingIdSnapshot: true, productTitleSnapshot: true, productNameSource: true, productImageSnapshot: true, consignmentBatch: { select: { marketplace: true, externalConsignmentNumber: true } } } }
});
type ProjectionTask = Prisma.WorkTaskGetPayload<{ include: typeof INCLUDE }>;
const sha = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function parseObject(value: string | null) {
  try { const parsed = JSON.parse(value ?? ""); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

const VOLATILE_KEYS = new Set(["requestFingerprint", "requestedAt", "requestedByUserId", "actorUserId", "taskId", "routeDecisionTimestamp", "decidedAt", "createdAt", "updatedAt", "audit", "routedByUserId", "routedAt", "requestId", "clientRequestId", "importTimestamp"]);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !VOLATILE_KEYS.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
}

export function canonicalInstructionFingerprint(metadataJson: string | null, stage?: WorkStage) {
  if (stage === "PACK") return sha("PACK");
  return sha(canonical(parseObject(metadataJson)));
}

export function canonicalRouteFingerprint(routeSnapshotJson: string | null, metadataJson: string | null, workCardSnapshotJson?: string | null, stage?: WorkStage) {
  if (stage === "PACK") return sha("PACK");
  const route = parseObject(routeSnapshotJson);
  const metadata = parseObject(metadataJson);
  const work = parseObject(workCardSnapshotJson ?? null);
  const source = work.routeRecommendationSource === "PRODUCT_RULE" ? "EXPLICIT_PRODUCT_RULE" : work.routeRecommendationSource ?? route.routeRecommendationSource ?? "LEGACY_SNAPSHOT";
  return sha(canonical({
    routeRecommendation: work.routeRecommendation ?? route.routeRecommendation ?? metadata.processRoute ?? metadata.recommendedProcessRoute ?? null,
    routeRecommendationSource: source,
    hasExplicitSavedRoute: work.hasExplicitSavedRoute ?? route.hasExplicitSavedRoute ?? false,
    savedProcessRoute: work.savedProcessRoute ?? route.savedProcessRoute ?? (work.hasExplicitSavedRoute === true ? work.routeRecommendation : null),
    savedProcessRuleId: work.savedProcessRuleId ?? route.savedProcessRuleId ?? null,
    savedProcessRuleFingerprint: work.savedProcessRuleFingerprint ?? route.savedProcessRuleFingerprint ?? null,
    selectedProcessRoute: metadata.processRoute ?? route.selectedProcessRoute ?? null,
    recommendedStages: route.recommendedStages ?? null
  }));
}

export function safeWorkSnapshot(value: string | null) { return parseObject(value); }

function taskGroups(input: { accountId: string; sourceType: ProjectionSource; stage: WorkStage; marketplace: string }, tasks: ProjectionTask[]) {
  const grouped = new Map<string, { parts: string[]; sku: string; tasks: ProjectionTask[] }>();
  for (const task of tasks) {
    const order = task.order, line = task.consignmentLine;
    if (!order && !line) continue;
    const snapshot = safeWorkSnapshot(task.workCardSnapshotJson);
    const marketplace = order?.marketplace ?? line?.consignmentBatch.marketplace ?? input.marketplace;
    const sku = String(snapshot.sellerSku ?? order?.sku ?? line?.sellerSkuSnapshot ?? line?.sellerSkuSource ?? "");
    const identity = input.stage === "PACK" && order ? `PACKAGE:${order.trackingId ?? order.awb}` : sku;
    const batch = input.stage === "PACK" && order ? "shipment" : order?.batchId ?? line?.consignmentBatchId ?? "unbatched";
    const variant = sha([identity, snapshot.variantIdentity ?? null, order?.color ?? line?.colorSource ?? null, order?.size ?? line?.sizeSource ?? null]);
    const instruction = canonicalInstructionFingerprint(task.metadataJson, input.stage);
    const route = canonicalRouteFingerprint(task.routeSnapshotJson, task.metadataJson, task.workCardSnapshotJson, input.stage);
    const assignment = task.assignedUserId ?? "UNASSIGNED";
    const parts = [input.accountId, marketplace, input.sourceType, input.stage, batch, identity, variant, instruction, route, assignment];
    const raw = parts.join("\u0000"), group = grouped.get(raw) ?? { parts, sku, tasks: [] };
    group.tasks.push(task); grouped.set(raw, group);
  }
  return grouped;
}

function buildProjectionData(input:{accountId:string;sourceType:ProjectionSource;stage:WorkStage;marketplace:string},tasks:ProjectionTask[],relevantTaskIds?:Set<string>){
  const rows: Prisma.WorkGroupProjectionCreateManyInput[] = [], members: Prisma.WorkGroupMemberCreateManyInput[] = [];
  for (const group of taskGroups(input, tasks)) {
    if(relevantTaskIds&&!group[1].tasks.some(task=>relevantTaskIds.has(task.id)))continue;
    const actionable = group[1].tasks.filter(task => task.status !== "PROBLEM" && task.status !== "COMPLETED");
    if (!actionable.length) continue;
    const all = group[1].tasks, nonProblem = all.filter(task => task.status !== "PROBLEM"), first = actionable[0], order = first.order, line = first.consignmentLine;
    const snapshot = safeWorkSnapshot(first.workCardSnapshotJson), parsedRoute = parseWorkRouteSnapshot(first.routeSnapshotJson) ?? createWorkRouteSnapshot({ processRoute: line?.processRoute ?? null, currentStage: input.stage });
    const groupKey = sha(group[1].parts), required = nonProblem.reduce((sum, task) => sum + task.requiredQuantity, 0), completed = nonProblem.reduce((sum, task) => sum + task.completedQuantity, 0);
    rows.push({
      groupKey, accountId: input.accountId, sourceType: input.sourceType, stage: input.stage,
      sourceBatchId: group[1].parts[4], marketplace: group[1].parts[1], sellerSku: group[1].sku,
      variantHash: group[1].parts[6], instructionHash: group[1].parts[7], routeHash: group[1].parts[8], assignmentKey: group[1].parts[9],
      assignedUserId: first.assignedUserId, assignedUserName: first.assignedUser?.name ?? null,
      productTitle: String(snapshot.productTitle ?? order?.productDescription ?? line?.productTitleSnapshot ?? line?.productNameSource ?? "") || null,
      productImageUrl: String(snapshot.primaryImage ?? order?.imageUrl ?? line?.productImageSnapshot ?? "") || null,
      operationalIdentifier: String(snapshot.operationalBarcode ?? order?.trackingId ?? order?.awb ?? line?.fnskuSnapshot ?? line?.fnskuSource ?? line?.barcodeSnapshot ?? line?.fsnSnapshot ?? line?.listingIdSnapshot ?? "") || null,
      reference: order?.trackingId ?? order?.orderNo ?? line?.consignmentBatch.externalConsignmentNumber ?? "",
      memberCount: all.length, requiredQuantity: required, completedQuantity: completed,
      completeMemberCount: nonProblem.filter(task => task.completedQuantity >= task.requiredQuantity).length,
      partialMemberCount: nonProblem.filter(task => task.completedQuantity > 0 && task.completedQuantity < task.requiredQuantity).length,
      problemCount: all.length - nonProblem.length,
      status: actionable.some(task => task.status === "IN_PROGRESS") ? "IN_PROGRESS" : "READY",
      oldestWaitingAt: actionable.reduce((oldest, task) => task.createdAt < oldest ? task.createdAt : oldest, first.createdAt),
      recommendedNextStage: input.stage === "PACK" ? null : recommendedNextStage(parsedRoute, input.stage),
      hasExplicitSavedRoute: snapshot.hasExplicitSavedRoute === true,
      savedProcessRoute: snapshot.hasExplicitSavedRoute === true ? String(snapshot.routeRecommendation) as ProcessRoute : null,
      groupVersion: sha(all.slice().sort((a, b) => a.id.localeCompare(b.id)).map(task => [task.id, task.version, task.status, task.completedQuantity, task.assignedUserId]))
    });
    for (const task of all) members.push({ groupKey, taskId: task.id });
  }
  return{rows,members};
}

async function replaceProjection(input: { accountId: string; sourceType: ProjectionSource; stage: WorkStage }, client: Client) {
  const account = await client.account.findUniqueOrThrow({ where: { id: input.accountId }, select: { marketplace: true } });
  const activeTasks=await client.workTask.findMany({where:{accountId:input.accountId,sourceType:input.sourceType,stage:input.stage,status:{in:["READY","IN_PROGRESS","PROBLEM"]}},include:INCLUDE,orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const cohortOr:Prisma.WorkTaskWhereInput[]=[];for(const task of activeTasks){if(task.order){if(input.stage==="PACK")cohortOr.push(task.order.trackingId?{order:{trackingId:task.order.trackingId}}:{order:{awb:task.order.awb}});else cohortOr.push({order:{batchId:task.order.batchId,sku:task.order.sku}});}else if(task.consignmentLine){cohortOr.push(input.stage==="PACK"?{consignmentLine:{consignmentBatchId:task.consignmentLine.consignmentBatchId}}:{consignmentLine:{consignmentBatchId:task.consignmentLine.consignmentBatchId,OR:[{sellerSkuSnapshot:task.consignmentLine.sellerSkuSnapshot},{sellerSkuSource:task.consignmentLine.sellerSkuSource}]}});}}
  const uniqueCohorts=[...new Map(cohortOr.map(where=>[JSON.stringify(where),where])).values()],completedTasks:typeof activeTasks=[];for(let index=0;index<uniqueCohorts.length;index+=50){completedTasks.push(...await client.workTask.findMany({where:{accountId:input.accountId,sourceType:input.sourceType,stage:input.stage,status:"COMPLETED",OR:uniqueCohorts.slice(index,index+50)},include:INCLUDE,orderBy:[{createdAt:"asc"},{id:"asc"}]}));}
  const tasks=[...new Map([...activeTasks,...completedTasks].map(task=>[task.id,task])).values()].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id));
  const {rows,members}=buildProjectionData({...input,marketplace:String(account.marketplace)},tasks);
  await client.workGroupProjection.deleteMany({ where: input });
  for (let index = 0; index < rows.length; index += 500) await client.workGroupProjection.createMany({ data: rows.slice(index, index + 500) });
  for (let index = 0; index < members.length; index += 1000) await client.workGroupMember.createMany({ data: members.slice(index, index + 1000) });
  const priorState=await client.workProjectionState.findUnique({where:{accountId_sourceType_stage:input},select:{lastAppliedTaskVersion:true}}),lastAppliedTaskVersion=Math.max(priorState?.lastAppliedTaskVersion??0,...tasks.map(task=>task.version),0);await client.workProjectionState.upsert({where:{accountId_sourceType_stage:input},create:{...input,state:"READY",lastAppliedTaskVersion},update:{state:"READY",lastAppliedTaskVersion,rebuildLeaseOwner:null,rebuildLeaseExpiresAt:null,errorSummary:null}});return { groupCount: rows.length, memberCount: members.length };
}

export async function rebuildWorkGroupProjection(input: { accountId: string; sourceType: ProjectionSource; stage: WorkStage }, client: Client = prisma) {
  if ("$transaction" in client) return (client as PrismaClient).$transaction(tx => replaceProjection(input, tx), { timeout: 120000 });
  return replaceProjection(input, client);
}

export async function refreshAffectedWorkGroups(input:{accountId:string;sourceType:ProjectionSource;stages:WorkStage[];taskIds?:string[];orderIds?:string[];consignmentLineIds?:string[]},client:Client=prisma){
  const account=await client.account.findUniqueOrThrow({where:{id:input.accountId},select:{marketplace:true}}),results:Record<string,{groupCount:number;memberCount:number}>={};
  for(const stage of [...new Set(input.stages)]){
    const directWhere:Prisma.WorkTaskWhereInput={accountId:input.accountId,sourceType:input.sourceType,stage,OR:[...(input.taskIds?.length?[{id:{in:input.taskIds}}]:[]),...(input.orderIds?.length?[{orderId:{in:input.orderIds}}]:[]),...(input.consignmentLineIds?.length?[{consignmentLineId:{in:input.consignmentLineIds}}]:[])]};
    const affected=directWhere.OR?.length?await client.workTask.findMany({where:directWhere,include:INCLUDE}):[];
    const affectedIds=new Set(affected.map(task=>task.id)),oldMemberships=affectedIds.size?await client.workGroupMember.findMany({where:{taskId:{in:[...affectedIds]},projection:{accountId:input.accountId,sourceType:input.sourceType,stage}},select:{groupKey:true}}):[];
    const oldGroupKeys=[...new Set(oldMemberships.map(item=>item.groupKey))],oldMembers=oldGroupKeys.length?await client.workGroupMember.findMany({where:{groupKey:{in:oldGroupKeys}},select:{taskId:true}}):[],oldMemberIds=oldMembers.map(item=>item.taskId);
    const cohortOr:Prisma.WorkTaskWhereInput[]=[];
    for(const task of affected){if(task.order){if(stage==="PACK")cohortOr.push(task.order.trackingId?{order:{trackingId:task.order.trackingId}}:{order:{awb:task.order.awb}});else cohortOr.push({order:{batchId:task.order.batchId,sku:task.order.sku}});}else if(task.consignmentLine){cohortOr.push(stage==="PACK"?{consignmentLine:{consignmentBatchId:task.consignmentLine.consignmentBatchId}}:{consignmentLine:{consignmentBatchId:task.consignmentLine.consignmentBatchId,OR:[{sellerSkuSnapshot:task.consignmentLine.sellerSkuSnapshot},{sellerSkuSource:task.consignmentLine.sellerSkuSource}]}});}}
    const candidates=await client.workTask.findMany({where:{accountId:input.accountId,sourceType:input.sourceType,stage,status:{in:["READY","IN_PROGRESS","PROBLEM","COMPLETED"]},OR:[...(oldMemberIds.length?[{id:{in:oldMemberIds}}]:[]),...cohortOr]},include:INCLUDE,orderBy:[{createdAt:"asc"},{id:"asc"}]});
    const relevantIds=new Set([...affectedIds,...oldMemberIds]),{rows,members}=buildProjectionData({accountId:input.accountId,sourceType:input.sourceType,stage,marketplace:String(account.marketplace)},candidates,relevantIds),replaceKeys=[...new Set([...oldGroupKeys,...rows.map(row=>row.groupKey)])];
    if(replaceKeys.length)await client.workGroupProjection.deleteMany({where:{groupKey:{in:replaceKeys},accountId:input.accountId,sourceType:input.sourceType,stage}});for(let index=0;index<rows.length;index+=500)await client.workGroupProjection.createMany({data:rows.slice(index,index+500)});for(let index=0;index<members.length;index+=1000)await client.workGroupMember.createMany({data:members.slice(index,index+1000)});const stateKey={accountId:input.accountId,sourceType:input.sourceType,stage},prior=await client.workProjectionState.findUnique({where:{accountId_sourceType_stage:stateKey},select:{lastAppliedTaskVersion:true}}),lastAppliedTaskVersion=Math.max(prior?.lastAppliedTaskVersion??0,...affected.map(task=>task.version),0);await client.workProjectionState.upsert({where:{accountId_sourceType_stage:stateKey},create:{...stateKey,state:"READY",lastAppliedTaskVersion},update:{state:"READY",lastAppliedTaskVersion,errorSummary:null}});results[stage]={groupCount:rows.length,memberCount:members.length};
  }
  return results;
}

export async function ensureWorkGroupProjection(input: { accountId: string; sourceType: ProjectionSource; stage: WorkStage }, client: Client = prisma) {
  const activeStatuses = ["READY", "IN_PROGRESS", "PROBLEM"] as const;
  const [active, projectedActive,groups,state] = await Promise.all([
    client.workTask.count({ where: { ...input, status: { in: [...activeStatuses] } } }),
    client.workGroupMember.count({ where: { projection: input, task: { status: { in: [...activeStatuses] } } } }),
    client.workGroupProjection.count({where:input}),client.workProjectionState.findUnique({where:{accountId_sourceType_stage:input}})
  ]);
  return { active, projectedActive, groups, state:state?.state??"UNINITIALIZED", consistent: state?.state==="READY"&&active === projectedActive && Boolean(active || !groups) };
}
