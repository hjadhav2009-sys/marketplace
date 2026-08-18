"use client";

import { useId, useState } from "react";
import { universalCandidateAction } from "@/app/work/scan/actions";
import { ROUTE_CHANGE_REASONS } from "@/src/lib/workflow/route-decision-policy";
import type { UniversalWorkCandidate, UniversalScanIntent, UniversalSourceFilter } from "@/src/lib/workflow/universal-resolver";
import { SubmitButton } from "./SubmitButton";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { fieldControlStyles } from "./ui/Field";
import { buttonStyles } from "./ui/buttonStyles";
import { useWorkerOverlay } from "./worker-overlay/WorkerOverlay";

type NextStage = "ASSEMBLE" | "PACK";

function savedNextStage(route: string | null): NextStage | null {
  if (route === "PICK_MARK_ASSEMBLE_PACK") return "ASSEMBLE";
  if (route === "PICK_MARK_PACK") return "PACK";
  return null;
}

function destinationLabel(stage: NextStage) {
  return stage === "ASSEMBLE" ? "Assembly" : "Pack";
}

export function ScannerMarkRouteDialog({
  candidate,
  scan,
}: {
  candidate: UniversalWorkCandidate;
  scan: { returnPath: string; code: string; intent: UniversalScanIntent; sourceFilter: UniversalSourceFilter; accountFilter?: string };
}) {
  const { openOverlay } = useWorkerOverlay();
  const decision = candidate.stageRouteDecision;
  if (!decision || !decision.selectableNextStages.length || !candidate.taskVersion) return null;

  return <button
    type="button"
    className={buttonStyles({ className: "w-full" })}
    onClick={() => openOverlay({
      id: `scanner-mark-route:${candidate.candidateKey}`,
      kind: "PROCESS_FLOW",
      surface: "dialog",
      title: "Choose Marking destination",
      content: <ScannerMarkRouteForm candidate={candidate} scan={scan} />,
    })}
  >Marking Completed</button>;
}

function ScannerMarkRouteForm({ candidate, scan }: Parameters<typeof ScannerMarkRouteDialog>[0]) {
  const decision = candidate.stageRouteDecision!;
  const [selected, setSelected] = useState<NextStage | null>(null);
  const [routeReason, setRouteReason] = useState("");
  const requestId = useId();
  const recommended = savedNextStage(decision.savedProcessRoute);
  const reasonRequired = Boolean(selected && decision.hasExplicitSavedRoute && selected !== recommended);
  const missingInstructions = selected === "ASSEMBLE" && decision.missingInstructionStages.includes("ASSEMBLE");

  if (!selected) return <div className="grid gap-4">
    <FeedbackBanner tone={decision.routeDegraded ? "warning" : "info"} title="Marking is ready to complete">
      Choose the next authorized stage. The scanner uses the same Process Flow rules as the Mark workspace.
    </FeedbackBanner>
    {decision.savedProcessRoute ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
      Saved product default: <strong>{decision.savedProcessRoute === "PICK_MARK_ASSEMBLE_PACK" ? "Pick → Mark → Assembly → Pack" : decision.savedProcessRoute === "PICK_MARK_PACK" ? "Pick → Mark → Pack" : decision.savedProcessRoute.replaceAll("_", " → ")}</strong>
    </p> : <p className="text-sm text-slate-600">No explicit saved Marking destination is available. Every valid route remains visible.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {decision.selectableNextStages.map((stage) => <button
        key={stage}
        type="button"
        onClick={() => { setSelected(stage); setRouteReason(""); }}
        className={`min-h-12 rounded-md border px-3 py-3 text-left text-sm font-semibold ${recommended === stage ? "border-teal-500 bg-teal-50 text-teal-950" : "border-slate-200 bg-white text-slate-900 hover:border-berry"}`}
      >Send to {destinationLabel(stage)}{recommended === stage ? <span className="mt-1 block text-xs">Recommended</span> : null}</button>)}
    </div>
  </div>;

  return <form action={universalCandidateAction} className="grid gap-4">
    <input type="hidden" name="returnPath" value={scan.returnPath}/>
    <input type="hidden" name="code" value={scan.code}/>
    <input type="hidden" name="intent" value={scan.intent}/>
    <input type="hidden" name="source" value={scan.sourceFilter}/>
    <input type="hidden" name="accountFilter" value={scan.accountFilter ?? ""}/>
    <input type="hidden" name="accountId" value={candidate.accountId}/>
    <input type="hidden" name="sourceId" value={candidate.sourceId}/>
    <input type="hidden" name="action" value="TASK_MARK_ROUTE"/>
    <input type="hidden" name="nextStage" value={selected}/>
    <input type="hidden" name="expectedQuantity" value={candidate.completedQuantity}/>
    <input type="hidden" name="expectedVersion" value={candidate.taskVersion}/>
    <input type="hidden" name="expectedStatus" value={candidate.status}/>
    <input type="hidden" name="clientRequestId" value={`scanner:${candidate.candidateKey}:${candidate.taskVersion}:${requestId}`}/>
    <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected destination</p><p className="mt-1 font-semibold text-slate-950">Marking → {destinationLabel(selected)}</p></div>
    {reasonRequired ? <label className="text-sm font-semibold text-slate-900">Why are you changing the saved route?
      <select name="routeReason" required value={routeReason} onChange={(event) => setRouteReason(event.currentTarget.value)} className={fieldControlStyles({ className: "mt-2" })}>
        <option value="">Choose a reason</option>
        {ROUTE_CHANGE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
      </select>
    </label> : null}
    {reasonRequired && routeReason === "Other" ? <label className="text-sm font-semibold text-slate-900">Short route-change reason<textarea name="routeOtherReason" required maxLength={240} className={fieldControlStyles({ className: "mt-2 min-h-24" })}/></label> : null}
    {missingInstructions ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Saved Assembly instructions are unavailable.</p><p className="mt-1">No machine settings or directions will be invented.</p><label className="mt-3 flex min-h-11 items-start gap-2 font-semibold"><input type="checkbox" name="confirmMissingInstructions" value="1" required className="mt-1 h-5 w-5"/>I understand and want to continue.</label></div> : null}
    <details className="rounded-md border border-slate-200 px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Add note (optional)</summary><textarea name="workerNote" maxLength={240} className={fieldControlStyles({ className: "mb-3 min-h-20" })}/></details>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelected(null)} className={buttonStyles({ variant: "secondary" })}>Back</button><SubmitButton pendingText="Routing...">Complete & send</SubmitButton></div>
  </form>;
}
