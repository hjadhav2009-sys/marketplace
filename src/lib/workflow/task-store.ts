import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ProcessRoute, type WorkActionType, type WorkRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildTaskPlan } from "./tasks";
import { assertWorkerAccountAccess, userCanManageConsignmentTasks, userCanMutateStage, userCanResolveConsignmentProblems } from "./worker-access";

type Transaction = Prisma.TransactionClient;
type Client = PrismaClient;
export type ActivationProblem = { lineId?: string; rowNumber?: number; code: string; message: string };

function routeSupported(route: ProcessRoute | null): route is "PICK_PACK" | "PICK_MARK_PACK" {
  return route === "PICK_PACK" || route === "PICK_MARK_PACK";
}

export function createConsignmentTaskPlan(input: { lineId: string; accountId: string; route: "PICK_PACK" | "PICK_MARK_PACK"; requiredQuantity: number }) {
  if (!Number.isSafeInteger(input.requiredQuantity) || input.requiredQuantity <= 0) throw new Error("Required work quantity must be a positive whole number.");
  return buildTaskPlan(input.route, input.requiredQuantity).map((task) => ({ id: `wkt_${randomUUID().replace(/-/g, "")}`, accountId: input.accountId, sourceType: "CONSIGNMENT" as const, orderId: null, consignmentLineId: input.lineId, ...task }));
}

export async function validateConsignmentActivation(batchId: string, accountId: string, client: PrismaClient | Transaction = prisma) {
  const batch = await client.consignmentBatch.findFirst({
    where: { id: batchId, accountId },
    include: { lines: { orderBy: { rowNumber: "asc" }, include: {
      marketplaceListing: { select: { id: true, accountId: true, marketplace: true, sellerSkuId: true, fsn: true, listingId: true, productTitle: true, mainImageUrl: true, identifiers: { where: { active: true }, select: { identifierType: true, rawValue: true } } } },
      processRule: { select: { id: true, accountId: true, marketplaceListingId: true, active: true, route: true, markingAssetId: true } },
      markingAsset: { select: { id: true, active: true, masterDesignId: true, instructions: true, listingLinks: { where: { active: true }, select: { accountId: true, marketplaceListingId: true } } } },
      issues: { where: { issueType: "MARKING_IMAGE_MISSING" }, select: { resolved: true } }
    } } }
  });
  if (!batch) return { batch: null, problems: [{ code: "NOT_FOUND", message: "Consignment is not available in the selected account." }] as ActivationProblem[] };
  const problems: ActivationProblem[] = [];
  for (const line of batch.lines) {
    const identify = { lineId: line.id, rowNumber: line.rowNumber };
    if (line.accountId !== accountId || line.marketplaceListing?.accountId !== accountId) problems.push({ ...identify, code: "ACCOUNT_MISMATCH", message: "Line and listing must belong to the selected account." });
    if (line.marketplaceListing && line.marketplaceListing.marketplace !== batch.marketplace) problems.push({ ...identify, code: "MARKETPLACE_MISMATCH", message: "Line listing must belong to the consignment marketplace." });
    if (!Number.isSafeInteger(line.requiredQuantity) || line.requiredQuantity <= 0) problems.push({ ...identify, code: "INVALID_QUANTITY", message: "Required quantity must be a positive whole number." });
    if (!line.marketplaceListing || !["EXACT_SKU", "EXACT_FSN", "EXACT_FNSKU", "EXACT_ASIN", "EXACT_EXTERNAL_ID", "EXACT_BARCODE", "OWNER_SELECTED"].includes(line.matchStatus)) problems.push({ ...identify, code: "MISSING_LISTING", message: "Select one account listing before activation." });
    if (!routeSupported(line.processRoute)) problems.push({ ...identify, code: "MISSING_ROUTE", message: "Select Ready-made or Marking route before activation." });
    if (!line.processRule?.active || line.processRule.accountId !== line.accountId || line.processRule.marketplaceListingId !== line.marketplaceListingId || line.processRule.route !== line.processRoute) problems.push({ ...identify, code: "STALE_RULE", message: "Save an active account-scoped process rule matching this listing and route." });
    const markingLinked = line.markingAsset?.listingLinks.some((link) => link.accountId === line.accountId && link.marketplaceListingId === line.marketplaceListingId);
    if (line.processRoute === "PICK_MARK_PACK" && (!line.markingAsset?.active || !markingLinked || line.processRule?.markingAssetId !== line.markingAssetId)) problems.push({ ...identify, code: "MARKING_ASSET_MISSING", message: "Marking route requires an active linked marking asset." });
    if (line.processRoute === "PICK_MARK_PACK" && line.markingAsset && !line.markingAsset.instructions?.trim() && !line.markingAsset.masterDesignId?.trim()) problems.push({ ...identify, code: "MARKING_INSTRUCTIONS_MISSING", message: "Marking route requires instructions or a Master Design ID." });
    if (line.processRoute === "PICK_MARK_PACK" && !line.marketplaceListing?.mainImageUrl && !line.productImageSnapshot && !line.issues.some((issue) => issue.resolved)) problems.push({ ...identify, code: "MARKING_IMAGE_MISSING", message: "Review and acknowledge the missing product image before activation." });
  }
  if (!batch.lines.length) problems.push({ code: "NO_LINES", message: "Consignment has no valid lines." });
  return { batch, problems };
}

