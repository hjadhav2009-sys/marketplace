import type { Prisma } from "@prisma/client";

export const workQueueFilters = ["today", "current-batch", "all-pending", "old-pending", "problems"] as const;

export type WorkQueueFilter = (typeof workQueueFilters)[number];

export type WorkQueueOrderInput = {
  accountId: string;
  batchId?: string | null;
  packStatus: string;
  pickStatus?: string | null;
  status?: string | null;
  importedAt: Date;
};

export const noActiveOrderWorkflowProblem = {
  workTasks: { none: { status: "PROBLEM" as const } }
} satisfies Prisma.OrderWhereInput;

export function startOfWorkDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function normalizeWorkQueueFilter(value?: string | null): WorkQueueFilter {
  return workQueueFilters.includes(value as WorkQueueFilter) ? (value as WorkQueueFilter) : "today";
}

export function buildWorkQueueOrderWhere(
  accountId: string,
  input: { work?: string | null; batchId?: string | null; now?: Date } = {}
): Prisma.OrderWhereInput {
  const work = normalizeWorkQueueFilter(input.work);
  const startOfToday = startOfWorkDay(input.now);

  if (work === "current-batch") {
    return {
      accountId,
      batchId: input.batchId ?? "__NO_ACTIVE_BATCH__",
      packStatus: { not: "PACKED" }
    };
  }

  if (work === "all-pending") {
    return {
      accountId,
      packStatus: "READY"
    };
  }

  if (work === "old-pending") {
    return {
      accountId,
      packStatus: "READY",
      importedAt: { lt: startOfToday }
    };
  }

  if (work === "problems") {
    return {
      accountId,
      OR: [{ pickStatus: "PROBLEM" }, { packStatus: "PROBLEM" }, { status: "PROBLEM" }]
    };
  }

  return {
    accountId,
    packStatus: { not: "PACKED" },
    importedAt: { gte: startOfToday }
  };
}

export function orderMatchesWorkQueue(
  order: WorkQueueOrderInput,
  input: { accountId: string; work?: string | null; batchId?: string | null; now?: Date }
) {
  if (order.accountId !== input.accountId) {
    return false;
  }

  const work = normalizeWorkQueueFilter(input.work);
  const startOfToday = startOfWorkDay(input.now);

  if (work === "current-batch") {
    return order.batchId === input.batchId && order.packStatus !== "PACKED";
  }

  if (work === "all-pending") {
    return order.packStatus === "READY";
  }

  if (work === "old-pending") {
    return order.packStatus === "READY" && order.importedAt < startOfToday;
  }

  if (work === "problems") {
    return order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM" || order.status === "PROBLEM";
  }

  return order.packStatus !== "PACKED" && order.importedAt >= startOfToday;
}
