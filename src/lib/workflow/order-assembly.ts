import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type WorkRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { startOfApplicationDay } from "./dates";
import { buildOrderAssemblyMetadata, parseOrderAssemblyMetadata } from "./order-assembly-metadata";
import { resolveOrderAssemblyPolicies, resolveOrderAssemblyPolicy, type OrderAssemblyPolicy } from "./order-assembly-policy";
import { assertWorkerAccountAccess } from "./worker-access";
import { createWorkRouteSnapshot, parseWorkRouteSnapshot } from "./dynamic-route";
import { refreshAffectedWorkGroups } from "./work-group-projection";
import { reportOrderWorkflowProblem, resolveOrderWorkflowProblem } from "./order-problems";
import { assertReusableDownstreamTask } from "./downstream-task-safety";
import { beginWorkflowActionReceipt, completeWorkflowActionReceipt, withWorkflowActionRequestGate } from "./workflow-action-receipt";

type Client = PrismaClient;
type Transaction = Prisma.TransactionClient;
type AssemblyOrder = { id: string; accountId: string; sku: string; qty: number; productDescription: string | null; imageUrl: string | null };

export const ORDER_ASSEMBLY_PROBLEM_CATEGORIES = [
  "PRODUCT_NOT_AVAILABLE", "WRONG_PRODUCT", "PART_MISSING", "ASSEMBLY_INSTRUCTION_MISSING", "ASSEMBLY_IMAGE_MISSING",
  "ASSEMBLY_FAILED", "DAMAGED_PRODUCT", "QUANTITY_MISMATCH", "OTHER"
] as const;

const MANUAL_DIVERSION_STATES = new Set(["NO_RULE", "READY_MADE", "REQUIRED_NO_TASK", "AMBIGUOUS_LISTING"]);
export function canOfferManualAssemblyDiversion(state: string | null | undefined) {
  return MANUAL_DIVERSION_STATES.has(state ?? "NO_RULE");
}

function fingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function taskMetadata(order: AssemblyOrder, policy: Extract<OrderAssemblyPolicy, { state: "ASSEMBLY_REQUIRED" }>, actorUserId: string) {
  return buildOrderAssemblyMetadata({
    source: "PROCESS_RULE",
    marketplaceListingId: policy.listing.id,
    processRuleId: policy.rule.id,
    assemblyTitle: policy.rule.assemblyTitle ?? "Assembly",
    assemblyInstructions: policy.rule.assemblyInstructions ?? policy.rule.assemblyTitle ?? "",
    assemblyImageUrl: policy.rule.assemblyImageUrl ?? undefined,
    sellerSkuSnapshot: order.sku,
    productTitleSnapshot: policy.listing.productTitle ?? order.productDescription ?? undefined,
    productImageSnapshot: policy.listing.mainImageUrl ?? order.imageUrl ?? undefined,
    requestedByUserId: actorUserId,
    requiredByRule: true
  });
}

function safeObject(value: string | null | undefined) {
  try { return JSON.parse(value ?? "") as Record<string, unknown>; } catch { return {}; }
}