async function writeSnapshotChunk(tx: Transaction, lines: NonNullable<Awaited<ReturnType<typeof validateConsignmentActivation>>["batch"]>["lines"]) {
  const ids = lines.map((line) => line.id);
  const cases = <T>(get: (line: typeof lines[number]) => T) => Prisma.join(lines.map((line) => Prisma.sql`WHEN ${line.id} THEN ${get(line)}`), " ");
  const identifier=(line:typeof lines[number],type:string)=>line.marketplaceListing?.identifiers.find((item)=>item.identifierType===type)?.rawValue??null;
  await tx.$executeRaw(Prisma.sql`UPDATE "ConsignmentLine" SET
    "activated" = true,
    "productTitleSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.productTitle ?? line.productNameSource)} ELSE "productTitleSnapshot" END,
    "productImageSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.mainImageUrl ?? null)} ELSE "productImageSnapshot" END,
    "sellerSkuSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.sellerSkuId ?? line.sellerSkuSource)} ELSE "sellerSkuSnapshot" END,
    "fsnSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.fsn ?? line.fsnSource)} ELSE "fsnSnapshot" END,
    "listingIdSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.listingId ?? null)} ELSE "listingIdSnapshot" END
    ,"asinSnapshot" = CASE "id" ${cases((line) => identifier(line,"ASIN") ?? line.asinSource)} ELSE "asinSnapshot" END
    ,"fnskuSnapshot" = CASE "id" ${cases((line) => identifier(line,"FNSKU") ?? line.fnskuSource)} ELSE "fnskuSnapshot" END
    ,"externalIdSnapshot" = CASE "id" ${cases((line) => identifier(line,"EXTERNAL_ID") ?? line.externalIdSource)} ELSE "externalIdSnapshot" END
    ,"barcodeSnapshot" = CASE "id" ${cases((line) => identifier(line,"EAN") ?? identifier(line,"UPC") ?? identifier(line,"GTIN") ?? line.barcodeSource)} ELSE "barcodeSnapshot" END
    WHERE "id" IN (${Prisma.join(ids)})`);
}

