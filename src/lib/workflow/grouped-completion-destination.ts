import type { WorkStage } from "@prisma/client";
import { parseWorkRouteSnapshot, recommendedNextStage, type WorkRouteSnapshotV2 } from "./dynamic-route";
import { resolveForwardStageEligibility } from "./route-stage-eligibility";

export type GroupedCompletionDestination = {
  nextStage: WorkStage | undefined;
  preselected: boolean;
};

export function resolveGroupedCompletionDestination(input: {
  snapshot: WorkRouteSnapshotV2;
  currentStage: WorkStage;
  requestedNextStage?: WorkStage;
  useRecommendedNextStage?: boolean;
}): GroupedCompletionDestination {
  if (input.currentStage === "PACK") return { nextStage: undefined, preselected: false };

  if (input.currentStage === "MARK") {
    const eligibility = resolveForwardStageEligibility({
      currentStage: input.currentStage,
      selectedStages: input.snapshot.actualStages,
      completedStages: input.snapshot.completedStages,
    });
    if (eligibility.valid && eligibility.preselectedNextStage) {
      if (input.requestedNextStage && input.requestedNextStage !== eligibility.preselectedNextStage) {
        throw new Error("The next processing stage is already selected. Complete Marking to continue.");
      }
      return { nextStage: eligibility.preselectedNextStage, preselected: true };
    }
  }

  return {
    nextStage: input.useRecommendedNextStage
      ? recommendedNextStage(input.snapshot, input.currentStage)
      : input.requestedNextStage,
    preselected: false,
  };
}

export function advanceGroupedRouteSnapshot(input: {
  snapshot: WorkRouteSnapshotV2;
  currentStage: WorkStage;
  nextStage: WorkStage | undefined;
  actorUserId: string;
  useRecommendedNextStage: boolean;
  preselected: boolean;
}): WorkRouteSnapshotV2 {
  const completedStages = [...new Set([...input.snapshot.completedStages, input.currentStage])];
  if (input.preselected) {
    return {
      ...input.snapshot,
      routeVersion: input.snapshot.routeVersion + 1,
      currentStage: input.nextStage ?? input.currentStage,
      selectedNextStage: input.nextStage,
      actualStages: input.snapshot.actualStages,
      completedStages,
      decisions: input.snapshot.decisions,
    };
  }
  return {
    ...input.snapshot,
    routeVersion: input.snapshot.routeVersion + 1,
    currentStage: input.nextStage ?? input.currentStage,
    selectedNextStage: input.nextStage,
    actualStages: input.nextStage ? [...input.snapshot.actualStages, input.nextStage] : input.snapshot.actualStages,
    completedStages,
    decisions: input.nextStage
      ? [...input.snapshot.decisions, {
          fromStage: input.currentStage,
          toStage: input.nextStage,
          actorUserId: input.actorUserId,
          decidedAt: new Date().toISOString(),
          reason: input.useRecommendedNextStage ? "DEFAULT" : "WORKER_SELECTION",
        }]
      : input.snapshot.decisions,
  };
}

export function assertPreparedPreselectedDownstreamTask(task: {
  accountId: string;
  sourceType: "ORDER" | "CONSIGNMENT";
  orderId: string | null;
  consignmentLineId: string | null;
  stage: WorkStage;
  sequenceNumber: number;
  status: string;
  completedQuantity: number;
  assignedUserId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  workCardSnapshotJson: string | null;
  routeSnapshotJson: string | null;
}, input: {
  accountId: string;
  sourceType: "ORDER" | "CONSIGNMENT";
  orderId: string | null;
  consignmentLineId: string | null;
  stage: WorkStage;
  sequenceNumber: number;
  workCardSnapshotJson: string | null;
  routeSnapshot: WorkRouteSnapshotV2;
}) {
  if (
    task.accountId !== input.accountId ||
    task.sourceType !== input.sourceType ||
    task.orderId !== input.orderId ||
    task.consignmentLineId !== input.consignmentLineId ||
    task.stage !== input.stage ||
    task.sequenceNumber !== input.sequenceNumber
  ) throw new Error("The selected downstream work no longer matches this Mark task.");
  if (task.status !== "LOCKED" || task.completedQuantity !== 0 || task.assignedUserId || task.startedAt || task.completedAt) {
    throw new Error(`${task.stage === "ASSEMBLE" ? "Assembly" : "Packing"} work is no longer safely locked for Mark completion.`);
  }
  if (task.workCardSnapshotJson !== input.workCardSnapshotJson) {
    throw new Error(`${task.stage === "ASSEMBLE" ? "Assembly" : "Packing"} work has different immutable product provenance.`);
  }
  const downstreamSnapshot = parseWorkRouteSnapshot(task.routeSnapshotJson);
  if (
    !downstreamSnapshot ||
    downstreamSnapshot.routeVersion !== input.routeSnapshot.routeVersion ||
    JSON.stringify(downstreamSnapshot.actualStages) !== JSON.stringify(input.routeSnapshot.actualStages) ||
    JSON.stringify(downstreamSnapshot.completedStages) !== JSON.stringify(input.routeSnapshot.completedStages) ||
    JSON.stringify(downstreamSnapshot.decisions) !== JSON.stringify(input.routeSnapshot.decisions)
  ) throw new Error(`${task.stage === "ASSEMBLE" ? "Assembly" : "Packing"} work has different immutable route provenance.`);
}