async function createTaskIfMissing(tx: Transaction, input: { order: AssemblyOrder; metadata: ReturnType<typeof buildOrderAssemblyMetadata>; actorUserId: string }) {
  const [pick, existing, pack] = await Promise.all([
    tx.workTask.findUnique({ where: { orderId_stage: { orderId: input.order.id, stage: "PICK" } } }),
    tx.workTask.findUnique({ where: { orderId_stage: { orderId: input.order.id, stage: "ASSEMBLE" } } }),
    tx.workTask.findUnique({ where: { orderId_stage: { orderId: input.order.id, stage: "PACK" } } })
  ]);
  const source = pick ?? pack;
  if (existing && ["COMPLETED", "SKIPPED", "IN_PROGRESS", "PROBLEM"].includes(existing.status)) return { task: existing, created: false };
  if (existing?.status === "CANCELLED") throw new Error("Cancelled Assembly work requires an explicit owner repair.");
  const prior = parseWorkRouteSnapshot(source?.routeSnapshotJson) ?? createWorkRouteSnapshot({ processRoute: "PICK_PACK", currentStage: "PICK" });
  const now = new Date().toISOString();
  const routeSnapshotJson = JSON.stringify({
    ...safeObject(source?.routeSnapshotJson),
    version: 2,
    routeVersion: prior.routeVersion + 1,
    recommendedStages: prior.recommendedStages,
    actualStages: ["PICK", "ASSEMBLE", "PACK"],
    completedStages: ["PICK"],
    currentStage: "ASSEMBLE",
    selectedNextStage: "ASSEMBLE",
    selectedActualRoute: "ASSEMBLE",
    actualProcessRoute: "PICK_ASSEMBLE_PACK",
    routeDecisionType: "MANUAL_ASSEMBLY_DIVERSION",
    decisions: [...prior.decisions, { fromStage: "PACK", toStage: "ASSEMBLE", actorUserId: input.actorUserId, decidedAt: now, reason: "WORKER_SELECTION" }]
  });
  const workCardSnapshotJson = source?.workCardSnapshotJson ?? JSON.stringify({ version: 2, sellerSku: input.order.sku, productTitle: input.order.productDescription, primaryImage: input.order.imageUrl, workCreatedAt: now });
  if (existing) {
    assertReusableDownstreamTask(existing, { stage: "ASSEMBLE", workCardSnapshotJson, metadataJson: JSON.stringify(input.metadata),allowAssignedReady:true });
    if (existing.status === "READY") return { task: existing, created: false };
    const activated = await tx.workTask.update({ where: { id: existing.id }, data: { status: "READY", version: { increment: 1 } } });
    await refreshAffectedWorkGroups({ accountId: input.order.accountId, sourceType: "ORDER", stages: ["ASSEMBLE"], orderIds: [input.order.id] }, tx);
    return { task: activated, created: false };
  }
  if (pick) await tx.workTask.update({ where: { id: pick.id }, data: { workCardSnapshotJson, routeSnapshotJson } });
  const task = await tx.workTask.create({ data: {
    accountId: input.order.accountId,
    sourceType: "ORDER",
    orderId: input.order.id,
    consignmentLineId: null,
    stage: "ASSEMBLE",
    sequenceNumber: 2,
    requiredQuantity: input.order.qty,
    completedQuantity: 0,
    status: "READY",
    metadataJson: JSON.stringify(input.metadata),
    workCardSnapshotJson,
    routeSnapshotJson
  } });
  if (pack) {
    if (!["LOCKED", "READY"].includes(pack.status) || pack.completedQuantity > 0 || pack.startedAt) throw new Error("Packing already started; this order can no longer be diverted to assembly.");
    await tx.workTask.update({ where: { id: pack.id }, data: { sequenceNumber: 3, status: "LOCKED", workCardSnapshotJson, routeSnapshotJson } });
  } else {
    await tx.workTask.create({ data: { accountId: input.order.accountId, sourceType: "ORDER", orderId: input.order.id, stage: "PACK", sequenceNumber: 3, requiredQuantity: input.order.qty, completedQuantity: 0, status: "LOCKED", metadataJson: JSON.stringify({ version: 1, routeChoice: "ASSEMBLE", processRoute: "PICK_ASSEMBLE_PACK" }), workCardSnapshotJson, routeSnapshotJson } });
  }
  await refreshAffectedWorkGroups({ accountId: input.order.accountId, sourceType: "ORDER", stages: ["ASSEMBLE", "PACK"], orderIds: [input.order.id] }, tx);
  if (!existing) await tx.workChangeEvent.create({ data: { accountId: input.order.accountId, eventType: "ORDER_ASSEMBLY_ROUTED", sourceType: "ORDER", stage: "ASSEMBLE", entityId: task.id } });
  return { task, created: !existing };
}

export async function createAutomaticAssemblyTasksAfterPick(tx: Transaction, input: { actorUserId: string; accountId: string; orders: AssemblyOrder[] }) {
  const policies = await resolveOrderAssemblyPolicies({ accountId: input.accountId, orders: input.orders }, tx);
  let createdCount = 0;
  let reviewCount = 0;
  for (const order of input.orders) {
    const policy = policies.get(order.id);
    if (policy?.state === "ASSEMBLY_REQUIRED") {
      const result = await createTaskIfMissing(tx, { order, metadata: taskMetadata(order, policy, input.actorUserId), actorUserId: input.actorUserId });
      if (result.created) {
        createdCount += 1;
        await tx.auditLog.create({ data: { userId: input.actorUserId, accountId: input.accountId, action: "ORDER_ASSEMBLY_TASK_CREATED", entityType: "WorkTask", entityId: result.task.id, metadata: JSON.stringify({ orderId: order.id, source: "PROCESS_RULE" }) } });
      }
    } else if (policy && ["AMBIGUOUS_LISTING", "UNSUPPORTED_ROUTE", "INVALID_RULE"].includes(policy.state)) {
      reviewCount += 1;
      await tx.auditLog.create({ data: { userId: input.actorUserId, accountId: input.accountId, action: "ORDER_ASSEMBLY_POLICY_REVIEW_REQUIRED", entityType: "Order", entityId: order.id, metadata: JSON.stringify({ state: policy.state }) } });
    }
  }
  return { createdCount, reviewCount, policies };
}

