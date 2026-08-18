import type { Prisma, PrismaClient, User, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";
import { assertWorkerAccountAccess, userCanManageConsignmentTasks, userCanResolveConsignmentProblems, userCanMutateStage, userCanViewAllConsignmentWork } from "./worker-access";
import { canViewCustomerOrderProblem } from "./universal-resolver";

type Client = PrismaClient;
export type ProblemSource = "ORDER" | "CONSIGNMENT";
export type ProblemStageFilter = "ALL" | WorkStage;

export type ProblemWorkspaceWorker = {
  id: string;
  name: string;
};

export type ProblemWorkspaceItem = {
  id: string;
  source: ProblemSource;
  marketplace: string;
  reference: string;
  sellerSku: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  stage: WorkStage;
  reason: string;
  note: string | null;
  requiredQuantity: number;
  completedQuantity: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
  reporterName: string | null;
  reportedAt: Date;
  taskId: string;
  taskStatusBefore: string | null;
  canResolve: boolean;
  canReassign: boolean;
  eligibleWorkers: ProblemWorkspaceWorker[];
  detailsHref: string;
};

function orderVisibility(user: Pick<User, "id" | "role" | "canPack" | "canViewAllWork">): Prisma.ProblemOrderWhereInput {
  return canViewCustomerOrderProblem(user, { reportedByIds: [] }) ? {} : { reportedById: user.id };
}

function consignmentVisibility(user: User): Prisma.WorkTaskWhereInput {
  return userCanViewAllConsignmentWork(user) ? {} : { OR: [{ assignedUserId: user.id }, { problemReportedByUserId: user.id }] };
}

export async function getProblemsWorkspace(input: {
  actorUserId: string;
  accountId: string;
  requestedSource?: string;
  stage?: ProblemStageFilter;
  page?: number;
  pageSize?: number;
}, client: Client = prisma) {
  const { user, account } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  const capability = marketplaceCapabilities(account.marketplace);
  const stage = input.stage && ["PICK", "MARK", "ASSEMBLE", "PACK"].includes(input.stage) ? input.stage : "ALL";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 50);
  const orderWhere: Prisma.ProblemOrderWhereInput = {
    accountId: input.accountId,
    status: "OPEN",
    workTaskId: { not: null },
    interruptedStage: stage === "ALL" ? { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] } : stage,
    ...orderVisibility(user),
  };
  const consignmentWhere: Prisma.WorkTaskWhereInput = {
    accountId: input.accountId,
    sourceType: "CONSIGNMENT",
    status: "PROBLEM",
    stage: stage === "ALL" ? { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] } : stage,
    ...consignmentVisibility(user),
  };
  const countOrderWhere = { ...orderWhere, interruptedStage: { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] as WorkStage[] } };
  const countConsignmentWhere = { ...consignmentWhere, stage: { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] as WorkStage[] } };
  const [orderCount, consignmentCount] = await Promise.all([
    capability.dailyOrders ? client.problemOrder.count({ where: countOrderWhere }) : Promise.resolve(0),
    capability.consignments ? client.workTask.count({ where: countConsignmentWhere }) : Promise.resolve(0),
  ]);
  const availableSources: ProblemSource[] = [
    ...(capability.dailyOrders ? ["ORDER" as const] : []),
    ...(capability.consignments ? ["CONSIGNMENT" as const] : []),
  ];
  const requested = availableSources.includes(input.requestedSource as ProblemSource) ? input.requestedSource as ProblemSource : null;
  const source = requested
    ?? (orderCount > 0 && consignmentCount === 0 && availableSources.includes("ORDER") ? "ORDER" : null)
    ?? (consignmentCount > 0 && orderCount === 0 && availableSources.includes("CONSIGNMENT") ? "CONSIGNMENT" : null)
    ?? availableSources[0]
    ?? "CONSIGNMENT";

  let items: ProblemWorkspaceItem[] = [];
  let total = 0;
  if (source === "ORDER" && capability.dailyOrders) {
    const [problems, count] = await Promise.all([
      client.problemOrder.findMany({
        where: orderWhere,
        select: {
          id: true, reason: true, details: true, interruptedStage: true, workTaskId: true, taskStatusBefore: true, createdAt: true,
          reportedBy: { select: { name: true, username: true } },
          order: { select: { id: true, marketplace: true, trackingId: true, awb: true, orderNo: true, sku: true, qty: true, productDescription: true, imageUrl: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      }),
      client.problemOrder.count({ where: orderWhere }),
    ]);
    const taskIds = problems.flatMap((problem) => problem.workTaskId ? [problem.workTaskId] : []);
    const tasks = taskIds.length ? await client.workTask.findMany({ where: { id: { in: taskIds }, accountId: input.accountId, sourceType: "ORDER" }, select: { id: true, requiredQuantity: true, completedQuantity: true, assignedUser: { select: { name: true } } } }) : [];
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    items = problems.flatMap((problem) => {
      if (!problem.interruptedStage || !problem.workTaskId) return [];
      const task = taskMap.get(problem.workTaskId);
      if (!task) return [];
      return [{ id: problem.id, source: "ORDER" as const, marketplace: problem.order.marketplace, reference: problem.order.trackingId ?? problem.order.awb ?? problem.order.orderNo, sellerSku: problem.order.sku, productTitle: problem.order.productDescription, productImageUrl: problem.order.imageUrl, stage: problem.interruptedStage, reason: problem.reason, note: problem.details, requiredQuantity: task.requiredQuantity || problem.order.qty, completedQuantity: task.completedQuantity, assignedUserId: null, assignedUserName: task.assignedUser?.name ?? null, reporterName: problem.reportedBy?.name ?? problem.reportedBy?.username ?? null, reportedAt: problem.createdAt, taskId: problem.workTaskId, taskStatusBefore: problem.taskStatusBefore, canResolve: user.role === "OWNER", canReassign: false, eligibleWorkers: [], detailsHref: `/packing/${encodeURIComponent(problem.order.awb)}` }];
    });
    total = count;
  } else if (capability.consignments) {
    const canManage = userCanManageConsignmentTasks(user);
    const [tasks, count, workers] = await Promise.all([
      client.workTask.findMany({
        where: consignmentWhere,
        select: {
          id: true, stage: true, requiredQuantity: true, completedQuantity: true, assignedUserId: true, problemReason: true, problemReportedAt: true, statusBeforeProblem: true,
          assignedUser: { select: { name: true } }, problemReportedBy: { select: { name: true, username: true } },
          consignmentLine: { select: { id: true, sellerSkuSnapshot: true, sellerSkuSource: true, productTitleSnapshot: true, productNameSource: true, productImageSnapshot: true, barcodeSnapshot: true, consignmentBatch: { select: { marketplace: true, externalConsignmentNumber: true } } } },
        },
        orderBy: [{ problemReportedAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      }),
      client.workTask.count({ where: consignmentWhere }),
      canManage ? client.user.findMany({ where: { active: true, OR: [{ accountId: input.accountId }, { assignedAccounts: { some: { id: input.accountId } } }] }, select: { id: true, name: true, role: true, canPick: true, canMark: true, canAssemble: true, canPack: true } }) : Promise.resolve([]),
    ]);
    items = tasks.flatMap((task) => {
      if (!task.consignmentLine) return [];
      const eligibleWorkers = workers.filter((worker) => userCanMutateStage(worker, task.stage)).map((worker) => ({ id: worker.id, name: worker.name }));
      return [{ id: task.id, source: "CONSIGNMENT" as const, marketplace: String(task.consignmentLine.consignmentBatch.marketplace), reference: task.consignmentLine.consignmentBatch.externalConsignmentNumber, sellerSku: task.consignmentLine.sellerSkuSnapshot ?? task.consignmentLine.sellerSkuSource, productTitle: task.consignmentLine.productTitleSnapshot ?? task.consignmentLine.productNameSource, productImageUrl: task.consignmentLine.productImageSnapshot, stage: task.stage, reason: task.problemReason ?? "Operational problem", note: task.consignmentLine.barcodeSnapshot ? `Barcode ${task.consignmentLine.barcodeSnapshot}` : null, requiredQuantity: task.requiredQuantity, completedQuantity: task.completedQuantity, assignedUserId: task.assignedUserId, assignedUserName: task.assignedUser?.name ?? null, reporterName: task.problemReportedBy?.name ?? task.problemReportedBy?.username ?? null, reportedAt: task.problemReportedAt ?? new Date(0), taskId: task.id, taskStatusBefore: task.statusBeforeProblem, canResolve: userCanResolveConsignmentProblems(user), canReassign: canManage, eligibleWorkers, detailsHref: `/work/consignments/items/${encodeURIComponent(task.id)}` }];
    });
    total = count;
  }

  return { user, account, capability, counts: { ORDER: orderCount, CONSIGNMENT: consignmentCount }, source, stage, page, pageSize, total, hasPrevious: page > 1, hasNext: page * pageSize < total, items };
}
