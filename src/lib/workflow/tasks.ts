import type { ProcessRoute, WorkStage, WorkTaskStatus } from "@prisma/client";

const ROUTE_STAGES: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"]
};

export type TaskPlanItem = { stage: WorkStage; sequenceNumber: number; requiredQuantity: number; completedQuantity: number; status: WorkTaskStatus };

export function getRequiredStages(route: ProcessRoute) {
  return [...ROUTE_STAGES[route]];
}

export function buildTaskPlan(route: ProcessRoute, quantity: number): TaskPlanItem[] {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Required quantity must be a positive integer.");
  return getRequiredStages(route).map((stage, index) => ({
    stage,
    sequenceNumber: index + 1,
    requiredQuantity: quantity,
    completedQuantity: 0,
    status: index === 0 ? "READY" : "LOCKED"
  }));
}

export function getNextStage(route: ProcessRoute, stage: WorkStage) {
  const stages = getRequiredStages(route);
  const index = stages.indexOf(stage);
  return index >= 0 ? stages[index + 1] ?? null : null;
}

export function canAdvanceTask(task: Pick<TaskPlanItem, "status" | "requiredQuantity" | "completedQuantity">, completedQuantity: number) {
  if (task.status === "COMPLETED") return completedQuantity === task.completedQuantity;
  return (task.status === "READY" || task.status === "IN_PROGRESS") && completedQuantity >= 0 && completedQuantity <= task.requiredQuantity;
}

export function validateTaskTransition(task: Pick<TaskPlanItem, "status" | "requiredQuantity" | "completedQuantity">, completedQuantity: number) {
  if (!Number.isInteger(completedQuantity) || completedQuantity < 0 || completedQuantity > task.requiredQuantity) return { valid: false, reason: "INVALID_QUANTITY" as const };
  if (task.status === "LOCKED") return { valid: false, reason: "LOCKED" as const };
  if (task.status === "COMPLETED") return { valid: completedQuantity === task.completedQuantity, reason: completedQuantity === task.completedQuantity ? null : "ALREADY_COMPLETED" as const };
  if (task.status !== "READY" && task.status !== "IN_PROGRESS") return { valid: false, reason: "INVALID_STATUS" as const };
  return { valid: true, reason: null };
}