export async function sendOrderToAssembly(input: { actorUserId: string; accountId: string; orderId: string; manualTitle?: string; manualInstructions?: string; manualImageUrl?: string; clientRequestId?: string }, client: Client = prisma) {
  const initial = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!hasWorkPermission(initial.user, "canPack")) throw new Error("Packing permission is required to send an order to assembly.");
  const execute=async()=>{let last:unknown;for(let attempt=0;attempt<6;attempt+=1){try{return await client.$transaction(async (tx) => {
      const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
      if (!hasWorkPermission(user, "canPack")) throw new Error("Packing permission is required to send an order to assembly.");
      const requestFingerprint=fingerprint({orderId:input.orderId,manualTitle:input.manualTitle?.trim()??"",manualInstructions:input.manualInstructions??"",manualImageUrl:input.manualImageUrl??""});
      const receipt=input.clientRequestId?await beginWorkflowActionReceipt<{taskId:string;created:boolean;idempotent:boolean}>(tx,{accountId:input.accountId,actorUserId:user.id,requestKind:"ORDER_SEND_ASSEMBLY",clientRequestId:input.clientRequestId,requestFingerprint,sourceType:"ORDER",stage:"ASSEMBLE"}):null;
      if(receipt?.replay){const task=await tx.workTask.findFirstOrThrow({where:{id:receipt.replay.taskId,accountId:input.accountId}});return{task,created:false,idempotent:true};}
      const order = await tx.order.findFirst({ where: { id: input.orderId, accountId: input.accountId }, select: { id: true, accountId: true, sku: true, qty: true, productDescription: true, imageUrl: true, pickStatus: true, packStatus: true, status: true } });
      if (!order) throw new Error("Order is unavailable in the selected account.");
      if (order.pickStatus !== "PICKED" || order.packStatus !== "READY" || order.status === "PROBLEM") throw new Error("Order must be picked and ready before assembly.");
      const policy = await resolveOrderAssemblyPolicy(order, tx);
      if (policy.state === "UNSUPPORTED_ROUTE" || policy.state === "INVALID_RULE") throw new Error("Assembly configuration needs owner review.");
      const metadata = policy.state === "ASSEMBLY_REQUIRED"
        ? taskMetadata(order, policy, user.id)
        : buildOrderAssemblyMetadata({
            source: "MANUAL",
            assemblyTitle: input.manualTitle?.trim() || `Assembly for ${order.sku}`,
            assemblyInstructions: input.manualInstructions ?? "",
            assemblyImageUrl: input.manualImageUrl,
            sellerSkuSnapshot: order.sku,
            productTitleSnapshot: order.productDescription ?? undefined,
            productImageSnapshot: order.imageUrl ?? undefined,
            requestedByUserId: user.id,
            requiredByRule: false
          });
      const result = await createTaskIfMissing(tx, { order, metadata, actorUserId: user.id });
      if (result.created) await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "ORDER_SENT_TO_ASSEMBLY", entityType: "Order", entityId: order.id, metadata: JSON.stringify({ taskId: result.task.id, source: metadata.source, clientRequestId: input.clientRequestId?.slice(0, 160) }) } });
      if (policy.state === "AMBIGUOUS_LISTING") await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "ORDER_ASSEMBLY_MANUAL_AMBIGUOUS_LISTING", entityType: "Order", entityId: order.id } });
      const value={taskId:result.task.id,created:result.created,idempotent:!result.created};if(receipt)await completeWorkflowActionReceipt(tx,receipt.receiptId,value);return { task: result.task, created: result.created, idempotent: !result.created };
    });}catch(error){last=error;const transient=error instanceof Error&&(/database is locked|unique constraint|write conflict|P2002|P2034/i.test(error.message)||"code" in error&&["P2002","P2034"].includes(String((error as {code?:string}).code)));if(!transient||attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}throw last;};
  return input.clientRequestId?withWorkflowActionRequestGate([input.accountId,input.actorUserId,"ORDER_SEND_ASSEMBLY",input.clientRequestId].join(":"),execute):execute();
}

async function orderAssemblyTaskForMutation(tx: Transaction, input: { taskId: string; accountId: string; actorUserId: string }) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
  const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "ORDER", stage: "ASSEMBLE" }, include: { order: { select: { id: true, accountId: true } } } });
  if (!task?.order || task.order.accountId !== input.accountId) throw new Error("Assembly task is unavailable.");
  return { user, task };
}

