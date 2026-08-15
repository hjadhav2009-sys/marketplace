"use client";

import { useId, useState } from "react";
import type { WorkStage } from "@prisma/client";
import { completeExactPickRouteAction, completeGroupedStageAction } from "@/app/work/stage-actions";
import { ROUTE_CHANGE_REASONS } from "@/src/lib/workflow/route-decision-policy";
import { SubmitButton } from "@/components/SubmitButton";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { useWorkerOverlay } from "@/components/worker-overlay/WorkerOverlay";
import { humanProcessRoute, WorkProcessFlow } from "./WorkProcessFlow";

type Route = "DIRECT_PACK" | "MARK" | "ASSEMBLE" | "MARK_ASSEMBLE";
type Option = { route: Route; label: string; flow: string; nextStage: WorkStage };
const OPTIONS: Option[] = [
  { route: "DIRECT_PACK", label: "Direct to Pack", flow: "PICK_PACK", nextStage: "PACK" },
  { route: "MARK", label: "Send to Marking", flow: "PICK_MARK_PACK", nextStage: "MARK" },
  { route: "ASSEMBLE", label: "Send to Assembly", flow: "PICK_ASSEMBLE_PACK", nextStage: "ASSEMBLE" },
  { route: "MARK_ASSEMBLE", label: "Marking then Assembly", flow: "PICK_MARK_ASSEMBLE_PACK", nextStage: "MARK" },
];

export type WorkRouteDialogCard = { stage: WorkStage; sourceType: "ORDER" | "CONSIGNMENT"; groupKey: string; groupVersion: string; taskId?: string; completedQuantity: number; hasExplicitSavedRoute: boolean; savedProcessRoute: string | null; missingInstructionStages: WorkStage[] };
function optionsFor(card: WorkRouteDialogCard) { if (card.stage === "PICK") return OPTIONS; if (card.stage === "MARK") return OPTIONS.filter((option) => option.route === "DIRECT_PACK" || option.route === "ASSEMBLE"); return OPTIONS.filter((option) => option.route === "DIRECT_PACK"); }
function overlayId(card: WorkRouteDialogCard) { return `process-flow:${card.sourceType}:${card.groupKey}`; }

function openDescriptor(card: WorkRouteDialogCard) {
  return { id: overlayId(card), kind: "PROCESS_FLOW" as const, surface: "dialog" as const, title: "Choose processing flow", content: <RouteDialogContent card={card} /> };
}

export function WorkRouteDialogC1A({ card }: { card: WorkRouteDialogCard }) {
  const { openOverlay } = useWorkerOverlay();
  const interactive = card.stage !== "PACK" && optionsFor(card).length > 1;
  return <WorkProcessFlow currentStage={card.stage} route={card.savedProcessRoute} fallback={!card.hasExplicitSavedRoute} onActivate={interactive ? () => openOverlay(openDescriptor(card)) : undefined} />;
}

export function WorkRouteActionButton({ card, label }: { card: WorkRouteDialogCard; label: string }) {
  const { openOverlay } = useWorkerOverlay();
  return <button type="button" onClick={() => openOverlay(openDescriptor(card))} className={buttonStyles({ className: "w-full" })}>{label}</button>;
}