export async function activateConsignmentBatch(input: { batchId: string; accountId: string; actorUserId: string }, client: Client = prisma) {
  try {
    return await client.$transaction(async (tx) => {
      const claimed = await tx.consignmentBatch.updateMany({ where: { id: input.batchId, accountId: input.accountId, status: "READY_TO_ACTIVATE" }, data: { status: "ACTIVATING" } });
      if (claimed.count !== 1) {
        const existing = await tx.consignmentBatch.findFirst({ where: { id: input.batchId, accountId: input.accountId }, select: { status: true } });
        if (existing?.status === "ACTIVE" || existing?.status === "COMPLETED") return { activated: false, alreadyActive: true, taskCount: await tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId } } }) };
        throw new Error("Consignment is not ready to activate.");
      }
      if (await tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId } } })) throw new Error("Consignment already has a task plan.");
      const validation = await validateConsignmentActivation(input.batchId, input.accountId, tx);
      if (!validation.batch || validation.problems.length) throw new Error(validation.problems[0]?.message ?? "Consignment validation failed.");
      const tasks: Prisma.WorkTaskCreateManyInput[] = [];
      for (const line of validation.batch.lines) tasks.push(...createConsignmentTaskPlan({ lineId: line.id, accountId: input.accountId, route: line.processRoute as "PICK_PACK" | "PICK_MARK_PACK", requiredQuantity: line.requiredQuantity }));
      for (let index = 0; index < validation.batch.lines.length; index += 200) await writeSnapshotChunk(tx, validation.batch.lines.slice(index, index + 200));
      for (let index = 0; index < tasks.length; index += 500) await tx.workTask.createMany({ data: tasks.slice(index, index + 500) });
      await tx.consignmentBatch.update({ where: { id: input.batchId }, data: { status: "ACTIVE", activatedAt: new Date(), activatedByUserId: input.actorUserId } });
      await tx.auditLog.createMany({ data: [
        { userId: input.actorUserId, accountId: input.accountId, action: "CONSIGNMENT_TASKS_CREATED", entityType: "ConsignmentBatch", entityId: input.batchId, metadata: JSON.stringify({ taskCount: tasks.length, lineCount: validation.batch.lines.length }) },
        { userId: input.actorUserId, accountId: input.accountId, action: "CONSIGNMENT_ACTIVATED", entityType: "ConsignmentBatch", entityId: input.batchId, metadata: JSON.stringify({ taskCount: tasks.length, requiredQuantity: validation.batch.totalRequiredQuantity }) }
      ] });
      return { activated: true, alreadyActive: false, taskCount: tasks.length };
    }, { timeout: 30000 });
  } catch (error) {
    await client.auditLog.create({ data: { userId: input.actorUserId, accountId: input.accountId, action: "CONSIGNMENT_ACTIVATION_FAILED", entityType: "ConsignmentBatch", entityId: input.batchId, metadata: JSON.stringify({ reason: error instanceof Error ? error.message.slice(0, 200) : "validation" }) } }).catch(() => undefined);
    throw error;
  }
}

async function taskForMutation(tx: Transaction | Client, input: { taskId: string; accountId: string; actorUserId: string }) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
  const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT" }, include: { consignmentLine: { select: { id: true, accountId: true, consignmentBatchId: true } } } });
  if (!task?.consignmentLine || task.consignmentLine.accountId !== input.accountId) throw new Error("Task is not available in the selected account.");
  if (!userCanMutateStage(user, task.stage)) throw new Error("Worker lacks permission for this stage.");
  return { user, task };
}

const REPLAY_ACTIONS: Record<WorkRequestKind, WorkActionType[]> = {
  CLAIM: ["TASK_CLAIMED"], INCREMENT: ["TASK_INCREMENTED", "TASK_COMPLETED"], SET_PROGRESS: ["TASK_PROGRESS_SET", "TASK_COMPLETED"], COMPLETE: ["TASK_COMPLETED"], REPORT_PROBLEM: ["TASK_PROBLEM_REPORTED"], RESOLVE_PROBLEM: ["TASK_PROBLEM_RESOLVED"], REASSIGN: ["TASK_REASSIGNED"], UNASSIGN: ["TASK_UNASSIGNED"], BULK_ASSIGN: ["TASK_REASSIGNED", "TASK_UNASSIGNED"]
};

function requestFingerprint(payload:Record<string,unknown>){return createHash("sha256").update(JSON.stringify(payload)).digest("hex");}