async function replay(tx: Transaction, input: { taskId: string; actorUserId: string; requestKind: WorkRequestKind; clientRequestId?: string; requestFingerprint?: string }) {
  if (!input.clientRequestId) return null;
  const log = await tx.workActionLog.findFirst({ where: { taskId: input.taskId, clientRequestId: input.clientRequestId }, orderBy: { createdAt: "asc" } });
  if (!log) return null;
  if (log.actorUserId !== input.actorUserId) throw new Error("Request ID was already used by another worker.");
  const expectedAction = input.requestKind === "CLAIM" ? "TASK_CLAIMED" : input.requestKind === "COMPLETE" ? "TASK_COMPLETED" : input.requestKind === "REPORT_PROBLEM" ? "TASK_PROBLEM_REPORTED" : null;
  if (!expectedAction || log.requestKind !== input.requestKind || log.action !== expectedAction) throw new Error("Request ID was already used for a different action.");
  const metadata = log.metadataJson ? JSON.parse(log.metadataJson) as { requestFingerprint?: string } : {};
  if (input.requestFingerprint && metadata.requestFingerprint !== input.requestFingerprint) throw new Error("Request ID was already used with a different payload.");
  const status = log.action === "TASK_COMPLETED" ? "COMPLETED" as const : log.action === "TASK_PROBLEM_REPORTED" ? "PROBLEM" as const : "IN_PROGRESS" as const;
  return { taskId: input.taskId, status, idempotent: true };
}

async function recoverAssemblyReplay<T>(input: { clientRequestId?: string; mutate: () => Promise<T>; replay: () => Promise<T | null> }) {
  try { return await input.mutate(); }
  catch (error) {
    if (!input.clientRequestId) throw error;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prior = await input.replay();
      if (prior) return prior;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw error;
  }
}

async function retryAssemblyMutation<T>(action:()=>Promise<T>){let last:unknown;for(let attempt=0;attempt<6;attempt+=1){try{return await action();}catch(error){last=error;const transient=error instanceof Error&&(/database is locked|unique constraint|write conflict|P2002|P2034/i.test(error.message)||"code" in error&&["P2002","P2034"].includes(String((error as{code?:string}).code)));if(!transient||attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}throw last;}

async function actionLog(tx: Transaction, input: { taskId: string; accountId: string; actorUserId: string; action: "TASK_CLAIMED" | "TASK_COMPLETED" | "TASK_PROBLEM_REPORTED" | "TASK_PROBLEM_RESOLVED" | "TASK_REASSIGNED" | "TASK_UNASSIGNED"; requestKind: WorkRequestKind; clientRequestId?: string; note?: string; metadata?: Record<string, unknown> }) {
  await tx.workActionLog.create({ data: { taskId: input.taskId, accountId: input.accountId, actorUserId: input.actorUserId, action: input.action, requestKind: input.clientRequestId ? input.requestKind : null, clientRequestId: input.clientRequestId || null, note: input.note?.slice(0, 1_000) || null, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null } });
}

export async function claimOrderAssemblyTask(input: { taskId: string; accountId: string; actorUserId: string; clientRequestId?: string }, client: Client = prisma) {
  return recoverAssemblyReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (!hasWorkPermission(user, "canAssemble")) throw new Error("Assembly permission is required.");
    const prior = await replay(tx, { ...input, requestKind: "CLAIM" }); if (prior) return prior;
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This assembly task was taken by another worker.");
    if (task.status === "IN_PROGRESS" && task.assignedUserId === user.id) return { taskId: task.id, status: task.status, idempotent: true };
    if (task.status !== "READY") throw new Error("Assembly task cannot be started.");
    const changed = await tx.workTask.updateMany({ where: { id: task.id, status: "READY", assignedUserId: task.assignedUserId }, data: { status: "IN_PROGRESS", assignedUserId: task.assignedUserId ?? user.id, startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id } });
    if (changed.count !== 1) throw new Error("This assembly task was taken by another worker.");
    await actionLog(tx, { ...input, action: "TASK_CLAIMED", requestKind: "CLAIM" });
    return { taskId: task.id, status: "IN_PROGRESS" as const, idempotent: false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (!hasWorkPermission(user, "canAssemble")) throw new Error("Assembly permission is required.");
    return replay(tx, { ...input, taskId: task.id, requestKind: "CLAIM" });
  }) });
}

