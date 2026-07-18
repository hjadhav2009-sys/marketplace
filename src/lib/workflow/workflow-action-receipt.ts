import type { Prisma, WorkSourceType, WorkStage } from "@prisma/client";

type Input = {
  accountId: string;
  actorUserId: string;
  requestKind: string;
  clientRequestId: string;
  requestFingerprint: string;
  sourceType: WorkSourceType;
  stage?: WorkStage | null;
  originalGroupKey?: string | null;
};

const localRequestGates = new Map<string, Promise<void>>();

export async function withWorkflowActionRequestGate<T>(key: string, action: () => Promise<T>) {
  const prior = localRequestGates.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>(resolve => { release = resolve; });
  const queued = prior.then(() => current);
  localRequestGates.set(key, queued);
  await prior;
  try {
    return await action();
  } finally {
    release();
    if (localRequestGates.get(key) === queued) localRequestGates.delete(key);
  }
}

export async function beginWorkflowActionReceipt<T>(tx: Prisma.TransactionClient, input: Input) {
  const existing = await tx.workflowActionReceipt.findUnique({ where: { accountId_actorUserId_requestKind_clientRequestId: {
    accountId: input.accountId, actorUserId: input.actorUserId, requestKind: input.requestKind, clientRequestId: input.clientRequestId
  } } });
  if (existing) {
    if (existing.requestFingerprint !== input.requestFingerprint || existing.sourceType !== input.sourceType || existing.stage !== (input.stage ?? null)) {
      throw new Error("Request ID was already used for a different workflow action.");
    }
    if (existing.status === "COMPLETED" && existing.resultJson) return { receiptId: existing.id, replay: JSON.parse(existing.resultJson) as T };
    throw new Error("This workflow action is still being processed; retry shortly.");
  }
  const receipt = await tx.workflowActionReceipt.create({ data: {
    accountId: input.accountId, actorUserId: input.actorUserId, requestKind: input.requestKind,
    clientRequestId: input.clientRequestId, requestFingerprint: input.requestFingerprint,
    sourceType: input.sourceType, stage: input.stage ?? null, originalGroupKey: input.originalGroupKey ?? null
  } });
  return { receiptId: receipt.id, replay: null as T | null };
}

export async function completeWorkflowActionReceipt<T>(tx: Prisma.TransactionClient, receiptId: string, result: T) {
  await tx.workflowActionReceipt.update({ where: { id: receiptId }, data: { status: "COMPLETED", resultJson: JSON.stringify(result), completedAt: new Date() } });
  return result;
}