async function duplicateResult(tx: Transaction | Client, input: { taskId: string; actorUserId: string; requestKind: WorkRequestKind; clientRequestId?: string; fingerprint?:string }) {
  if (!input.clientRequestId) return null;
  const log = await tx.workActionLog.findFirst({ where: { taskId: input.taskId, clientRequestId: input.clientRequestId }, orderBy: { createdAt: "asc" } });
  if (!log) return null;
  if (log.actorUserId !== input.actorUserId) throw new Error("Request ID was already used by another worker.");
  if (log.requestKind !== input.requestKind || !REPLAY_ACTIONS[input.requestKind].includes(log.action)) throw new Error("Request ID was already used for a different action.");
  const metadata=log.metadataJson?JSON.parse(log.metadataJson) as {requestFingerprint?:string}:{};
  if(input.fingerprint&&metadata.requestFingerprint!==input.fingerprint)throw new Error("Request ID was already used with a different payload.");
  return { completedQuantity: log.quantityAfter ?? log.quantityBefore ?? 0, completed: log.action === "TASK_COMPLETED", idempotent: true };
}

async function logAction(tx: Transaction, input: { accountId: string; taskId: string; actorUserId: string; action: WorkActionType; requestKind?: WorkRequestKind; fingerprint?:string; before?: number; after?: number; clientRequestId?: string; note?: string; metadata?: Record<string, unknown> }) {
  const metadata=input.fingerprint?{...input.metadata,requestFingerprint:input.fingerprint}:input.metadata;
  return tx.workActionLog.create({ data: { accountId: input.accountId, taskId: input.taskId, actorUserId: input.actorUserId, action: input.action, requestKind: input.clientRequestId ? input.requestKind : null, quantityBefore: input.before, quantityAfter: input.after, clientRequestId: input.clientRequestId || null, note: input.note?.slice(0, 1000) || null, metadataJson: metadata ? JSON.stringify(metadata) : null } });
}

async function recoverIdempotentReplay<T>(input: {
  clientRequestId?: string;
  mutate: () => Promise<T>;
  replay: () => Promise<T | null>;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await input.mutate();
    } catch (error) {
      lastError = error;
      if (!input.clientRequestId) throw error;
      try {
        const replay = await input.replay();
        if (replay) return replay;
      } catch (replayError) {
        if (!isTransientWorkflowConflict(replayError)) throw replayError;
        lastError = replayError;
      }
      if (!isTransientWorkflowConflict(error)) throw error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  if (isTransientWorkflowConflict(lastError)) throw new Error("Work is busy; retry the action.");
  throw lastError;
}

function isTransientWorkflowConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2002", "P2028", "P2034"].includes(error.code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|socket timeout|transaction.*(?:closed|conflict|timeout)|write conflict/i.test(message);
}

export async function claimWorkTask(input: { taskId: string; accountId: string; actorUserId: string; clientRequestId?: string }, client: Client = prisma) {
  const mutate=()=>client.$transaction(async (tx) => {
    const { user, task } = await taskForMutation(tx, input);
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "CLAIM", clientRequestId: input.clientRequestId }); if (prior) return prior;
    if (!["READY", "IN_PROGRESS"].includes(task.status)) throw new Error("Task cannot be claimed.");
    if (!task.assignedUserId) {
      const claimed = await tx.workTask.updateMany({ where: { id: task.id, assignedUserId: null, status: task.status }, data: { assignedUserId: user.id, status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id } });
      if (claimed.count !== 1) throw new Error("This work was taken by another worker.");
      await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_CLAIMED", requestKind: "CLAIM", before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId });
    }
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: Boolean(task.assignedUserId) };
  });
  try{return await mutate();}catch(error){
    if(!input.clientRequestId)throw error;
    for(let attempt=0;attempt<3;attempt++){
      const replay=await client.$transaction(async(tx)=>{const{user,task}=await taskForMutation(tx,input);if(task.assignedUserId&&task.assignedUserId!==user.id&&user.role!=="OWNER")throw new Error("This work was taken by another worker.");return duplicateResult(tx,{taskId:task.id,actorUserId:user.id,requestKind:"CLAIM",clientRequestId:input.clientRequestId});});
      if(replay)return replay;if(attempt<2)await new Promise((resolve)=>setTimeout(resolve,10));
    }throw error;
  }
}