export async function completeOrderAssemblyTask(input: { taskId: string; accountId: string; actorUserId: string; expectedStatus: string; clientRequestId?: string }, client: Client = prisma) {
  const requestFingerprint = fingerprint({ expectedStatus: input.expectedStatus });
  return recoverAssemblyReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (!hasWorkPermission(user, "canAssemble")) throw new Error("Assembly permission is required.");
    const prior = await replay(tx, { ...input, requestKind: "COMPLETE", requestFingerprint }); if (prior) return prior;
    if (task.status === "COMPLETED") return { taskId: task.id, status: task.status, idempotent: true };
    if (task.status === "PROBLEM") throw new Error("Assembly has a reported problem.");
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This assembly task was taken by another worker.");
    if (!(["READY", "IN_PROGRESS"] as string[]).includes(task.status) || task.status !== input.expectedStatus) throw new Error("Assembly changed; refresh before completing.");
    const changed = await tx.workTask.updateMany({ where: { id: task.id, status: task.status, assignedUserId: task.assignedUserId }, data: { status: "COMPLETED", assignedUserId: task.assignedUserId ?? user.id, completedQuantity: task.requiredQuantity, startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id, completedAt: new Date(), completedByUserId: user.id } });
    if (changed.count !== 1) throw new Error(task.assignedUserId ? "Assembly changed; refresh before completing." : "This assembly task was taken by another worker.");
    const next=await tx.workTask.findFirst({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1}}),routeState=parseWorkRouteSnapshot(task.routeSnapshotJson)??createWorkRouteSnapshot({processRoute:null,currentStage:"ASSEMBLE"}),raw=safeObject(task.routeSnapshotJson),routeSnapshotJson=JSON.stringify({...raw,routeVersion:routeState.routeVersion+1,completedStages:[...new Set([...routeState.completedStages,"ASSEMBLE"])],currentStage:next?.stage??null,selectedNextStage:next?.stage??null});
    await actionLog(tx, { ...input, action: "TASK_COMPLETED", requestKind: "COMPLETE", metadata: { requestFingerprint } });
    await tx.workTask.updateMany({where:{orderId:task.orderId},data:{routeSnapshotJson}});
    await tx.workTask.updateMany({ where: { orderId: task.orderId, sequenceNumber: task.sequenceNumber + 1, status: "LOCKED" }, data: { status: "READY" } });
    await tx.workChangeEvent.create({data:{accountId:input.accountId,eventType:"ORDER_ASSEMBLY_COMPLETED",sourceType:"ORDER",stage:"ASSEMBLE",entityId:task.id}});
    await refreshAffectedWorkGroups({accountId:input.accountId,sourceType:"ORDER",stages:["ASSEMBLE",...(next?[next.stage]:[])],taskIds:[task.id],orderIds:task.orderId?[task.orderId]:[]},tx);
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "ORDER_ASSEMBLY_COMPLETED", entityType: "WorkTask", entityId: task.id, metadata: JSON.stringify({ orderId: task.orderId, quantity: task.requiredQuantity }) } });
    return { taskId: task.id, status: "COMPLETED" as const, idempotent: false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (!hasWorkPermission(user, "canAssemble")) throw new Error("Assembly permission is required.");
    return replay(tx, { ...input, taskId: task.id, requestKind: "COMPLETE", requestFingerprint });
  }) });
}

export async function reportOrderAssemblyProblem(input: { taskId: string; accountId: string; actorUserId: string; reason: string; note?: string; expectedStatus: string; clientRequestId?: string }, client: Client = prisma) {
  if (!(ORDER_ASSEMBLY_PROBLEM_CATEGORIES as readonly string[]).includes(input.reason)) throw new Error("Select a valid assembly problem reason.");
  if (!input.clientRequestId) throw new Error("Problem request ID is required.");
  const task=await client.workTask.findFirst({where:{id:input.taskId,accountId:input.accountId,sourceType:"ORDER",stage:"ASSEMBLE"},select:{id:true,orderId:true,version:true,status:true}});if(!task?.orderId)throw new Error("Assembly task is unavailable.");
  const result=await reportOrderWorkflowProblem({actorUserId:input.actorUserId,accountId:input.accountId,orderId:task.orderId,taskId:task.id,stage:"ASSEMBLE",reason:input.reason,note:input.note,expectedTaskVersion:task.version,expectedTaskStatus:input.expectedStatus as "READY"|"IN_PROGRESS",clientRequestId:input.clientRequestId},client);
  return {taskId:task.id,status:"PROBLEM" as const,idempotent:result.idempotent};
}