function RouteDialogContent({ card }: { card: WorkRouteDialogCard }) {
  const { closeOverlay } = useWorkerOverlay();
  const [selected, setSelected] = useState<Option | null>(null);
  const [routeReason, setRouteReason] = useState("");
  const requestId = useId();
  const options = optionsFor(card);
  const recommendedNext = card.savedProcessRoute === "PICK_MARK_ASSEMBLE_PACK" && card.stage === "MARK" ? "ASSEMBLE" : "PACK";
  const reasonRequired = Boolean(selected && card.hasExplicitSavedRoute && (card.stage === "PICK" ? selected.flow !== card.savedProcessRoute : selected.nextStage !== recommendedNext));
  const missing = selected ? [selected.nextStage, ...(card.stage === "PICK" && selected.route === "MARK_ASSEMBLE" ? ["ASSEMBLE" as WorkStage] : [])].filter((stage) => card.missingInstructionStages.includes(stage)) : [];
  const isRecommended = (option: Option) => card.stage === "PICK" ? card.hasExplicitSavedRoute ? option.flow === card.savedProcessRoute : option.route === "DIRECT_PACK" : option.nextStage === recommendedNext;
  const finalLabel = selected ? card.stage === "PICK" ? `Complete Pick & Send to ${selected.nextStage === "PACK" ? "Pack" : selected.nextStage === "MARK" ? "Marking" : "Assembly"}` : `Complete ${card.stage === "MARK" ? "Marking" : "Assembly"} & Send to ${selected.nextStage === "PACK" ? "Pack" : "Assembly"}` : "Choose flow";

  if (!selected) return <div className="grid gap-4">
    <FeedbackBanner tone="info" title={card.hasExplicitSavedRoute ? `Current: ${humanProcessRoute(card.savedProcessRoute)}` : "Current: Pick → Pack"}>{card.hasExplicitSavedRoute ? "Follow the saved product flow or choose another valid forward route." : "System fallback. No override reason is required."}</FeedbackBanner>
    <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <button key={option.route} type="button" onClick={() => setSelected(option)} className={`min-h-12 rounded-md border px-3 py-2 text-left text-sm font-semibold hover:border-berry ${isRecommended(option) ? "border-teal-500 bg-teal-50 text-teal-950" : "border-slate-200 bg-white text-slate-900"}`}>{humanProcessRoute(option.flow)}<span className="mt-1 block text-xs font-medium text-slate-600">{option.label}{isRecommended(option) ? " · Recommended" : ""}</span></button>)}</div>
    <button type="button" onClick={() => closeOverlay()} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Cancel</button>
  </div>;

  return <form action={card.stage === "PICK" ? completeExactPickRouteAction : completeGroupedStageAction} className="grid gap-4">
    <input type="hidden" name="stage" value={card.stage}/><input type="hidden" name="sourceType" value={card.sourceType}/><input type="hidden" name="groupKey" value={card.groupKey}/><input type="hidden" name="groupVersion" value={card.groupVersion}/><input type="hidden" name="taskId" value={card.taskId}/><input type="hidden" name="expectedQuantity" value={card.completedQuantity}/><input type="hidden" name="route" value={selected.route}/><input type="hidden" name="nextStage" value={selected.nextStage}/><input type="hidden" name="useRecommended" value="0"/><input type="hidden" name="clientRequestId" value={`${card.groupKey}:${card.groupVersion}:${requestId}`}/>
    <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected flow</p><p className="mt-1 font-semibold text-slate-950">{humanProcessRoute(selected.flow)}</p></div>
    {reasonRequired ? <fieldset><legend className="text-sm font-semibold text-slate-900">Why are you changing the saved route?</legend><div className="mt-2 flex flex-wrap gap-2">{ROUTE_CHANGE_REASONS.map((reason) => <label key={reason} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm font-semibold ${routeReason === reason ? "border-berry bg-pink-50 text-berry" : "border-slate-200 bg-white text-slate-700"}`}><input type="radio" name="routeReason" value={reason} required checked={routeReason === reason} onChange={() => setRouteReason(reason)} className="sr-only" />{reason}</label>)}</div></fieldset> : null}
    {reasonRequired && routeReason === "Other" ? <label className="text-sm font-semibold">Short route-change reason<textarea name="routeOtherReason" required maxLength={240} className={fieldControlStyles({ className: "mt-2 min-h-24" })} /></label> : null}
    {missing.length ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Saved instructions are unavailable for {missing.join(" and ").toLowerCase()}.</p><p className="mt-1">No machine settings or directions will be invented.</p><label className="mt-3 flex min-h-11 items-start gap-2 font-semibold"><input type="checkbox" name="confirmMissingInstructions" value="1" required className="mt-1 h-5 w-5"/>I understand and want to continue.</label></div> : null}
    <details className="rounded-md border border-slate-200 px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Add note (optional)</summary><textarea name="workerNote" maxLength={240} className={fieldControlStyles({ className: "mb-3 min-h-20" })} /></details>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setSelected(null); setRouteReason(""); }} className={buttonStyles({ variant: "secondary" })}>Back</button><SubmitButton pendingText="Routing...">{finalLabel}</SubmitButton></div>
  </form>;
}