export async function recalculateConsignmentCompletion(tx: Transaction, input: { batchId: string; actorUserId: string; completedLineId?: string }) {
  if (input.completedLineId) await tx.consignmentLine.updateMany({ where: { id: input.completedLineId, completedAt: null }, data: { completedAt: new Date(), completedByUserId: input.actorUserId } });
  const [batch, problemCount, packCount, completedPackCount] = await Promise.all([
    tx.consignmentBatch.findUnique({ where: { id: input.batchId }, select: { id: true, accountId: true, status: true } }),
    tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId }, status: "PROBLEM" } }),
    tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId }, stage: "PACK" } }),
    tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId }, stage: "PACK", status: "COMPLETED" } })
  ]);
  if (!batch) return;
  if (problemCount > 0) { await tx.consignmentBatch.updateMany({ where: { id: batch.id, status: { not: "COMPLETED" } }, data: { status: "PROBLEM" } }); return; }
  if (packCount > 0 && packCount === completedPackCount) {
    const changed = await tx.consignmentBatch.updateMany({ where: { id: batch.id, status: { not: "COMPLETED" } }, data: { status: "COMPLETED", completedAt: new Date(), completedByUserId: input.actorUserId } });
    if (changed.count) await tx.auditLog.create({ data: { userId: input.actorUserId, accountId: batch.accountId, action: "CONSIGNMENT_COMPLETED", entityType: "ConsignmentBatch", entityId: batch.id, metadata: JSON.stringify({ finalPackTasks: packCount }) } });
  } else if (batch.status === "PROBLEM") await tx.consignmentBatch.update({ where: { id: batch.id }, data: { status: "ACTIVE" } });
}

export async function setWorkTaskProgress(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; targetQuantity?: number; clientRequestId?: string; action?: "set" | "increment"; requestKind?: "INCREMENT" | "SET_PROGRESS" | "COMPLETE" }, client: Client = prisma) {
  if (!Number.isSafeInteger(input.expectedQuantity) || input.expectedQuantity < 0 || (input.targetQuantity !== undefined && (!Number.isSafeInteger(input.targetQuantity) || input.targetQuantity < 0))) throw new Error("Work quantity must be a non-negative whole number.");
  const requestKind = input.requestKind ?? (input.action === "increment" ? "INCREMENT" : "SET_PROGRESS");
  const mutate = () => client.$transaction(async (tx) => {
    const { user, task } = await taskForMutation(tx, input);
    const line = task.consignmentLine;
    if (!line) throw new Error("Task source line is unavailable.");
    const targetQuantity=requestKind==="COMPLETE"?task.requiredQuantity:input.targetQuantity;
    if(targetQuantity===undefined)throw new Error("Target quantity is required.");
    const fingerprint=requestFingerprint({expectedQuantity:input.expectedQuantity,targetQuantity,requestKind});
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind, clientRequestId: input.clientRequestId,fingerprint }); if (prior) return prior;
    if (task.status === "COMPLETED" && targetQuantity === task.requiredQuantity) return { completedQuantity: task.completedQuantity, completed: true, idempotent: true };
    if (!["READY", "IN_PROGRESS"].includes(task.status)) throw new Error("Task cannot advance from its current status.");
    if (task.completedQuantity !== input.expectedQuantity) throw new Error("Work changed; refresh before updating.");
    if (targetQuantity < task.completedQuantity || targetQuantity > task.requiredQuantity) throw new Error("Completed quantity is outside the allowed range.");
    const assignedUserId = task.assignedUserId ?? user.id;
    const nextStatus = targetQuantity === task.requiredQuantity ? "COMPLETED" : "IN_PROGRESS";
    const updated = await tx.workTask.updateMany({ where: { id: task.id, status: task.status, completedQuantity: task.completedQuantity, assignedUserId: task.assignedUserId }, data: { assignedUserId, completedQuantity: targetQuantity, status: nextStatus, startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id, completedAt: nextStatus === "COMPLETED" ? new Date() : null, completedByUserId: nextStatus === "COMPLETED" ? user.id : null } });
    if (updated.count !== 1) throw new Error(task.assignedUserId ? "Work changed; refresh before updating." : "This work was taken by another worker.");
    if (!task.assignedUserId) await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_CLAIMED", before: task.completedQuantity, after: task.completedQuantity });
    const action: WorkActionType = nextStatus === "COMPLETED" ? "TASK_COMPLETED" : input.action === "increment" ? "TASK_INCREMENTED" : "TASK_PROGRESS_SET";
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action, requestKind,fingerprint, before: task.completedQuantity, after: targetQuantity, clientRequestId: input.clientRequestId });
    if (nextStatus === "COMPLETED") {
      await unlockNextTask(tx, task.consignmentLineId!, task.sequenceNumber);
      await recalculateConsignmentCompletion(tx, { batchId: line.consignmentBatchId, actorUserId: user.id, completedLineId: task.stage === "PACK" ? line.id : undefined });
    }
    return { completedQuantity: targetQuantity, completed: nextStatus === "COMPLETED", idempotent: false };
  });
  return recoverIdempotentReplay({clientRequestId:input.clientRequestId,mutate,replay:async() => {
        const { user, task } = await taskForMutation(client, input);
        if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
        const targetQuantity=requestKind==="COMPLETE"?task.requiredQuantity:input.targetQuantity;if(targetQuantity===undefined)throw new Error("Target quantity is required.");
        return duplicateResult(client, { taskId: task.id, actorUserId: user.id, requestKind, clientRequestId: input.clientRequestId,fingerprint:requestFingerprint({expectedQuantity:input.expectedQuantity,targetQuantity,requestKind}) });
      }});
}

