import type { WorkStage } from "@prisma/client";

const WORK_STAGES = new Set<WorkStage>(["PICK", "MARK", "ASSEMBLE", "PACK"]);

function forwardCandidates(currentStage: WorkStage): WorkStage[] {
  if (currentStage === "PICK") return ["MARK", "ASSEMBLE", "PACK"];
  if (currentStage === "MARK") return ["ASSEMBLE", "PACK"];
  if (currentStage === "ASSEMBLE") return ["PACK"];
  return [];
}

function validStageList(stages: WorkStage[]) {
  return stages.every((stage) => WORK_STAGES.has(stage)) && new Set(stages).size === stages.length;
}

export function resolveForwardStageEligibility(input: {
  currentStage: WorkStage;
  selectedStages: WorkStage[];
  completedStages: WorkStage[];
}) {
  const valid = validStageList(input.selectedStages) && validStageList(input.completedStages);
  const candidates = forwardCandidates(input.currentStage);
  if (!valid) return { valid: false, selectableStages: candidates, preselectedNextStage: null } as const;

  const selectableStages = candidates.filter(
    (stage) => !input.selectedStages.includes(stage) && !input.completedStages.includes(stage),
  );
  const currentIndex = input.selectedStages.indexOf(input.currentStage);
  const preselectedNextStage = currentIndex < 0
    ? null
    : input.selectedStages.slice(currentIndex + 1).find((stage) => !input.completedStages.includes(stage)) ?? null;

  return { valid: true, selectableStages, preselectedNextStage } as const;
}

export function selectableForwardStages(
  currentStage: WorkStage,
  selectedStages: WorkStage[],
  completedStages: WorkStage[],
) {
  return resolveForwardStageEligibility({ currentStage, selectedStages, completedStages }).selectableStages;
}
