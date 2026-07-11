import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ProcessRoute, type WorkActionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildTaskPlan } from "./tasks";
import { assertWorkerAccountAccess, userCanManageConsignmentTasks, userCanMutateStage } from "./worker-access";

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
      marketplaceListing: { select: { id: true, accountId: true, sellerSkuId: true, fsn: true, listingId: true, productTitle: true, mainImageUrl: true } },
      processRule: { select: { id: true, accountId: true, marketplaceListingId: true, active: true, route: true, markingAssetId: true } },
      markingAsset: { select: { id: true, active: true, listingLinks: { where: { active: true }, select: { accountId: true, marketplaceListingId: true } }, files: { where: { attachmentType: "MARKING_FILE", activeVersion: true }, take: 1, select: { id: true } } } }
    } } }
  });
  if (!batch) return { batch: null, problems: [{ code: "NOT_FOUND", message: "Consignment is not available in the selected account." }] as ActivationProblem[] };
  const problems: ActivationProblem[] = [];
  for (const line of batch.lines) {
    const identify = { lineId: line.id, rowNumber: line.rowNumber };
    if (line.accountId !== accountId || line.marketplaceListing?.accountId !== accountId) problems.push({ ...identify, code: "ACCOUNT_MISMATCH", message: "Line and listing must belong to the selected account." });
    if (!Number.isSafeInteger(line.requiredQuantity) || line.requiredQuantity <= 0) problems.push({ ...identify, code: "INVALID_QUANTITY", message: "Required quantity must be a positive whole number." });
    if (!line.marketplaceListing || !["EXACT_SKU", "EXACT_FSN", "OWNER_SELECTED"].includes(line.matchStatus)) problems.push({ ...identify, code: "MISSING_LISTING", message: "Select one account listing before activation." });
    if (!routeSupported(line.processRoute)) problems.push({ ...identify, code: "MISSING_ROUTE", message: "Select Ready-made or Marking route before activation." });
    if (!line.processRule?.active || line.processRule.accountId !== line.accountId || line.processRule.marketplaceListingId !== line.marketplaceListingId || line.processRule.route !== line.processRoute) problems.push({ ...identify, code: "STALE_RULE", message: "Save an active account-scoped process rule matching this listing and route." });
    const markingLinked = line.markingAsset?.listingLinks.some((link) => link.accountId === line.accountId && link.marketplaceListingId === line.marketplaceListingId);
    if (line.processRoute === "PICK_MARK_PACK" && (!line.markingAsset?.active || !markingLinked || !line.markingAsset.files.length || line.processRule?.markingAssetId !== line.markingAssetId)) problems.push({ ...identify, code: "MISSING_MARKING_FILE", message: "Marking route requires an active linked marking asset and marking file." });
  }
  if (!batch.lines.length) problems.push({ code: "NO_LINES", message: "Consignment has no valid lines." });
  return { batch, problems };
}