export function incrementWorkTaskProgress(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; increment: number; clientRequestId?: string }, client: Client = prisma) {
  if (!Number.isSafeInteger(input.increment) || input.increment <= 0) throw new Error("Increment must be a positive whole number.");
  return setWorkTaskProgress({ ...input, targetQuantity: input.expectedQuantity + input.increment, action: "increment", requestKind: "INCREMENT" }, client);
}

export async function completeWorkTask(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; clientRequestId?: string }, client: Client = prisma) {
  return setWorkTaskProgress({ ...input, action: "set", requestKind: "COMPLETE" }, client);
}

export function claimAndIncrementWorkTask(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; increment: number; clientRequestId: string }, client: Client = prisma) {
  return incrementWorkTaskProgress(input, client);
}

const PROBLEM_CATEGORIES = new Set(["PRODUCT_NOT_FOUND","WRONG_PRODUCT","QUANTITY_SHORT","DAMAGED_PRODUCT","MARKING_FILE_MISSING","MARKING_FILE_WRONG","MARKING_FAILED","PACKING_BLOCKED","IDENTIFIER_NOT_MATCHING","OTHER"]);

export async function reportWorkTaskProblem(input: { taskId: string; accountId: string; actorUserId: string; reason: string; note?: string; expectedQuantity: number; clientRequestId?: string }, client: Client = prisma) {
  if (!PROBLEM_CATEGORIES.has(input.reason)) throw new Error("Select a valid problem reason.");
  const fingerprint=requestFingerprint({expectedQuantity:input.expectedQuantity,reason:input.reason,note:input.note?.trim()||null});
  return recoverIdempotentReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user, task } = await taskForMutation(tx, input);
    if (user.role !== "OWNER" && !user.canReportProblem) throw new Error("Problem reporting permission is required.");
    const line = task.consignmentLine;
    if (!line) throw new Error("Task source line is unavailable.");
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "REPORT_PROBLEM", clientRequestId: input.clientRequestId,fingerprint }); if (prior) return prior;
    if (!["READY","IN_PROGRESS"].includes(task.status) || task.completedQuantity !== input.expectedQuantity) throw new Error("Task changed; refresh before reporting a problem.");
    const changed = await tx.workTask.updateMany({ where: { id: task.id, status: task.status, completedQuantity: task.completedQuantity, assignedUserId: task.assignedUserId }, data: { statusBeforeProblem: task.status, status: "PROBLEM", assignedUserId: task.assignedUserId ?? user.id, problemReason: input.reason, problemReportedAt: new Date(), problemReportedByUserId: user.id, problemResolutionNote: null, problemResolvedAt: null, problemResolvedByUserId: null } });
    if (changed.count !== 1) throw new Error("Task changed; refresh before reporting a problem.");
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_PROBLEM_REPORTED", requestKind: "REPORT_PROBLEM",fingerprint, before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId, note: input.note, metadata: { reason: input.reason } });
    await recalculateConsignmentCompletion(tx, { batchId: line.consignmentBatchId, actorUserId: user.id });
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user, task } = await taskForMutation(tx, input);
    if (user.role !== "OWNER" && !user.canReportProblem) throw new Error("Problem reporting permission is required.");
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    return duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "REPORT_PROBLEM", clientRequestId: input.clientRequestId, fingerprint });
  }) });
}

