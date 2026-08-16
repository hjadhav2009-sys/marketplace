import React from "react";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import type { AssemblyGuidanceModel } from "@/src/lib/workflow/assembly-guidance";
import { WorkCardState } from "./WorkCardSections";

export function AssemblyGuidance({ guidance, missing = false }: { guidance: AssemblyGuidanceModel | null; missing?: boolean }) {
  if (!guidance) return <WorkCardState tone="danger" title="Assembly instructions unavailable">Saved Assembly instructions are unavailable. No settings or directions have been invented.</WorkCardState>;
  return <section className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3" aria-label="Assembly guidance" data-assembly-guidance>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assembly</p><h3 className="mt-1 break-words font-semibold text-slate-950">{guidance.title}</h3></div>
      <span className="shrink-0 text-xs font-semibold text-slate-500">{guidance.source === "MANUAL" ? "Manual" : "Saved"}</span>
    </div>
    {guidance.manualWarning ? <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm font-medium text-amber-950">{guidance.manualWarning}</p> : null}
    <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{guidance.instructions}</p>
    {guidance.workerNote ? <p className="whitespace-pre-wrap break-words text-sm font-medium text-slate-700">Worker note: {guidance.workerNote}</p> : null}
    {guidance.imageUrl ? <div className="flex items-center gap-3"><WorkImageGallery images={[guidance.imageUrl]} alt={`${guidance.title} reference`} compact/><p className="text-sm text-slate-600">Open the saved Assembly reference image.</p></div> : null}
    {missing ? <p className="text-sm font-semibold text-rose-800">Required Assembly guidance is incomplete.</p> : null}
  </section>;
}

export function AssemblyDetails({ guidance }: { guidance: AssemblyGuidanceModel }) {
  return <div className="grid gap-3"><h3 className="font-semibold text-slate-950">{guidance.title}</h3>{guidance.manualWarning ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">{guidance.manualWarning}</p> : null}<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{guidance.instructions}</p>{guidance.workerNote ? <p className="whitespace-pre-wrap text-sm font-medium text-slate-700">Worker note: {guidance.workerNote}</p> : null}{guidance.imageUrl ? <WorkImageGallery images={[guidance.imageUrl]} alt={`${guidance.title} reference`}/> : null}</div>;
}
