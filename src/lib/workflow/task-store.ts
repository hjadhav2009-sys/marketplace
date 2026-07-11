import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, ProcessRoute, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { buildTaskPlan } from "./tasks";

type Transaction = Prisma.TransactionClient;

export type ActivationProblem = { lineId?: string; rowNumber?: number; code: string; message: string };

function routeSupported(route: ProcessRoute | null): route is "PICK_PACK" | "PICK_MARK_PACK" {
  return route === "PICK_PACK" || route === "PICK_MARK_PACK";
}

export function createConsignmentTaskPlan(input: { lineId: string; accountId: string; route: "PICK_PACK" | "PICK_MARK_PACK"; requiredQuantity: number }) {
  if (!Number.isSafeInteger(input.requiredQuantity) || input.requiredQuantity <= 0) throw new Error("Required work quantity must be a positive whole number.");
  return buildTaskPlan(input.route, input.requiredQuantity).map((task) => ({
    id: `wkt_${randomUUID().replace(/-/g, "")}`,
    accountId: input.accountId,
    sourceType: "CONSIGNMENT" as const,
    orderId: null,
    consignmentLineId: input.lineId,
    ...task
  }));
}

export async function validateConsignmentActivation(batchId: string, accountId: string, client: PrismaClient | Transaction = prisma) {
  const batch = await client.consignmentBatch.findFirst({
    where: { id: batchId, accountId },
    include: {
      lines: {
        orderBy: { rowNumber: "asc" },
        include: {
          marketplaceListing: { select: { id: true, accountId: true, sellerSkuId: true, fsn: true, listingId: true, productTitle: true, mainImageUrl: true } },
          processRule: { select: { id: true, active: true, route: true, markingAssetId: true } },
          markingAsset: { select: { id: true, active: true, files: { where: { attachmentType: "MARKING_FILE", activeVersion: true }, take: 1, select: { id: true } } } }
        }
      }
    }
  });
  if (!batch) return { batch: null, problems: [{ code: "NOT_FOUND", message: "Consignment is not available in the selected account." }] as ActivationProblem[] };
  const problems: ActivationProblem[] = [];
  for (const line of batch.lines) {
    const identify = { lineId: line.id, rowNumber: line.rowNumber };
    if (line.accountId !== accountId || line.marketplaceListing?.accountId !== accountId) problems.push({ ...identify, code: "ACCOUNT_MISMATCH", message: "Line and listing must belong to the selected account." });
    if (!Number.isSafeInteger(line.requiredQuantity) || line.requiredQuantity <= 0) problems.push({ ...identify, code: "INVALID_QUANTITY", message: "Required quantity must be a positive whole number." });
    if (!line.marketplaceListing || !["EXACT_SKU", "EXACT_FSN"].includes(line.matchStatus)) problems.push({ ...identify, code: "MISSING_LISTING", message: "Select one account listing before activation." });
    if (!routeSupported(line.processRoute)) problems.push({ ...identify, code: "MISSING_ROUTE", message: "Select Ready-made or Marking route before activation." });
    if (!line.processRule?.active || line.processRule.route !== line.processRoute) problems.push({ ...identify, code: "STALE_RULE", message: "Save an active process rule matching the selected route." });
    if (line.processRoute === "PICK_MARK_PACK" && (!line.markingAsset?.active || !line.markingAsset.files.length || line.processRule?.markingAssetId !== line.markingAssetId)) problems.push({ ...identify, code: "MISSING_MARKING_FILE", message: "Marking route requires an active linked marking asset and marking file." });
  }
  if (!batch.lines.length) problems.push({ code: "NO_LINES", message: "Consignment has no valid lines." });
  return { batch, problems };
}