async function writeSnapshotChunk(tx: Transaction, lines: NonNullable<Awaited<ReturnType<typeof validateConsignmentActivation>>["batch"]>["lines"]) {
  const ids = lines.map((line) => line.id);
  const cases = <T>(get: (line: typeof lines[number]) => T) => Prisma.join(lines.map((line) => Prisma.sql`WHEN ${line.id} THEN ${get(line)}`), " ");
  await tx.$executeRaw(Prisma.sql`UPDATE "ConsignmentLine" SET
    "activated" = true,
    "productTitleSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.productTitle ?? line.productNameSource)} ELSE "productTitleSnapshot" END,
    "productImageSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.mainImageUrl ?? null)} ELSE "productImageSnapshot" END,
    "sellerSkuSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.sellerSkuId ?? line.sellerSkuSource)} ELSE "sellerSkuSnapshot" END,
    "fsnSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.fsn ?? line.fsnSource)} ELSE "fsnSnapshot" END,
    "listingIdSnapshot" = CASE "id" ${cases((line) => line.marketplaceListing?.listingId ?? null)} ELSE "listingIdSnapshot" END
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

async function taskForMutation(tx: Transaction, input: { taskId: string; accountId: string; actorUserId: string }) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
  const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT" }, include: { consignmentLine: { select: { id: true, accountId: true, consignmentBatchId: true } } } });
  if (!task?.consignmentLine || task.consignmentLine.accountId !== input.accountId) throw new Error("Task is not available in the selected account.");
  if (!userCanMutateStage(user, task.stage)) throw new Error("Worker lacks permission for this stage.");
  return { user, task };
}

async function duplicateResult(tx: Transaction, taskId: string, clientRequestId?: string) {
  if (!clientRequestId) return null;
  const log = await tx.workActionLog.findUnique({ where: { taskId_clientRequestId: { taskId, clientRequestId } } });
  return log ? { completedQuantity: log.quantityAfter ?? log.quantityBefore ?? 0, completed: log.action === "TASK_COMPLETED", idempotent: true } : null;
}

async function logAction(tx: Transaction, input: { accountId: string; taskId: string; actorUserId: string; action: WorkActionType; before?: number; after?: number; clientRequestId?: string; note?: string; metadata?: Record<string, unknown> }) {
  return tx.workActionLog.create({ data: { accountId: input.accountId, taskId: input.taskId, actorUserId: input.actorUserId, action: input.action, quantityBefore: input.before, quantityAfter: input.after, clientRequestId: input.clientRequestId || null, note: input.note?.slice(0, 1000) || null, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null } });
}

export async function claimWorkTask(input: { taskId: string; accountId: string; actorUserId: string; clientRequestId?: string }, client: Client = prisma) {
  return client.$transaction(async (tx) => {
    const prior = await duplicateResult(tx, input.taskId, input.clientRequestId); if (prior) return prior;
    const { user, task } = await taskForMutation(tx, input);
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    if (!["READY", "IN_PROGRESS"].includes(task.status)) throw new Error("Task cannot be claimed.");
    if (!task.assignedUserId) {
      const claimed = await tx.workTask.updateMany({ where: { id: task.id, assignedUserId: null, status: task.status }, data: { assignedUserId: user.id, status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id } });
      if (claimed.count !== 1) throw new Error("This work was taken by another worker.");
      await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_CLAIMED", before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId });
    }
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: Boolean(task.assignedUserId) };
  });
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

export async function setWorkTaskProgress(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; targetQuantity: number; clientRequestId?: string; action?: "set" | "increment" }, client: Client = prisma) {
  if (![input.expectedQuantity, input.targetQuantity].every(Number.isSafeInteger) || input.expectedQuantity < 0 || input.targetQuantity < 0) throw new Error("Work quantity must be a non-negative whole number.");
  return client.$transaction(async (tx) => {
    const prior = await duplicateResult(tx, input.taskId, input.clientRequestId); if (prior) return prior;
    const { user, task } = await taskForMutation(tx, input);
    const line = task.consignmentLine;
    if (!line) throw new Error("Task source line is unavailable.");
    if (task.status === "COMPLETED" && input.targetQuantity === task.requiredQuantity) return { completedQuantity: task.completedQuantity, completed: true, idempotent: true };
    if (!["READY", "IN_PROGRESS"].includes(task.status)) throw new Error("Task cannot advance from its current status.");
    if (task.completedQuantity !== input.expectedQuantity) throw new Error("Work changed; refresh before updating.");
    if (input.targetQuantity < task.completedQuantity || input.targetQuantity > task.requiredQuantity) throw new Error("Completed quantity is outside the allowed range.");
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    const assignedUserId = task.assignedUserId ?? user.id;
    const nextStatus = input.targetQuantity === task.requiredQuantity ? "COMPLETED" : "IN_PROGRESS";
    const updated = await tx.workTask.updateMany({ where: { id: task.id, status: task.status, completedQuantity: task.completedQuantity, assignedUserId: task.assignedUserId }, data: { assignedUserId, completedQuantity: input.targetQuantity, status: nextStatus, startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? user.id, completedAt: nextStatus === "COMPLETED" ? new Date() : null, completedByUserId: nextStatus === "COMPLETED" ? user.id : null } });
    if (updated.count !== 1) throw new Error(task.assignedUserId ? "Work changed; refresh before updating." : "This work was taken by another worker.");
    if (!task.assignedUserId) await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_CLAIMED", before: task.completedQuantity, after: task.completedQuantity });
    const action: WorkActionType = nextStatus === "COMPLETED" ? "TASK_COMPLETED" : input.action === "increment" ? "TASK_INCREMENTED" : "TASK_PROGRESS_SET";
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action, before: task.completedQuantity, after: input.targetQuantity, clientRequestId: input.clientRequestId });
    if (nextStatus === "COMPLETED") {
      await unlockNextTask(tx, task.consignmentLineId!, task.sequenceNumber);
      await recalculateConsignmentCompletion(tx, { batchId: line.consignmentBatchId, actorUserId: user.id, completedLineId: task.stage === "PACK" ? line.id : undefined });
    }
    return { completedQuantity: input.targetQuantity, completed: nextStatus === "COMPLETED", idempotent: false };
  });
}

export function incrementWorkTaskProgress(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; increment: number; clientRequestId?: string }, client: Client = prisma) {
  if (!Number.isSafeInteger(input.increment) || input.increment <= 0) throw new Error("Increment must be a positive whole number.");
  return setWorkTaskProgress({ ...input, targetQuantity: input.expectedQuantity + input.increment, action: "increment" }, client);
}

export async function completeWorkTask(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; clientRequestId?: string }, client: Client = prisma) {
  const task = await client.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId }, select: { requiredQuantity: true } });
  if (!task) throw new Error("Task is unavailable.");
  return setWorkTaskProgress({ ...input, targetQuantity: task.requiredQuantity, action: "set" }, client);
}

export function claimAndIncrementWorkTask(input: { taskId: string; accountId: string; actorUserId: string; expectedQuantity: number; increment: number; clientRequestId: string }, client: Client = prisma) {
  return incrementWorkTaskProgress(input, client);
}

const PROBLEM_CATEGORIES = new Set(["PRODUCT_NOT_FOUND","WRONG_PRODUCT","QUANTITY_SHORT","DAMAGED_PRODUCT","MARKING_FILE_MISSING","MARKING_FILE_WRONG","MARKING_FAILED","PACKING_BLOCKED","IDENTIFIER_NOT_MATCHING","OTHER"]);

export async function reportWorkTaskProblem(input: { taskId: string; accountId: string; actorUserId: string; reason: string; note?: string; expectedQuantity: number; clientRequestId?: string }, client: Client = prisma) {
  if (!PROBLEM_CATEGORIES.has(input.reason)) throw new Error("Select a valid problem reason.");
  return client.$transaction(async (tx) => {
    const prior = await duplicateResult(tx, input.taskId, input.clientRequestId); if (prior) return prior;
    const { user, task } = await taskForMutation(tx, input);
    if (user.role !== "OWNER" && !user.canReportProblem) throw new Error("Problem reporting permission is required.");
    const line = task.consignmentLine;
    if (!line) throw new Error("Task source line is unavailable.");
    if (!["READY","IN_PROGRESS"].includes(task.status) || task.completedQuantity !== input.expectedQuantity) throw new Error("Task changed; refresh before reporting a problem.");
    if (task.assignedUserId && task.assignedUserId !== user.id && user.role !== "OWNER") throw new Error("This work was taken by another worker.");
    const changed = await tx.workTask.updateMany({ where: { id: task.id, status: task.status, completedQuantity: task.completedQuantity, assignedUserId: task.assignedUserId }, data: { statusBeforeProblem: task.status, status: "PROBLEM", assignedUserId: task.assignedUserId ?? user.id, problemReason: input.reason, problemReportedAt: new Date(), problemReportedByUserId: user.id, problemResolutionNote: null, problemResolvedAt: null, problemResolvedByUserId: null } });
    if (changed.count !== 1) throw new Error("Task changed; refresh before reporting a problem.");
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_PROBLEM_REPORTED", before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId, note: input.note, metadata: { reason: input.reason } });
    await recalculateConsignmentCompletion(tx, { batchId: line.consignmentBatchId, actorUserId: user.id });
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: false };
  });
}

export async function resolveWorkTaskProblem(input: { taskId: string; accountId: string; actorUserId: string; resolutionNote: string; clientRequestId?: string }, client: Client = prisma) {
  if (!input.resolutionNote.trim()) throw new Error("Resolution note is required.");
  return client.$transaction(async (tx) => {
    const prior = await duplicateResult(tx, input.taskId, input.clientRequestId); if (prior) return prior;
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user) && !user.canViewAllWork) throw new Error("Consignment management permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT", status: "PROBLEM" }, include: { consignmentLine: { select: { accountId: true, consignmentBatchId: true } } } });
    if (!task?.consignmentLine || task.consignmentLine.accountId !== input.accountId) throw new Error("Problem task is unavailable.");
    const restored = task.completedQuantity > 0 ? "IN_PROGRESS" : "READY";
    await tx.workTask.update({ where: { id: task.id }, data: { status: restored, problemResolutionNote: input.resolutionNote.trim().slice(0, 1000), problemResolvedAt: new Date(), problemResolvedByUserId: user.id } });
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: "TASK_PROBLEM_RESOLVED", before: task.completedQuantity, after: task.completedQuantity, clientRequestId: input.clientRequestId, note: input.resolutionNote });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: "CONSIGNMENT_TASK_PROBLEM_RESOLVED", entityType: "WorkTask", entityId: task.id, metadata: JSON.stringify({ restoredStatus: restored }) } });
    await recalculateConsignmentCompletion(tx, { batchId: task.consignmentLine.consignmentBatchId, actorUserId: user.id });
    return { completedQuantity: task.completedQuantity, completed: false, idempotent: false };
  });
}

export async function reassignWorkTask(input: { taskId: string; accountId: string; actorUserId: string; assignedUserId: string | null }, client: Client = prisma) {
  return client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    const task = await tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId, sourceType: "CONSIGNMENT", status: { in: ["LOCKED","READY","IN_PROGRESS","PROBLEM"] } } });
    if (!task) throw new Error("Task is unavailable.");
    if (input.assignedUserId) {
      const target = await assertWorkerAccountAccess(input.assignedUserId, input.accountId, tx);
      if (!userCanMutateStage(target.user, task.stage)) throw new Error("Selected worker lacks this stage permission.");
    }
    const before = task.assignedUserId;
    await tx.workTask.update({ where: { id: task.id }, data: { assignedUserId: input.assignedUserId } });
    await logAction(tx, { accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: input.assignedUserId ? "TASK_REASSIGNED" : "TASK_UNASSIGNED", metadata: { previousUserId: before, assignedUserId: input.assignedUserId } });
    return { assignedUserId: input.assignedUserId };
  });
}

export function unassignWorkTask(input: { taskId: string; accountId: string; actorUserId: string }, client: Client = prisma) {
  return reassignWorkTask({ ...input, assignedUserId: null }, client);
}

export async function reassignConsignmentStage(input: { batchId: string; accountId: string; actorUserId: string; stage: "PICK" | "MARK" | "PACK"; assignedUserId: string | null }, client: Client = prisma) {
  return client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!userCanManageConsignmentTasks(user)) throw new Error("Consignment management permission is required.");
    if (input.assignedUserId) {
      const target = await assertWorkerAccountAccess(input.assignedUserId, input.accountId, tx);
      if (!userCanMutateStage(target.user, input.stage)) throw new Error("Selected worker lacks this stage permission.");
    }
    const tasks = await tx.workTask.findMany({ where: { accountId: input.accountId, sourceType: "CONSIGNMENT", stage: input.stage, consignmentLine: { consignmentBatchId: input.batchId }, status: { in: ["LOCKED", "READY", "IN_PROGRESS", "PROBLEM"] } }, select: { id: true, assignedUserId: true } });
    if (!tasks.length) return { count: 0 };
    await tx.workTask.updateMany({ where: { id: { in: tasks.map((task) => task.id) } }, data: { assignedUserId: input.assignedUserId } });
    await tx.workActionLog.createMany({ data: tasks.map((task) => ({ accountId: input.accountId, taskId: task.id, actorUserId: user.id, action: input.assignedUserId ? "TASK_REASSIGNED" as const : "TASK_UNASSIGNED" as const, metadataJson: JSON.stringify({ previousUserId: task.assignedUserId, assignedUserId: input.assignedUserId, bulkStage: input.stage }) })) });
    return { count: tasks.length };
  });
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
