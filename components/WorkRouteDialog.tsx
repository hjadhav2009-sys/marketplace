"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkStage } from "@prisma/client";
import { completeExactPickRouteAction, completeGroupedStageAction } from "@/app/work/stage-actions";
import { ROUTE_CHANGE_REASONS } from "@/src/lib/workflow/route-decision-policy";
import { SubmitButton } from "./SubmitButton";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { fieldControlStyles } from "./ui/Field";
import { buttonStyles } from "./ui/buttonStyles";

type Route = "DIRECT_PACK" | "MARK" | "ASSEMBLE" | "MARK_ASSEMBLE";
type Option = { route: Route; label: string; nextStage: WorkStage };
const OPTIONS: Option[] = [
  { route: "DIRECT_PACK", label: "Direct to Pack", nextStage: "PACK" },
  { route: "MARK", label: "Send to Marking", nextStage: "MARK" },
  { route: "ASSEMBLE", label: "Send to Assembly", nextStage: "ASSEMBLE" },
  { route: "MARK_ASSEMBLE", label: "Marking then Assembly", nextStage: "MARK" }
];
const PROCESS_ROUTE: Record<Route, string> = {
  DIRECT_PACK: "PICK_PACK",
  MARK: "PICK_MARK_PACK",
  ASSEMBLE: "PICK_ASSEMBLE_PACK",
  MARK_ASSEMBLE: "PICK_MARK_ASSEMBLE_PACK"
};

export type WorkRouteDialogCard = {
  stage: WorkStage;
  sourceType: "ORDER" | "CONSIGNMENT";
  groupKey: string;
  groupVersion: string;
  taskId?: string;
  completedQuantity: number;
  hasExplicitSavedRoute: boolean;
  savedProcessRoute: string | null;
  missingInstructionStages: WorkStage[];
};

export function WorkRouteDialog({ card, triggerLabel }: { card: WorkRouteDialogCard; triggerLabel: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const [routeReason, setRouteReason] = useState("");
  const [requestNonce, setRequestNonce] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const options = card.stage === "PICK"
    ? OPTIONS
    : card.stage === "MARK"
      ? OPTIONS.filter((option) => option.nextStage === "PACK" || option.nextStage === "ASSEMBLE")
      : OPTIONS.filter((option) => option.nextStage === "PACK");
  const recommendedNext = card.savedProcessRoute === "PICK_MARK_ASSEMBLE_PACK" && card.stage === "MARK" ? "ASSEMBLE" : "PACK";
  const reasonRequired = Boolean(selected && card.hasExplicitSavedRoute && (card.stage === "PICK" ? PROCESS_ROUTE[selected.route] !== card.savedProcessRoute : selected.nextStage !== recommendedNext));
  const missing = selected
    ? [selected.nextStage, ...(card.stage === "PICK" && selected.route === "MARK_ASSEMBLE" ? ["ASSEMBLE" as WorkStage] : [])].filter((stage) => card.missingInstructionStages.includes(stage))
    : [];

  const close = () => {
    setOpen(false);
    setSelected(null);
    setRouteReason("");
    setRequestNonce("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    if (!requestNonce) setRequestNonce(crypto.randomUUID());
    const dialog = dialogRef.current;
    window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>("button, select, textarea, input:not([type=hidden]), [href]")?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([type=hidden]):not([disabled]), [href]")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open, requestNonce]);

  const isRecommended = (option: Option) => card.stage === "PICK"
    ? card.hasExplicitSavedRoute ? PROCESS_ROUTE[option.route] === card.savedProcessRoute : option.route === "DIRECT_PACK"
    : option.nextStage === recommendedNext;
  const hidden = selected ? <>
    <input type="hidden" name="stage" value={card.stage}/>
    <input type="hidden" name="sourceType" value={card.sourceType}/>
    <input type="hidden" name="groupKey" value={card.groupKey}/>
    <input type="hidden" name="groupVersion" value={card.groupVersion}/>
    <input type="hidden" name="taskId" value={card.taskId}/>
    <input type="hidden" name="expectedQuantity" value={card.completedQuantity}/>
    <input type="hidden" name="route" value={selected.route}/>
    <input type="hidden" name="nextStage" value={selected.nextStage}/>
    <input type="hidden" name="useRecommended" value="0"/>
    <input type="hidden" name="clientRequestId" value={requestNonce}/>
  </> : null;

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={buttonStyles({ className: "w-full" })}>{triggerLabel}</button>
    {open ? (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" data-work-reason-dialog>
        <button type="button" aria-label="Close route dialog" className="absolute inset-0 bg-slate-950/50" onClick={close}/>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="route-dialog-title" className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-berry">Complete {card.stage.toLowerCase()}</p>
              <h2 id="route-dialog-title" className="text-xl font-semibold">{selected ? selected.label : "Choose the next route"}</h2>
            </div>
            <button type="button" aria-label="Close" onClick={close} className={buttonStyles({ variant: "secondary", className: "px-2 text-xl" })}>×</button>
          </div>
          {!selected ? <>
            <FeedbackBanner className="mt-2" tone="info" title={card.hasExplicitSavedRoute ? `Saved route: ${card.savedProcessRoute?.replaceAll("_", " ")}` : "System fallback — Direct to Pack"} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <button
                  key={option.route}
                  type="button"
                  onClick={() => { setSelected(option); setRouteReason(""); }}
                  className={`min-h-12 rounded-md border px-3 py-2 text-left text-sm font-semibold hover:border-berry ${isRecommended(option) ? "border-blue-400 bg-blue-50" : ""}`}
                >
                  {option.label}
                  {isRecommended(option) ? <span className="mt-1 block text-xs text-blue-800">Recommended</span> : null}
                </button>
              ))}
            </div>
          </> : (
            <form action={card.stage === "PICK" ? completeExactPickRouteAction : completeGroupedStageAction} className="mt-4 grid gap-3">
              {hidden}
              {reasonRequired ? (
                <label className="text-sm font-semibold">
                  Why are you changing the saved route?
                  <select autoFocus name="routeReason" required value={routeReason} onChange={(event) => setRouteReason(event.currentTarget.value)} className={fieldControlStyles({ className: "mt-2" })}>
                    <option value="">Choose a reason</option>
                    {ROUTE_CHANGE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
                  </select>
                </label>
              ) : null}
              {reasonRequired && routeReason === "Other" ? <label className="text-sm font-semibold">Short route-change reason<textarea name="routeOtherReason" required maxLength={240} className={fieldControlStyles({ className: "mt-2 min-h-24" })} placeholder="Enter a short operational reason"/></label> : null}
              {missing.length ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Saved instructions are unavailable for {missing.join(" and ").toLowerCase()}.</p>
                  <p className="mt-1">No machine settings or directions will be invented.</p>
                  <label className="mt-3 flex items-start gap-2 font-bold"><input type="checkbox" name="confirmMissingInstructions" value="1" required className="mt-1 h-5 w-5"/>I understand and want to continue.</label>
                </div>
              ) : !card.hasExplicitSavedRoute ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">System fallback selection: {selected.label}. No override reason is required.</p> : null}
              <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Add note (optional)</summary><textarea name="workerNote" maxLength={240} className={fieldControlStyles({ className: "mt-2 min-h-20" })} placeholder="Operational note for the next worker"/></details>
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setSelected(null); setRouteReason(""); }} className={buttonStyles({ variant: "secondary" })}>Cancel</button><SubmitButton pendingText="Routing...">Continue</SubmitButton></div>
            </form>
          )}
        </div>
      </div>
    ) : null}
  </>;
}
