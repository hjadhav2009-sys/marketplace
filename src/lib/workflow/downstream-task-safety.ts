import type { WorkStage, WorkTaskStatus } from "@prisma/client";
import { canonicalInstructionFingerprint } from "./work-group-projection";

type ExistingDownstreamTask = {
  stage: WorkStage;
  status: WorkTaskStatus;
  completedQuantity: number;
  assignedUserId: string | null;
  startedAt: Date | null;
  workCardSnapshotJson: string | null;
  metadataJson: string | null;
};

export function assertReusableDownstreamTask(task: ExistingDownstreamTask, input: {
  stage: WorkStage;
  workCardSnapshotJson: string | null;
  metadataJson: string | null;
  allowAssignedReady?: boolean;
}) {
  if (!["LOCKED", "READY"].includes(task.status)) throw new Error(`${task.stage} work already has state ${task.status}; rerouting cannot replace it.`);
  if (task.completedQuantity !== 0 || task.startedAt || task.assignedUserId && !(input.allowAssignedReady && task.status === "READY")) throw new Error(`${task.stage} work was already assigned or started; rerouting cannot replace it.`);
  if (task.workCardSnapshotJson !== input.workCardSnapshotJson) throw new Error(`${task.stage} work has different immutable product or route provenance.`);
  if (canonicalInstructionFingerprint(task.metadataJson, input.stage) !== canonicalInstructionFingerprint(input.metadataJson, input.stage)) throw new Error(`${task.stage} work has different immutable instructions.`);
}
