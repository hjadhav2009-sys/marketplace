"use client";

import { useEffect, useState } from "react";
import type { WorkStage } from "@prisma/client";
import { completeExactPickRouteAction, completeGroupedStageAction } from "@/app/work/stage-actions";
import { SubmitButton } from "./SubmitButton";

type Route = "DIRECT_PACK" | "MARK" | "ASSEMBLE" | "MARK_ASSEMBLE";
type Option = { route: Route; label: string; nextStage: WorkStage };
const OPTIONS: Option[] = [
  { route: "DIRECT_PACK", label: "Direct to Pack", nextStage: "PACK" },
  { route: "MARK", label: "Send to Marking", nextStage: "MARK" },
  { route: "ASSEMBLE", label: "Send to Assembly", nextStage: "ASSEMBLE" },
  { route: "MARK_ASSEMBLE", label: "Marking then Assembly", nextStage: "MARK" }
];
const PROCESS_ROUTE: Record<Route, string> = { DIRECT_PACK: "PICK_PACK", MARK: "PICK_MARK_PACK", ASSEMBLE: "PICK_ASSEMBLE_PACK", MARK_ASSEMBLE: "PICK_MARK_ASSEMBLE_PACK" };

export type WorkRouteDialogCard = { stage: WorkStage; sourceType: "ORDER" | "CONSIGNMENT"; groupKey: string; groupVersion: string; taskId?: string; completedQuantity: number; hasExplicitSavedRoute: boolean; savedProcessRoute: string | null; missingInstructionStages: WorkStage[] };

export function WorkRouteDialog({ card, triggerLabel }: { card: WorkRouteDialogCard; triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const [requestNonce, setRequestNonce] = useState("");
  const options = card.stage === "PICK" ? OPTIONS : card.stage === "MARK" ? OPTIONS.filter(option => option.nextStage === "PACK" || option.nextStage === "ASSEMBLE") : OPTIONS.filter(option => option.nextStage === "PACK");
  const recommendedNext = card.savedProcessRoute === "PICK_MARK_ASSEMBLE_PACK" && card.stage === "MARK" ? "ASSEMBLE" : "PACK";
  const reasonRequired = Boolean(selected && card.hasExplicitSavedRoute && (card.stage === "PICK" ? PROCESS_ROUTE[selected.route] !== card.savedProcessRoute : selected.nextStage !== recommendedNext));
  const missing = selected ? [selected.nextStage, ...(card.stage === "PICK" && selected.route === "MARK_ASSEMBLE" ? ["ASSEMBLE" as WorkStage] : [])].filter(stage => card.missingInstructionStages.includes(stage)) : [];

  useEffect(() => {
    if (!open) return;
    if (!requestNonce) setRequestNonce(crypto.randomUUID());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, requestNonce]);

  const close = () => { setOpen(false); setSelected(null); setRequestNonce(""); };
  const hidden = selected ? <>
    <input type="hidden" name="stage" value={card.stage}/><input type="hidden" name="sourceType" value={card.sourceType}/>
    <input type="hidden" name="groupKey" value={card.groupKey}/><input type="hidden" name="groupVersion" value={card.groupVersion}/>
    <input type="hidden" name="taskId" value={card.taskId}/><input type="hidden" name="expectedQuantity" value={card.completedQuantity}/>
    <input type="hidden" name="route" value={selected.route}/><input type="hidden" name="nextStage" value={selected.nextStage}/>
    <input type="hidden" name="useRecommended" value="0"/><input type="hidden" name="clientRequestId" value={requestNonce}/>
    {reasonRequired ? <input type="hidden" name="routeReason" value="Other"/> : null}
    {missing.length ? <input type="hidden" name="confirmMissingInstructions" value="1"/> : null}
  </> : null;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-xl bg-slate-950 px-3 font-black text-white">{triggerLabel}</button>
    {open ? <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" data-work-reason-dialog>
      <button type="button" aria-label="Close route dialog" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" onClick={close}/>
      <div role="dialog" aria-modal="true" aria-labelledby="route-dialog-title" className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-berry">Complete {card.stage.toLowerCase()}</p><h2 id="route-dialog-title" className="text-xl font-black">{selected ? selected.label : "Choose the next route"}</h2></div><button type="button" aria-label="Close" onClick={close} className="min-h-11 min-w-11 rounded-xl border text-xl">×</button></div>
        {!selected ? <><p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm font-bold">{card.hasExplicitSavedRoute ? `Saved route: ${card.savedProcessRoute?.replaceAll("_", " ")}` : "SYSTEM FALLBACK — DIRECT TO PACK"}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{options.map(option => <button key={option.route} type="button" onClick={() => setSelected(option)} className="min-h-12 rounded-xl border px-3 text-left text-sm font-black hover:border-berry">{option.label}</button>)}</div></> :
          <form action={card.stage === "PICK" ? completeExactPickRouteAction : completeGroupedStageAction} className="mt-4 grid gap-3">{hidden}
            {reasonRequired ? <label className="text-sm font-black">Why are you changing the saved route?<textarea autoFocus name="routeOtherReason" required maxLength={240} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="Enter a short operational reason"/></label> : null}
            {missing.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-black">Saved instructions are unavailable.</p><p className="mt-1">You may add a note before continuing. No machine settings or directions will be invented.</p></div> : !card.hasExplicitSavedRoute ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">System fallback selection: {selected.label}. No override reason is required.</p> : null}
            <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-black">Add note (optional)</summary><textarea name="workerNote" maxLength={240} className="mt-2 min-h-20 w-full rounded-xl border p-3" placeholder="Operational note for the next worker"/></details>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-xl border font-black">Cancel</button><SubmitButton pendingText="Routing...">Continue</SubmitButton></div>
          </form>}
      </div>
    </div> : null}
  </>;
}