export async function resolveWorkTaskProblem(input: { taskId: string; accountId: string; actorUserId: string; resolutionNote: string; clientRequestId?: string }, client: Client = prisma) {
  if (!input.resolutionNote.trim()) throw new Error("Resolution note is required.");
  const fingerprint=requestFingerprint({resolutionNote:input.resolutionNote.trim().slice(0,1000)});
  return recoverIdempotentReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanResolveConsignmentProblems(user)) throw new Error("Consignment problem resolution permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT" }, include: { consignmentLine: { select: { accountId: true, consignmentBatchId: true } } } });
    if (!task?.consignmentLine || task.consignmentLine.accountId !== input.accountId) throw new Error("Problem task is unavailable.");
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "RESOLVE_PROBLEM", clientRequestId: input.clientRequestId,fingerprint }); if (prior) return prior;
    if (task.status !== "PROBLEM") throw new Error("Problem task is unavailable.");
    const restored = task.completedQuantity > 0 ? "IN_PROGRESS" : "READY";
    await tx.workTask.update({ where: { id: task.id }, data: { status: restored, problemResolutionNote: input.resolutionNote.trim().slice(0, 1000), problemResolvedAt: new Date(), problemResolvedByUserId: user.id } });
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_PROBLEM_RESOLVED", requestKind: "RESOLVE_PROBLEM",fingerprint, before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId, note: input.resolutionNote });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "CONSIGNMENT_TASK_PROBLEM_RESOLVED", entityType: "WorkTask", entityId: task.id, metadata: JSON.stringify({ restoredStatus: restored }) } });
    await recalculateConsignmentCompletion(tx, { batchId: task.consignmentLine.consignmentBatchId, actorUserId: user.id });
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanResolveConsignmentProblems(user)) throw new Error("Consignment problem resolution permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT" }, select: { id: true } });
    if (!task) throw new Error("Problem task is unavailable.");
    return duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "RESOLVE_PROBLEM", clientRequestId: input.clientRequestId, fingerprint });
  }) });
}

export async function reassignWorkTask(input: { taskId: string; accountId: string; actorUserId: string; assignedUserId: string | null; clientRequestId?: string }, client: Client = prisma) {
  const fingerprint=requestFingerprint({assignedUserId:input.assignedUserId});
  return recoverIdempotentReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT", status: { in: ["LOCKED","READY","IN_PROGRESS","PROBLEM"] } } });
    if (!task) throw new Error("Task is unavailable.");
    const requestKind = input.assignedUserId ? "REASSIGN" as const : "UNASSIGN" as const;
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind, clientRequestId: input.clientRequestId,fingerprint }); if (prior) return { assignedUserId: input.assignedUserId, idempotent: true };
    if (input.assignedUserId) {
      const target = await assertWorkerAccountAccess(input.assignedUserId, input.accountId, tx);
      if (!userCanMutateStage(target.user, task.stage)) throw new Error("Selected worker lacks this stage permission.");
    }
    const before = task.assignedUserId;
    await tx.workTask.update({ where: { id: task.id }, data: { assignedUserId: input.assignedUserId } });
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: input.assignedUserId ? "TASK_REASSIGNED" : "TASK_UNASSIGNED", requestKind,fingerprint, clientRequestId: input.clientRequestId, metadata: { previousUserId: before, assignedUserId: input.assignedUserId } });
    return { assignedUserId: input.assignedUserId, idempotent: false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT" }, select: { id: true } });
    if (!task) throw new Error("Task is unavailable.");
    const requestKind = input.assignedUserId ? "REASSIGN" as const : "UNASSIGN" as const;
    const prior = await duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind, clientRequestId: input.clientRequestId, fingerprint });
    return prior ? { assignedUserId: input.assignedUserId, idempotent: true } : null;
  }) });
}

