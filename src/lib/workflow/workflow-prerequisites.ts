import type { Prisma, PrismaClient, WorkStage, WorkTaskStatus } from "@prisma/client";
import { parseWorkRouteSnapshot } from "./dynamic-route";

type Client = PrismaClient | Prisma.TransactionClient;

export const WORKFLOW_STAGES = ["PICK", "MARK", "ASSEMBLE", "PACK"] as const satisfies readonly WorkStage[];
export type WorkflowPrerequisiteState = "SATISFIED" | "PENDING" | "LOCKED" | "PROBLEM" | "NOT_REQUIRED" | "MISSING";
export type WorkflowStagePrerequisite = { stage: WorkStage; required: boolean; state: WorkflowPrerequisiteState; taskId: string | null };
export type WorkflowPrerequisiteSummary = {
  stages: Record<WorkStage, WorkflowStagePrerequisite>;
  packReady: boolean;
  blocker: string | null;
};

type TaskLike = { id: string; stage: WorkStage; status: WorkTaskStatus; routeSnapshotJson: string | null };
type OrderLike = { id: string; pickStatus: string; packStatus: string; status: string };

function stateForTask(task: TaskLike | undefined, required: boolean): WorkflowPrerequisiteState {
  if (!required) return "NOT_REQUIRED";
  if (!task) return "MISSING";
  if (task.status === "COMPLETED" || task.status === "SKIPPED") return "SATISFIED";
  if (task.status === "PROBLEM" || task.status === "CANCELLED") return "PROBLEM";
  if (task.status === "LOCKED") return "LOCKED";
  return "PENDING";
}

function blockerFor(stages: Record<WorkStage, WorkflowStagePrerequisite>) {
  for (const stage of ["PICK", "MARK", "ASSEMBLE"] as const) {
    const value = stages[stage];
    if (value.state === "SATISFIED" || value.state === "NOT_REQUIRED") continue;
    const label = stage === "PICK" ? "Picking" : stage === "MARK" ? "Marking" : "Assembly";
    if (value.state === "PROBLEM") return `${label} has problem work.`;
    if (value.state === "MISSING") return `${label} is required but its work task is missing.`;
    return `${label} is required before packing.`;
  }
  return null;
}

export function deriveOrderWorkflowPrerequisites(order: OrderLike, tasks: TaskLike[]): WorkflowPrerequisiteSummary {
  const byStage = new Map(tasks.map(task => [task.stage, task]));
  const snapshot = tasks.map(task => parseWorkRouteSnapshot(task.routeSnapshotJson)).find(Boolean);
  const required = new Set<WorkStage>(snapshot?(snapshot.decisions.length?snapshot.actualStages:snapshot.recommendedStages):tasks.map(task => task.stage));
  required.add("PICK");
  required.add("PACK");
  const stages = Object.fromEntries(WORKFLOW_STAGES.map(stage => {
    const task = byStage.get(stage);
    let state = stateForTask(task, required.has(stage));
    if (stage === "PICK" && !task && order.pickStatus === "PICKED") state = "SATISFIED";
    if (stage === "PACK" && order.packStatus === "PACKED") state = "SATISFIED";
    if ((order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM") && stage !== "PACK") state = "PROBLEM";
    return [stage, { stage, required: required.has(stage), state, taskId: task?.id ?? null }];
  })) as Record<WorkStage, WorkflowStagePrerequisite>;
  const blocker = blockerFor(stages);
  const packState = stages.PACK.state;
  return { stages, blocker, packReady: blocker === null && (packState === "PENDING" || packState === "SATISFIED") };
}

function aggregateStage(stage: WorkStage, summaries: WorkflowPrerequisiteSummary[]): WorkflowStagePrerequisite {
  const entries = summaries.map(summary => summary.stages[stage]);
  const required = entries.some(entry => entry.required);
  const order: WorkflowPrerequisiteState[] = ["PROBLEM", "MISSING", "LOCKED", "PENDING", "SATISFIED", "NOT_REQUIRED"];
  const state = required ? order.find(candidate => entries.some(entry => entry.required && entry.state === candidate)) ?? "MISSING" : "NOT_REQUIRED";
  return { stage, required, state, taskId: null };
}

export function aggregateWorkflowPrerequisites(summaries: WorkflowPrerequisiteSummary[]): WorkflowPrerequisiteSummary {
  const stages = Object.fromEntries(WORKFLOW_STAGES.map(stage => [stage, aggregateStage(stage, summaries)])) as Record<WorkStage, WorkflowStagePrerequisite>;
  const blocker = blockerFor(stages);
  return { stages, blocker, packReady: summaries.length > 0 && summaries.every(summary => summary.packReady) && blocker === null };
}

export async function resolveOrderShipmentWorkflowPrerequisites(input: { accountId: string; orderIds: string[] }, client: Client) {
  const orderIds = [...new Set(input.orderIds)];
  const [orders, tasks] = await Promise.all([
    client.order.findMany({ where: { accountId: input.accountId, id: { in: orderIds } }, select: { id: true, pickStatus: true, packStatus: true, status: true } }),
    client.workTask.findMany({ where: { accountId: input.accountId, sourceType: "ORDER", orderId: { in: orderIds } }, select: { id: true, orderId: true, stage: true, status: true, routeSnapshotJson: true } })
  ]);
  const byOrder = new Map<string, typeof tasks>();
  for (const task of tasks) if (task.orderId) byOrder.set(task.orderId, [...(byOrder.get(task.orderId) ?? []), task]);
  const perOrder = new Map(orders.map(order => [order.id, deriveOrderWorkflowPrerequisites(order, byOrder.get(order.id) ?? [])]));
  return { perOrder, package: aggregateWorkflowPrerequisites([...perOrder.values()]) };
}

export async function resolveConsignmentLineWorkflowPrerequisites(input: { accountId: string; consignmentLineId: string }, client: Client) {
  const tasks = await client.workTask.findMany({ where: { accountId: input.accountId, sourceType: "CONSIGNMENT", consignmentLineId: input.consignmentLineId }, select: { id: true, stage: true, status: true, routeSnapshotJson: true } });
  return deriveOrderWorkflowPrerequisites({ id: input.consignmentLineId, pickStatus: "READY", packStatus: tasks.find(task => task.stage === "PACK")?.status === "COMPLETED" ? "PACKED" : "READY", status: "READY" }, tasks);
}