export async function resolveOrderAssemblyProblem(input: { taskId: string; accountId: string; actorUserId: string; resolutionNote: string; clientRequestId?: string }, client: Client = prisma) {
  if (!input.resolutionNote.trim()) throw new Error("Resolution note is required.");
  if(!input.clientRequestId)throw new Error("Resolution request ID is required.");const problem=await client.problemOrder.findFirst({where:{accountId:input.accountId,workTaskId:input.taskId,status:{in:["OPEN","RESOLVED"]}},orderBy:{createdAt:"desc"},select:{id:true}});if(!problem)throw new Error("Assembly problem is unavailable.");const result=await resolveOrderWorkflowProblem({actorUserId:input.actorUserId,accountId:input.accountId,problemId:problem.id,resolutionNote:input.resolutionNote,clientRequestId:input.clientRequestId},client);return{taskId:input.taskId,status:result.restoredStatus,idempotent:result.idempotent};
}

export async function skipOrderAssemblyTask(input: { taskId: string; accountId: string; actorUserId: string; reason: string; clientRequestId?: string }, client: Client = prisma) {
  if (!input.reason.trim()) throw new Error("Skip reason is required.");
  const execute=()=>retryAssemblyMutation(()=>client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (user.role !== "OWNER") throw new Error("Only an owner can skip assembly.");
    const requestFingerprint=fingerprint({taskId:task.id,reason:input.reason.trim().slice(0,1000)}),receipt=input.clientRequestId?await beginWorkflowActionReceipt<{taskId:string;status:"SKIPPED";idempotent:boolean}>(tx,{accountId:input.accountId,actorUserId:user.id,requestKind:"ORDER_ASSEMBLY_SKIP",clientRequestId:input.clientRequestId,requestFingerprint,sourceType:"ORDER",stage:"ASSEMBLE"}):null;
    if(receipt?.replay)return{...receipt.replay,idempotent:true};
    if (task.status === "SKIPPED") {const result={ taskId: task.id, status: task.status, idempotent: true };return receipt?completeWorkflowActionReceipt(tx,receipt.receiptId,result):result;}
    if (task.status === "COMPLETED") throw new Error("Completed assembly cannot be skipped.");
    await tx.workTask.update({ where: { id: task.id }, data: { status: "SKIPPED", completedAt: new Date(), completedByUserId: user.id, problemResolutionNote: input.reason.trim().slice(0, 1_000) } });
    const next=await tx.workTask.findFirst({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1}}),routeState=parseWorkRouteSnapshot(task.routeSnapshotJson)??createWorkRouteSnapshot({processRoute:null,currentStage:"ASSEMBLE"}),routeSnapshotJson=JSON.stringify({...safeObject(task.routeSnapshotJson),routeVersion:routeState.routeVersion+1,completedStages:[...new Set([...routeState.completedStages,"ASSEMBLE"])],currentStage:next?.stage??null,selectedNextStage:next?.stage??null,assemblyOutcome:"SKIPPED"});await tx.workTask.updateMany({where:{orderId:task.orderId},data:{routeSnapshotJson}});await tx.workTask.updateMany({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1,status:"LOCKED"},data:{status:"READY"}});
    await actionLog(tx, { ...input, action: "TASK_COMPLETED", requestKind: "COMPLETE", note: input.reason, metadata: { outcome: "SKIPPED" } });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "ORDER_ASSEMBLY_SKIPPED", entityType: "WorkTask", entityId: task.id, metadata: JSON.stringify({ orderId: task.orderId, reason: input.reason.trim().slice(0, 500) }) } });
    await tx.workChangeEvent.create({data:{accountId:input.accountId,eventType:"ORDER_ASSEMBLY_SKIPPED",sourceType:"ORDER",stage:"ASSEMBLE",entityId:task.id}});await refreshAffectedWorkGroups({accountId:input.accountId,sourceType:"ORDER",stages:["ASSEMBLE","PACK"],taskIds:[task.id],orderIds:task.orderId?[task.orderId]:[]},tx);
    const result={ taskId: task.id, status: "SKIPPED" as const, idempotent: false };return receipt?completeWorkflowActionReceipt(tx,receipt.receiptId,result):result;
  }));
  return input.clientRequestId?withWorkflowActionRequestGate([input.accountId,input.actorUserId,"ORDER_ASSEMBLY_SKIP",input.clientRequestId].join(":"),execute):execute();
}

