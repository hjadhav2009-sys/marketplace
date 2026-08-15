import type { WorkStage } from "@prisma/client";
import React from "react";

const ROUTES: Record<string, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"],
};

const LABELS: Record<WorkStage, string> = { PICK: "Pick", MARK: "Mark", ASSEMBLE: "Assembly", PACK: "Pack" };

export function processRouteStages(route: string | null | undefined): WorkStage[] {
  return route && ROUTES[route] ? ROUTES[route] : ["PICK", "PACK"];
}

export function humanProcessRoute(route: string | null | undefined) {
  return processRouteStages(route).map((stage) => LABELS[stage]).join(" → ");
}

export function WorkProcessFlow({ currentStage, route, onActivate, fallback = false }: { currentStage: WorkStage; route: string | null | undefined; onActivate?: () => void; fallback?: boolean }) {
  const stages = processRouteStages(route);
  const currentIndex = Math.max(0, stages.indexOf(currentStage));
  const content = <>
    <span className="block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Process flow</span>
    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-sm" aria-label={`${humanProcessRoute(route)}. Current stage ${LABELS[currentStage]}.`}>
      {stages.map((stage, index) => <span key={stage} className="contents">
        {index ? <span aria-hidden="true" className="text-slate-400">→</span> : null}
        <span className={index < currentIndex ? "font-medium text-teal-700" : index === currentIndex ? "font-semibold text-slate-950" : "font-medium text-slate-500"}>
          {LABELS[stage]}{index < currentIndex ? <span className="sr-only"> completed</span> : null}
          {index < currentIndex ? <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-1 inline h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2"><path d="m3 8 3 3 7-7" /></svg> : null}
        </span>
      </span>)}
      {onActivate ? <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto h-4 w-4 shrink-0 fill-none stroke-current text-berry" strokeWidth="1.8"><path d="m6 3 5 5-5 5" /></svg> : null}
    </span>
    {fallback ? <span className="mt-1 block text-xs text-slate-500">System fallback</span> : null}
  </>;

  return onActivate
    ? <button type="button" onClick={onActivate} className="min-h-11 w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50">{content}</button>
    : <div className="min-h-11 px-2 py-1.5">{content}</div>;
}
