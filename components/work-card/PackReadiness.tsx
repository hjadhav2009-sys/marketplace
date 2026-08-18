import type { WorkStage } from "@prisma/client";
import React from "react";
import type { PackReadinessModel } from "@/src/lib/workflow/grouped-work";

const LABELS: Record<WorkStage, string> = { PICK: "Pick", MARK: "Mark", ASSEMBLE: "Assembly", PACK: "Pack" };
const STATE_LABELS = { SATISFIED: "Complete", PENDING: "Pending", LOCKED: "Locked", PROBLEM: "Problem", NOT_REQUIRED: "Not required", MISSING: "Missing" } as const;
const STATE_CLASSES = {
  SATISFIED: "border-teal-200 bg-teal-50 text-teal-900",
  PENDING: "border-amber-200 bg-amber-50 text-amber-950",
  LOCKED: "border-slate-200 bg-slate-100 text-slate-700",
  PROBLEM: "border-rose-200 bg-rose-50 text-rose-900",
  NOT_REQUIRED: "border-slate-200 bg-white text-slate-600",
  MISSING: "border-rose-200 bg-rose-50 text-rose-900",
} as const;

function stageCopy(stage: WorkStage, model: PackReadinessModel) {
  const item = model.stages[stage];
  if (stage === "PACK" && item.state === "PENDING" && model.packReady) return "Ready";
  if (item.requiredCount > 0 && item.requiredCount < item.totalCount && item.state === "SATISFIED") return `Complete where required · ${item.totalCount - item.requiredCount} not required`;
  return STATE_LABELS[item.state];
}

export function PackReadiness({ model, title = "Package readiness" }: { model: PackReadinessModel; title?: string }) {
  return <section aria-label={title} data-pack-readiness>
    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {(Object.keys(LABELS) as WorkStage[]).map((stage) => {
        const item = model.stages[stage];
        return <div key={stage} className={`min-w-0 rounded-md border px-2.5 py-2 ${STATE_CLASSES[item.state]}`} data-pack-stage={stage} data-pack-state={item.state}>
          <p className="text-xs font-semibold">{LABELS[stage]}</p>
          <p className="mt-0.5 break-words text-xs leading-4">{stageCopy(stage, model)}</p>
        </div>;
      })}
    </div>
  </section>;
}