export async function reassignOrderAssemblyTask(input: { taskId: string; accountId: string; actorUserId: string; assignedUserId: string | null; clientRequestId?: string }, client: Client = prisma) {
  const execute=()=>retryAssemblyMutation(()=>client.$transaction(async (tx) => {
    const { user, task } = await orderAssemblyTaskForMutation(tx, input);
    if (user.role !== "OWNER") throw new Error("Only an owner can assign assembly work.");
    const requestFingerprint=fingerprint({taskId:task.id,assignedUserId:input.assignedUserId}),receipt=input.clientRequestId?await beginWorkflowActionReceipt<{taskId:string;assignedUserId:string|null;idempotent:boolean}>(tx,{accountId:input.accountId,actorUserId:user.id,requestKind:"ORDER_ASSEMBLY_REASSIGN",clientRequestId:input.clientRequestId,requestFingerprint,sourceType:"ORDER",stage:"ASSEMBLE"}):null;
    if(receipt?.replay)return{...receipt.replay,idempotent:true};
    if (input.assignedUserId) {
      const target = await assertWorkerAccountAccess(input.assignedUserId, input.accountId, tx);
      if (!hasWorkPermission(target.user, "canAssemble")) throw new Error("Selected worker lacks assembly permission.");
    }
    await tx.workTask.update({ where: { id: task.id }, data: { assignedUserId: input.assignedUserId } });
    await actionLog(tx, { ...input, action: input.assignedUserId ? "TASK_REASSIGNED" : "TASK_UNASSIGNED", requestKind: input.assignedUserId ? "REASSIGN" : "UNASSIGN", metadata: { assignedUserId: input.assignedUserId } });
    await tx.workChangeEvent.create({data:{accountId:input.accountId,eventType:"ORDER_ASSEMBLY_ASSIGNED",sourceType:"ORDER",stage:"ASSEMBLE",entityId:task.id}});await refreshAffectedWorkGroups({accountId:input.accountId,sourceType:"ORDER",stages:["ASSEMBLE"],taskIds:[task.id],orderIds:task.orderId?[task.orderId]:[]},tx);
    const result={ taskId: task.id, assignedUserId: input.assignedUserId,idempotent:false };return receipt?completeWorkflowActionReceipt(tx,receipt.receiptId,result):result;
  }));
  return input.clientRequestId?withWorkflowActionRequestGate([input.accountId,input.actorUserId,"ORDER_ASSEMBLY_REASSIGN",input.clientRequestId].join(":"),execute):execute();
}

export const ORDER_ASSEMBLY_TASK_INCLUDE = {
  account: { select: { id: true, name: true, accountDisplayName: true, marketplace: true } },
  order: { select: { id: true, awb: true, trackingId: true, orderNo: true, shipmentId: true, orderItemId: true, sku: true, qty: true, productDescription: true, imageUrl: true, pickStatus: true, packStatus: true } },
  assignedUser: { select: { id: true, name: true } },
  problemReportedBy: { select: { id: true, name: true } },
  actionLogs: { where: { action: "TASK_PROBLEM_REPORTED" as const }, orderBy: { createdAt: "desc" as const }, take: 1, select: { note: true } }
} satisfies Prisma.WorkTaskInclude;

export async function getOrderAssemblyTask(input: { actorUserId: string; accountId: string; taskId: string }, client: Client = prisma) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!(hasWorkPermission(user, "canAssemble") || user.canViewAllWork)) throw new Error("Assembly work access is required.");
  return client.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "ORDER", stage: "ASSEMBLE" }, include: ORDER_ASSEMBLY_TASK_INCLUDE });
}

