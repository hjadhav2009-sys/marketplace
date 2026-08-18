export type OrderPackAssignment = {
  assignedUserId: string | null;
};

export type OrderPackActorEligibility = {
  eligible: boolean;
  assignmentConflict: boolean;
  assignedUserIds: string[];
  reason: string | null;
};

export function resolveOrderPackActorEligibility(input: {
  actorUserId: string;
  packTasks: OrderPackAssignment[];
}): OrderPackActorEligibility {
  const assignedUserIds = [...new Set(
    input.packTasks
      .map((task) => task.assignedUserId)
      .filter((assignedUserId): assignedUserId is string => Boolean(assignedUserId)),
  )].sort();
  const assignmentConflict = assignedUserIds.some((assignedUserId) => assignedUserId !== input.actorUserId);

  return {
    eligible: !assignmentConflict,
    assignmentConflict,
    assignedUserIds,
    reason: assignmentConflict ? "Packing work is assigned to another worker." : null,
  };
}