export async function activateConsignmentBatch(input: { batchId: string; accountId: string; actorUserId: string }, client: PrismaClient = prisma) {
  try {
    return await client.$transaction(async (tx) => {
      const claimed = await tx.consignmentBatch.updateMany({ where: { id: input.batchId, accountId: input.accountId, status: "READY_TO_ACTIVATE" }, data: { status: "ACTIVATING" } });
      if (claimed.count !== 1) {
        const existing = await tx.consignmentBatch.findFirst({ where: { id: input.batchId, accountId: input.accountId }, select: { status: true } });
        if (existing?.status === "ACTIVE" || existing?.status === "COMPLETED") return { activated: false, alreadyActive: true, taskCount: await tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId } } }) };
        throw new Error("Consignment is not ready to activate.");
      }
      const existingTasks = await tx.workTask.count({ where: { consignmentLine: { consignmentBatchId: input.batchId } } });
      if (existingTasks) throw new Error("Consignment already has a task plan.");
      const validation = await validateConsignmentActivation(input.batchId, input.accountId, tx);
      if (!validation.batch || validation.problems.length) throw new Error(validation.problems[0]?.message ?? "Consignment validation failed.");

      const tasks: Prisma.WorkTaskCreateManyInput[] = [];
      for (const line of validation.batch.lines) {
        const route = line.processRoute as "PICK_PACK" | "PICK_MARK_PACK";
        tasks.push(...createConsignmentTaskPlan({ lineId: line.id, accountId: input.accountId, route, requiredQuantity: line.requiredQuantity }));
        await tx.consignmentLine.update({
          where: { id: line.id },
          data: {
            activated: true,
            productTitleSnapshot: line.marketplaceListing?.productTitle ?? line.productNameSource,
            productImageSnapshot: line.marketplaceListing?.mainImageUrl ?? null,
            sellerSkuSnapshot: line.marketplaceListing?.sellerSkuId ?? line.sellerSkuSource,
            fsnSnapshot: line.marketplaceListing?.fsn ?? line.fsnSource,
            listingIdSnapshot: line.marketplaceListing?.listingId ?? null
          }
        });
      }
      for (let index = 0; index < tasks.length; index += 500) await tx.workTask.createMany({ data: tasks.slice(index, index + 500) });
      const now = new Date();
      await tx.consignmentBatch.update({ where: { id: input.batchId }, data: { status: "ACTIVE", activatedAt: now, activatedByUserId: input.actorUserId } });
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

function permissionForStage(stage: WorkStage) {
  if (stage === "PICK") return "canPick" as const;
  if (stage === "MARK") return "canMark" as const;
  if (stage === "ASSEMBLE") return "canAssemble" as const;
  return "canPack" as const;
}

export async function completeWorkTask(input: { taskId: string; accountId: string; actorUserId: string; completedQuantity: number }) {
  if (!Number.isSafeInteger(input.completedQuantity) || input.completedQuantity < 0) throw new Error("Completed quantity must be a non-negative whole number.");
  return prisma.$transaction(async (tx) => {
    const [user, task] = await Promise.all([
      tx.user.findUnique({ where: { id: input.actorUserId } }),
      tx.workTask.findFirst({ where: { id: input.taskId, accountId: input.accountId }, include: { consignmentLine: { select: { accountId: true } } } })
    ]);
    if (!user || !user.active || !task || task.consignmentLine?.accountId !== input.accountId || !hasWorkPermission(user, permissionForStage(task.stage))) throw new Error("Task is not available.");
    if (task.status === "COMPLETED" && task.completedQuantity === input.completedQuantity) return { completed: true, idempotent: true };
    if (task.status === "LOCKED" || task.status === "PROBLEM" || task.status === "CANCELLED") throw new Error("Task cannot advance from its current status.");
    if (input.completedQuantity < task.completedQuantity || input.completedQuantity > task.requiredQuantity) throw new Error("Completed quantity is outside the allowed range.");
    const nextStatus = input.completedQuantity === task.requiredQuantity ? "COMPLETED" : "IN_PROGRESS";
    const updated = await tx.workTask.updateMany({ where: { id: task.id, accountId: input.accountId, status: task.status, completedQuantity: task.completedQuantity }, data: { completedQuantity: input.completedQuantity, status: nextStatus, startedAt: task.startedAt ?? new Date(), startedByUserId: task.startedByUserId ?? input.actorUserId, completedAt: nextStatus === "COMPLETED" ? new Date() : null, completedByUserId: nextStatus === "COMPLETED" ? input.actorUserId : null } });
    if (updated.count !== 1) throw new Error("Task changed in another request; reload and try again.");
    if (nextStatus === "COMPLETED") await tx.workTask.updateMany({ where: { consignmentLineId: task.consignmentLineId, sequenceNumber: task.sequenceNumber + 1, status: "LOCKED" }, data: { status: "READY" } });
    await tx.auditLog.create({ data: { userId: input.actorUserId, accountId: input.accountId, action: nextStatus === "COMPLETED" ? "WORK_TASK_COMPLETED" : "WORK_TASK_PROGRESS_UPDATED", entityType: "WorkTask", entityId: task.id, metadata: JSON.stringify({ stage: task.stage, completedQuantity: input.completedQuantity }) } });
    return { completed: nextStatus === "COMPLETED", idempotent: false };
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