export async function getOrderAssemblyQueue(input: { actorUserId: string; accountId: string; page?: number; search?: string; status?: "active" | "problem" | "completed" | "mine" }, client: Client = prisma) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  const canAssemble = hasWorkPermission(user, "canAssemble");
  const viewAll = user.role === "OWNER" || user.canViewAllWork;
  if (!canAssemble && !viewAll) throw new Error("Assembly work access is required.");
  const status = input.status ?? "active";
  const statuses = status === "problem" ? ["PROBLEM" as const] : status === "completed" ? ["COMPLETED" as const, "SKIPPED" as const] : ["READY" as const, "IN_PROGRESS" as const];
  const search = input.search?.normalize("NFKC").trim().slice(0, 160);
  const visibility: Prisma.WorkTaskWhereInput = status === "mine" ? { assignedUserId: user.id } : viewAll ? {} : { OR: [{ assignedUserId: null }, { assignedUserId: user.id }] };
  const where: Prisma.WorkTaskWhereInput = {
    accountId: input.accountId, sourceType: "ORDER", stage: "ASSEMBLE", status: { in: statuses },
    completedAt: status === "completed" ? { gte: startOfApplicationDay() } : undefined,
    ...visibility,
    order: search ? { OR: [{ awb: search }, { trackingId: search }, { orderNo: search }, { shipmentId: search }, { orderItemId: search }, { sku: search }] } : undefined
  };
  const page = Math.max(1, input.page ?? 1); const pageSize = 50;
  const [tasks, total] = await Promise.all([
    client.workTask.findMany({ where, include: ORDER_ASSEMBLY_TASK_INCLUDE, orderBy: [{ status: "asc" }, { updatedAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    client.workTask.count({ where })
  ]);
  return { tasks, total, page, pageSize, user, canAssemble, viewAll };
}

export type OrderAssemblyQueueTask = Awaited<ReturnType<typeof getOrderAssemblyQueue>>["tasks"][number];

export async function getOrderAssemblyCounts(userId: string, accountId: string, client: Client = prisma) {
  const { user } = await assertWorkerAccountAccess(userId, accountId, client);
  const viewAll = user.role === "OWNER" || user.canViewAllWork;
  const visible = viewAll ? {} : { OR: [{ assignedUserId: null }, { assignedUserId: user.id }] };
  const base = { accountId, sourceType: "ORDER" as const, stage: "ASSEMBLE" as const };
  const [ready, inProgress, mine, problems, completedToday] = await Promise.all([
    client.workTask.count({ where: { ...base, status: "READY", ...visible } }),
    client.workTask.count({ where: { ...base, status: "IN_PROGRESS", ...(viewAll ? {} : { assignedUserId: user.id }) } }),
    client.workTask.count({ where: { ...base, assignedUserId: user.id, status: { in: ["READY", "IN_PROGRESS"] } } }),
    client.workTask.count({ where: { ...base, status: "PROBLEM", ...visible } }),
    client.workTask.count({ where: { ...base, status: { in: ["COMPLETED", "SKIPPED"] }, completedAt: { gte: startOfApplicationDay() }, ...(viewAll ? {} : { completedByUserId: user.id }) } })
  ]);
  return { ready, inProgress, mine, problems, completedToday };
}

export function safeOrderAssemblyMetadata(task: { metadataJson: string | null }) {
  return parseOrderAssemblyMetadata(task.metadataJson);
}

export async function getOrderAssemblyPackingGate(input: { accountId: string; orders: Array<{ id: string; accountId: string; sku: string; productDescription?: string | null; imageUrl?: string | null }> }, client: PrismaClient | Transaction = prisma) {
  const policies = await resolveOrderAssemblyPolicies({ accountId: input.accountId, orders: input.orders }, client);
  const tasks = await client.workTask.findMany({ where: { accountId: input.accountId, sourceType: "ORDER", stage: "ASSEMBLE", orderId: { in: input.orders.map((order) => order.id) } }, select: { id: true, orderId: true, status: true, requiredQuantity: true, completedQuantity: true, assignedUserId: true, metadataJson: true } });
  const taskByOrder = new Map(tasks.map((task) => [task.orderId, task]));
  const states = input.orders.map((order) => {
    const task = taskByOrder.get(order.id);
    if (task?.status === "COMPLETED" || task?.status === "SKIPPED") return { orderId: order.id, allowed: true, state: task.status, taskId: task.id };
    if (task?.status === "PROBLEM") return { orderId: order.id, allowed: false, state: task.status, taskId: task.id, message: "Assembly has a reported problem." };
    if (task?.status === "READY" || task?.status === "LOCKED") return { orderId: order.id, allowed: false, state: task.status, taskId: task.id, message: "Assembly is required before packing." };
    if (task?.status === "IN_PROGRESS") return { orderId: order.id, allowed: false, state: task.status, taskId: task.id, message: "Assembly is still in progress." };
    if (task?.status === "CANCELLED") return { orderId: order.id, allowed: false, state: task.status, taskId: task.id, message: "Assembly configuration needs owner review." };
    const policy = policies.get(order.id);
    if (policy?.state === "ASSEMBLY_REQUIRED") return { orderId: order.id, allowed: false, state: "REQUIRED_NO_TASK", message: "Assembly is required before packing." };
    if (policy && ["AMBIGUOUS_LISTING", "UNSUPPORTED_ROUTE", "INVALID_RULE"].includes(policy.state)) return { orderId: order.id, allowed: false, state: policy.state, message: "Assembly configuration needs owner review." };
    return { orderId: order.id, allowed: true, state: policy?.state ?? "NO_RULE" };
  });
  const blocker = states.find((state) => !state.allowed);
  return { allowed: !blocker, blocker, states, policies, tasks };
}

export async function assertOrderAssemblyPackingEligible(input: { accountId: string; orders: Array<{ id: string; accountId: string; sku: string; productDescription?: string | null; imageUrl?: string | null }> }, client: PrismaClient | Transaction = prisma) {
  const gate = await getOrderAssemblyPackingGate(input, client);
  if (!gate.allowed) throw new Error(gate.blocker?.message ?? "Assembly is required before packing.");
  return gate;
}