export function unassignWorkTask(input: { taskId: string; accountId: string; actorUserId: string }, client: Client = prisma) {
  return reassignWorkTask({ ...input, assignedUserId: null }, client);
}

export async function reassignConsignmentStage(input: { batchId: string; accountId: string; actorUserId: string; stage: "PICK" | "MARK" | "PACK"; assignedUserId: string | null; clientRequestId?: string }, client: Client = prisma) {
  const fingerprint=requestFingerprint({batchId:input.batchId,stage:input.stage,assignedUserId:input.assignedUserId});
  return recoverIdempotentReplay({ clientRequestId: input.clientRequestId, mutate: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    if (input.assignedUserId) {
      const target = await assertWorkerAccountAccess(input.assignedUserId, input.accountId, tx);
      if (!userCanMutateStage(target.user, input.stage)) throw new Error("Selected worker lacks this stage permission.");
    }
    const tasks = await tx.workTask.findMany({ where: { accountId: input.accountId, sourceType: "CONSIGNMENT", stage: input.stage, consignmentLine: { consignmentBatchId: input.batchId }, status: { in: ["LOCKED", "READY", "IN_PROGRESS", "PROBLEM"] } }, select: { id: true, assignedUserId: true } });
    if (!tasks.length) return { count: 0 };
    if (input.clientRequestId) {
      const replays=await Promise.all(tasks.map((task)=>duplicateResult(tx,{taskId:task.id,actorUserId:user.id,requestKind:"BULK_ASSIGN",clientRequestId:input.clientRequestId,fingerprint})));
      if(replays.every(Boolean))return{count:tasks.length,idempotent:true};
      if(replays.some(Boolean))throw new Error("Request ID was only partially recorded; refresh before retrying.");
    }
    await tx.workTask.updateMany({ where: { id: { in: tasks.map((task) => task.id) } }, data: { assignedUserId: input.assignedUserId } });
    await tx.workActionLog.createMany({ data: tasks.map((task) => ({ accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: input.assignedUserId ? "TASK_REASSIGNED" as const : "TASK_UNASSIGNED" as const,requestKind:input.clientRequestId?"BULK_ASSIGN" as const:null,clientRequestId:input.clientRequestId||null, metadataJson: JSON.stringify({ previousUserId: task.assignedUserId, assignedUserId: input.assignedUserId, bulkStage: input.stage,requestFingerprint:fingerprint }) })) });
    return { count: tasks.length,idempotent:false };
  }), replay: () => client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    const tasks = await tx.workTask.findMany({ where: { accountId: input.accountId, sourceType: "CONSIGNMENT", stage: input.stage, consignmentLine: { consignmentBatchId: input.batchId } }, select: { id: true } });
    if (!tasks.length) return { count: 0, idempotent: true };
    const replays = await Promise.all(tasks.map((task) => duplicateResult(tx, { taskId: task.id, actorUserId: user.id, requestKind: "BULK_ASSIGN", clientRequestId: input.clientRequestId, fingerprint })));
    return replays.every(Boolean) ? { count: tasks.length, idempotent: true } : null;
  }) });
}

export async function unlockNextTask(tx: Transaction, consignmentLineId: string, sequenceNumber: number) {
  return tx.workTask.updateMany({ where: { consignmentLineId, sequenceNumber: sequenceNumber + 1, status: "LOCKED" }, data: { status: "READY" } });
}

export async function cancelUnstartedTaskPlan(input: { batchId: string; accountId: string }) {
  return prisma.workTask.updateMany({ where: { accountId: input.accountId, consignmentLine: { consignmentBatchId: input.batchId }, status: { in: ["LOCKED", "READY"] }, completedQuantity: 0 }, data: { status: "CANCELLED" } });
}

export async function getTaskPlanForLine(lineId: string, accountId: string) {
  return prisma.workTask.findMany({ where: { consignmentLineId: lineId, accountId }, orderBy: { sequenceNumber: "asc" } });
}
